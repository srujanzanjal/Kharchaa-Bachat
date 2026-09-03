-- ============================================================================
-- KHARCHAA BACHAT — PHASE 6: SECURITY HARDENING & IDEMPOTENCY
-- ============================================================================

-- 1. Add idempotency_key to expenses table to prevent duplicate charges
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'expenses' AND column_name = 'idempotency_key'
  ) THEN
    ALTER TABLE public.expenses ADD COLUMN idempotency_key uuid DEFAULT NULL;
    ALTER TABLE public.expenses ADD CONSTRAINT unique_household_idempotency UNIQUE (household_id, idempotency_key);
  END IF;
END $$;

-- 2. Update record_expense_atomic with profiles row-locking and idempotency check
CREATE OR REPLACE FUNCTION record_expense_atomic(
  p_household_id          uuid,
  p_created_by            uuid,
  p_total_amount_paise    integer,
  p_owner                 expense_owner,
  p_srujan_amount_paise   integer,
  p_disha_amount_paise    integer,
  p_note                  text DEFAULT NULL,
  p_coverage_approved     boolean DEFAULT false,
  p_coverage_from_name    text DEFAULT NULL,
  p_coverage_amount_paise integer DEFAULT 0,
  p_idempotency_key       uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_srujan_id           uuid;
  v_disha_id            uuid;
  v_coverage_from_id    uuid := NULL;
  v_srujan_balance      bigint := 0;
  v_disha_balance       bigint := 0;
  v_new_expense_id      uuid;
  v_existing_expense_id uuid;
BEGIN
  -- Strict input validation
  IF p_total_amount_paise <= 0 THEN
    RAISE EXCEPTION 'Expense amount must be greater than 0.';
  END IF;

  IF (p_srujan_amount_paise + p_disha_amount_paise) <> p_total_amount_paise THEN
    RAISE EXCEPTION 'Contribution amounts (% + %) do not equal total expense amount (%).',
      p_srujan_amount_paise, p_disha_amount_paise, p_total_amount_paise;
  END IF;

  -- 1. Check for idempotent replay
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing_expense_id 
    FROM expenses 
    WHERE household_id = p_household_id AND idempotency_key = p_idempotency_key;

    IF v_existing_expense_id IS NOT NULL THEN
      -- Already committed safely! Replay existing record ID without re-debiting.
      RETURN jsonb_build_object(
        'success', true,
        'expense_id', v_existing_expense_id,
        'idempotent_replay', true
      );
    END IF;
  END IF;

  -- 2. Concurrency serialization: Lock profiles rows for the household (always exist)
  PERFORM 1 FROM profiles WHERE household_id = p_household_id FOR UPDATE;

  -- Also lock existing ledger rows for household
  PERFORM 1 FROM ledger WHERE household_id = p_household_id FOR UPDATE;

  -- Look up user IDs
  SELECT id INTO v_srujan_id FROM profiles WHERE household_id = p_household_id AND lower(display_name) = 'srujan' LIMIT 1;
  SELECT id INTO v_disha_id FROM profiles WHERE household_id = p_household_id AND lower(display_name) = 'disha' LIMIT 1;

  IF v_srujan_id IS NULL OR v_disha_id IS NULL THEN
    RAISE EXCEPTION 'Both Srujan and Disha profile records must exist in the household.';
  END IF;

  -- Check current balances fresh after acquiring lock
  v_srujan_balance := get_user_balance_paise(v_srujan_id);
  v_disha_balance := get_user_balance_paise(v_disha_id);

  -- STRICT NEGATIVE BALANCE PREVENTIONS:
  IF p_srujan_amount_paise > 0 AND (v_srujan_balance - p_srujan_amount_paise) < 0 THEN
    RAISE EXCEPTION 'Srujan balance cannot become negative. Available: %, Requested: %',
      v_srujan_balance, p_srujan_amount_paise;
  END IF;

  IF p_disha_amount_paise > 0 AND (v_disha_balance - p_disha_amount_paise) < 0 THEN
    RAISE EXCEPTION 'Disha balance cannot become negative. Available: %, Requested: %',
      v_disha_balance, p_disha_amount_paise;
  END IF;

  -- Set coverage_from ID if applicable
  IF p_coverage_from_name IS NOT NULL THEN
    IF lower(p_coverage_from_name) = 'srujan' THEN
      v_coverage_from_id := v_srujan_id;
    ELSIF lower(p_coverage_from_name) = 'disha' THEN
      v_coverage_from_id := v_disha_id;
    END IF;
  END IF;

  -- 3. Insert expense record
  INSERT INTO expenses (
    household_id,
    created_by,
    total_amount_paise,
    owner,
    srujan_amount_paise,
    disha_amount_paise,
    note,
    coverage_approved,
    coverage_from,
    coverage_amount_paise,
    idempotency_key
  ) VALUES (
    p_household_id,
    p_created_by,
    p_total_amount_paise,
    p_owner,
    p_srujan_amount_paise,
    p_disha_amount_paise,
    p_note,
    p_coverage_approved,
    v_coverage_from_id,
    p_coverage_amount_paise,
    p_idempotency_key
  )
  RETURNING id INTO v_new_expense_id;

  -- 4. Insert debit ledger entry for Srujan (if non-zero)
  IF p_srujan_amount_paise > 0 THEN
    INSERT INTO ledger (
      household_id,
      user_id,
      entry_type,
      amount_paise,
      reference_id,
      description
    ) VALUES (
      p_household_id,
      v_srujan_id,
      'expense_debit',
      -p_srujan_amount_paise,
      v_new_expense_id,
      COALESCE(p_note, 'Expense') || ' (Srujan share)'
    );
  END IF;

  -- 5. Insert debit ledger entry for Disha (if non-zero)
  IF p_disha_amount_paise > 0 THEN
    INSERT INTO ledger (
      household_id,
      user_id,
      entry_type,
      amount_paise,
      reference_id,
      description
    ) VALUES (
      p_household_id,
      v_disha_id,
      'expense_debit',
      -p_disha_amount_paise,
      v_new_expense_id,
      COALESCE(p_note, 'Expense') || ' (Disha share)'
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'expense_id', v_new_expense_id,
    'srujan_new_balance_paise', (v_srujan_balance - p_srujan_amount_paise),
    'disha_new_balance_paise', (v_disha_balance - p_disha_amount_paise)
  );
END;
$$;

-- 3. Lock down RPC functions: revoke execute on all public functions from anon, authenticated, public
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM public, anon, authenticated;
