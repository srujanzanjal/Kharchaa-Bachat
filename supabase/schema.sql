-- ============================================================================
-- KHARCHAA BACHAT — PHASE 3 COMPLETE SCHEMA
-- ============================================================================
-- Copy and paste this script directly into the Supabase SQL Editor
-- to initialize the database architecture.
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- 1. ENUM TYPES
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ledger_type') THEN
    CREATE TYPE ledger_type AS ENUM (
      'allowance',       -- Daily allowance credit
      'expense_debit',   -- Debit from an expense
      'manual_credit'    -- Future: manual addition
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'expense_owner') THEN
    CREATE TYPE expense_owner AS ENUM (
      'srujan',
      'disha',
      'both'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'expense_category') THEN
    CREATE TYPE expense_category AS ENUM (
      'food',
      'coffee_tea',
      'groceries',
      'sweets',
      'drinks',
      'other'
    );
  END IF;
END $$;

-- ============================================================================
-- 2. TABLES
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Table: profiles
-- Maps Supabase Auth identities (or local members) to household users.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS profiles (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name  text NOT NULL,
  household_id  uuid NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT check_display_name_non_empty CHECK (char_length(trim(display_name)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_profiles_household ON profiles(household_id);

-- ----------------------------------------------------------------------------
-- Table: allowance_config
-- Records daily allowance rate history per household.
-- Historical rows are NEVER updated or recalculated.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS allowance_config (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id      uuid NOT NULL,
  daily_rate_paise  integer NOT NULL DEFAULT 5000 CHECK (daily_rate_paise > 0), -- ₹50 = 5000 paise
  effective_from    date NOT NULL DEFAULT CURRENT_DATE,
  created_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT unique_household_effective_date UNIQUE (household_id, effective_from)
);

CREATE INDEX IF NOT EXISTS idx_allowance_config_lookup 
  ON allowance_config(household_id, effective_from DESC);

-- ----------------------------------------------------------------------------
-- Table: expenses
-- Metadata for all logged expenses.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS expenses (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id          uuid NOT NULL,
  created_by            uuid NOT NULL REFERENCES profiles(id),
  total_amount_paise    integer NOT NULL CHECK (total_amount_paise > 0),
  owner                 expense_owner NOT NULL,
  srujan_amount_paise   integer NOT NULL DEFAULT 0 CHECK (srujan_amount_paise >= 0),
  disha_amount_paise    integer NOT NULL DEFAULT 0 CHECK (disha_amount_paise >= 0),
  note                  text,
  coverage_approved     boolean NOT NULL DEFAULT false,
  coverage_from         uuid REFERENCES profiles(id) ON DELETE SET NULL,
  coverage_amount_paise integer NOT NULL DEFAULT 0 CHECK (coverage_amount_paise >= 0),
  idempotency_key       uuid DEFAULT NULL,
  category              expense_category NOT NULL DEFAULT 'other',
  created_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT unique_household_idempotency UNIQUE (household_id, idempotency_key),

  -- Critical financial constraint: contributions must exactly sum to total amount
  CONSTRAINT check_contributions_match_total 
    CHECK (srujan_amount_paise + disha_amount_paise = total_amount_paise)
);

CREATE INDEX IF NOT EXISTS idx_expenses_household ON expenses(household_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(household_id, category, created_at DESC);

-- ----------------------------------------------------------------------------
-- Table: ledger
-- The immutable, single source of financial truth.
-- Balance = SUM(credits) - SUM(debits).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ledger (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id    uuid NOT NULL,
  user_id         uuid NOT NULL REFERENCES profiles(id),
  entry_type      ledger_type NOT NULL,
  amount_paise    integer NOT NULL CHECK (amount_paise <> 0), -- positive: credit, negative: debit
  reference_id    uuid REFERENCES expenses(id) ON DELETE RESTRICT,
  allowance_date  date,
  description     text,
  created_at      timestamptz NOT NULL DEFAULT now(),

  -- Enforce that allowance entries must have an allowance_date
  CONSTRAINT check_allowance_date_present 
    CHECK ((entry_type = 'allowance' AND allowance_date IS NOT NULL) OR (entry_type <> 'allowance'))
);

-- Partial unique index guaranteeing idempotency:
-- Exactly one allowance credit per user per calendar date.
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_user_allowance_date 
  ON ledger (user_id, allowance_date) 
  WHERE (entry_type = 'allowance');

CREATE INDEX IF NOT EXISTS idx_ledger_household_user ON ledger(household_id, user_id);
CREATE INDEX IF NOT EXISTS idx_ledger_reference ON ledger(reference_id) WHERE reference_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ledger_created_at ON ledger(household_id, created_at DESC);

-- ============================================================================
-- 3. ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE allowance_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger ENABLE ROW LEVEL SECURITY;

-- Security helper function: extracts household_id for the authenticated session
CREATE OR REPLACE FUNCTION get_auth_household_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT household_id FROM profiles WHERE id = (select auth.uid());
$$;

-- Policies for profiles
DROP POLICY IF EXISTS "profiles_select_household" ON profiles;
CREATE POLICY "profiles_select_household" ON profiles
  FOR SELECT TO authenticated
  USING (household_id = (select get_auth_household_id()) OR id = (select auth.uid()));

DROP POLICY IF EXISTS "profiles_update_self" ON profiles;
CREATE POLICY "profiles_update_self" ON profiles
  FOR UPDATE TO authenticated
  USING (id = (select auth.uid()))
  WITH CHECK (id = (select auth.uid()));

-- Policies for allowance_config
DROP POLICY IF EXISTS "allowance_config_select_household" ON allowance_config;
CREATE POLICY "allowance_config_select_household" ON allowance_config
  FOR SELECT TO authenticated
  USING (household_id = (select get_auth_household_id()));

DROP POLICY IF EXISTS "allowance_config_insert_household" ON allowance_config;
CREATE POLICY "allowance_config_insert_household" ON allowance_config
  FOR INSERT TO authenticated
  WITH CHECK (household_id = (select get_auth_household_id()));

-- Policies for expenses
DROP POLICY IF EXISTS "expenses_select_household" ON expenses;
CREATE POLICY "expenses_select_household" ON expenses
  FOR SELECT TO authenticated
  USING (household_id = (select get_auth_household_id()));

DROP POLICY IF EXISTS "expenses_insert_household" ON expenses;
CREATE POLICY "expenses_insert_household" ON expenses
  FOR INSERT TO authenticated
  WITH CHECK (household_id = (select get_auth_household_id()));

-- Policies for ledger (append-only auditable ledger)
DROP POLICY IF EXISTS "ledger_select_household" ON ledger;
CREATE POLICY "ledger_select_household" ON ledger
  FOR SELECT TO authenticated
  USING (household_id = (select get_auth_household_id()));

-- ============================================================================
-- 4. FINANCIAL STORED PROCEDURES & LEDGER FUNCTIONS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Function: get_user_balance_paise(p_user_id)
-- Reconstructs user balance from raw ledger entries.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_user_balance_paise(p_user_id uuid)
RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(amount_paise), 0)::bigint
  FROM ledger
  WHERE user_id = p_user_id;
$$;

-- ----------------------------------------------------------------------------
-- Function: get_household_summary(p_household_id)
-- Returns aggregate balance state directly derived from ledger for both users.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_household_summary(p_household_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_srujan_id       uuid;
  v_disha_id        uuid;
  v_srujan_balance  bigint := 0;
  v_disha_balance   bigint := 0;
  v_combined        bigint := 0;
  v_daily_rate      integer := 5000;
BEGIN
  -- Look up Srujan & Disha IDs
  SELECT id INTO v_srujan_id
  FROM profiles
  WHERE household_id = p_household_id AND lower(display_name) = 'srujan'
  LIMIT 1;

  SELECT id INTO v_disha_id
  FROM profiles
  WHERE household_id = p_household_id AND lower(display_name) = 'disha'
  LIMIT 1;

  -- Reconstruct balances directly from ledger
  IF v_srujan_id IS NOT NULL THEN
    v_srujan_balance := get_user_balance_paise(v_srujan_id);
  END IF;

  IF v_disha_id IS NOT NULL THEN
    v_disha_balance := get_user_balance_paise(v_disha_id);
  END IF;

  v_combined := v_srujan_balance + v_disha_balance;

  -- Get current active daily allowance rate
  SELECT daily_rate_paise INTO v_daily_rate
  FROM allowance_config
  WHERE household_id = p_household_id
    AND effective_from <= CURRENT_DATE
  ORDER BY effective_from DESC, created_at DESC
  LIMIT 1;

  IF v_daily_rate IS NULL THEN
    v_daily_rate := 5000;
  END IF;

  RETURN jsonb_build_object(
    'household_id', p_household_id,
    'srujan', jsonb_build_object(
      'id', v_srujan_id,
      'balance_paise', v_srujan_balance
    ),
    'disha', jsonb_build_object(
      'id', v_disha_id,
      'balance_paise', v_disha_balance
    ),
    'combined_paise', v_combined,
    'daily_rate_paise', v_daily_rate
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- Function: process_household_allowances(p_household_id, p_target_date)
-- IDEMPOTENT CATCH-UP LOGIC.
-- Accrues missing daily allowance credits for each user up to p_target_date.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION process_household_allowances(
  p_household_id uuid,
  p_target_date  date DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user             RECORD;
  v_start_date       date;
  v_curr_date        date;
  v_rate_paise       integer;
  v_created_count    integer := 0;
  v_user_count       integer := 0;
BEGIN
  -- Loop through all members of this household
  FOR v_user IN 
    SELECT id, display_name, created_at::date as joined_date
    FROM profiles
    WHERE household_id = p_household_id
  LOOP
    v_user_count := v_user_count + 1;

    -- Find the last successfully processed allowance date for this user
    SELECT MAX(allowance_date) INTO v_start_date
    FROM ledger
    WHERE user_id = v_user.id
      AND entry_type = 'allowance';

    -- If user has never had an allowance, start from their profile joined_date
    IF v_start_date IS NULL THEN
      v_curr_date := v_user.joined_date;
    ELSE
      v_curr_date := v_start_date + 1;
    END IF;

    -- Process every missing calendar date up to the target date
    WHILE v_curr_date <= p_target_date LOOP
      -- Determine the active allowance rate for this specific calendar date
      SELECT daily_rate_paise INTO v_rate_paise
      FROM allowance_config
      WHERE household_id = p_household_id
        AND effective_from <= v_curr_date
      ORDER BY effective_from DESC, created_at DESC
      LIMIT 1;

      -- Default to 5000 paise (₹50) if no custom rate configured
      IF v_rate_paise IS NULL THEN
        v_rate_paise := 5000;
      END IF;

      -- Insert allowance credit idempotently via partial unique index
      INSERT INTO ledger (
        household_id,
        user_id,
        entry_type,
        amount_paise,
        allowance_date,
        description
      ) VALUES (
        p_household_id,
        v_user.id,
        'allowance',
        v_rate_paise,
        v_curr_date,
        'Daily allowance for ' || to_char(v_curr_date, 'YYYY-MM-DD')
      )
      ON CONFLICT (user_id, allowance_date) WHERE (entry_type = 'allowance')
      DO NOTHING;

      -- Check if inserted
      IF FOUND THEN
        v_created_count := v_created_count + 1;
      END IF;

      v_curr_date := v_curr_date + 1;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'processed', true,
    'household_id', p_household_id,
    'target_date', p_target_date,
    'users_checked', v_user_count,
    'allowances_created', v_created_count
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- Function: check_expense_coverage(...)
-- Evaluates an expense against balances to determine validity, shortfall, or coverage.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION check_expense_coverage(
  p_household_id        uuid,
  p_total_amount_paise  integer,
  p_owner               text,
  p_srujan_split_paise  integer DEFAULT NULL,
  p_disha_split_paise   integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_srujan_id       uuid;
  v_disha_id        uuid;
  v_srujan_balance  bigint := 0;
  v_disha_balance   bigint := 0;
  v_combined        bigint := 0;
  v_srujan_req      integer := 0;
  v_disha_req       integer := 0;
  v_shortfall       integer := 0;
  v_short_user      text := NULL;
  v_covering_user   text := NULL;
  v_adj_srujan      integer := 0;
  v_adj_disha       integer := 0;
BEGIN
  -- Look up Srujan & Disha IDs
  SELECT id INTO v_srujan_id FROM profiles WHERE household_id = p_household_id AND lower(display_name) = 'srujan' LIMIT 1;
  SELECT id INTO v_disha_id FROM profiles WHERE household_id = p_household_id AND lower(display_name) = 'disha' LIMIT 1;

  IF v_srujan_id IS NOT NULL THEN v_srujan_balance := get_user_balance_paise(v_srujan_id); END IF;
  IF v_disha_id IS NOT NULL THEN v_disha_balance := get_user_balance_paise(v_disha_id); END IF;
  v_combined := v_srujan_balance + v_disha_balance;

  -- 1. Collective insufficiency check
  IF p_total_amount_paise > v_combined THEN
    RETURN jsonb_build_object(
      'status', 'insufficient_combined_balance',
      'allowed', false,
      'total_amount_paise', p_total_amount_paise,
      'combined_balance_paise', v_combined,
      'message', 'Expense exceeds combined available balance.'
    );
  END IF;

  -- 2. Determine initial proposed split
  IF lower(p_owner) = 'srujan' THEN
    v_srujan_req := p_total_amount_paise;
    v_disha_req := 0;
  ELSIF lower(p_owner) = 'disha' THEN
    v_srujan_req := 0;
    v_disha_req := p_total_amount_paise;
  ELSIF lower(p_owner) = 'both' THEN
    IF p_srujan_split_paise IS NOT NULL AND p_disha_split_paise IS NOT NULL THEN
      IF (p_srujan_split_paise + p_disha_split_paise) <> p_total_amount_paise THEN
        RETURN jsonb_build_object('status', 'invalid_split', 'allowed', false, 'message', 'Custom split does not equal total amount.');
      END IF;
      v_srujan_req := p_srujan_split_paise;
      v_disha_req := p_disha_split_paise;
    ELSE
      -- Default 50/50 split
      v_srujan_req := p_total_amount_paise / 2;
      v_disha_req := p_total_amount_paise - v_srujan_req;
    END IF;
  ELSE
    RETURN jsonb_build_object('status', 'invalid_owner', 'allowed', false, 'message', 'Invalid owner specified.');
  END IF;

  -- 3. Check for individual shortfall
  -- Srujan-only: if Srujan cannot afford, cannot go negative
  IF lower(p_owner) = 'srujan' AND v_srujan_req > v_srujan_balance THEN
    RETURN jsonb_build_object(
      'status', 'insufficient_individual_balance',
      'allowed', false,
      'user', 'Srujan',
      'balance_paise', v_srujan_balance,
      'required_paise', v_srujan_req,
      'message', 'Srujan does not have enough balance for this individual expense.'
    );
  END IF;

  -- Disha-only: if Disha cannot afford, cannot go negative
  IF lower(p_owner) = 'disha' AND v_disha_req > v_disha_balance THEN
    RETURN jsonb_build_object(
      'status', 'insufficient_individual_balance',
      'allowed', false,
      'user', 'Disha',
      'balance_paise', v_disha_balance,
      'required_paise', v_disha_req,
      'message', 'Disha does not have enough balance for this individual expense.'
    );
  END IF;

  -- Shared expense: check if Srujan is short
  IF v_srujan_req > v_srujan_balance THEN
    v_shortfall := v_srujan_req - v_srujan_balance;
    v_short_user := 'Srujan';
    v_covering_user := 'Disha';
    v_adj_srujan := v_srujan_balance;
    v_adj_disha := v_disha_req + v_shortfall;

    -- Verify Disha has enough to cover the shortfall
    IF v_adj_disha > v_disha_balance THEN
      RETURN jsonb_build_object('status', 'cannot_cover', 'allowed', false, 'message', 'Partner does not have enough to cover shortfall.');
    END IF;

    RETURN jsonb_build_object(
      'status', 'needs_coverage',
      'allowed', true,
      'needs_coverage', true,
      'short_user', v_short_user,
      'covering_user', v_covering_user,
      'shortfall_paise', v_shortfall,
      'proposed_srujan_paise', v_srujan_req,
      'proposed_disha_paise', v_disha_req,
      'adjusted_srujan_paise', v_adj_srujan,
      'adjusted_disha_paise', v_adj_disha,
      'resulting_srujan_balance_paise', 0,
      'resulting_disha_balance_paise', (v_disha_balance - v_adj_disha)
    );
  END IF;

  -- Shared expense: check if Disha is short
  IF v_disha_req > v_disha_balance THEN
    v_shortfall := v_disha_req - v_disha_balance;
    v_short_user := 'Disha';
    v_covering_user := 'Srujan';
    v_adj_disha := v_disha_balance;
    v_adj_srujan := v_srujan_req + v_shortfall;

    -- Verify Srujan has enough to cover the shortfall
    IF v_adj_srujan > v_srujan_balance THEN
      RETURN jsonb_build_object('status', 'cannot_cover', 'allowed', false, 'message', 'Partner does not have enough to cover shortfall.');
    END IF;

    RETURN jsonb_build_object(
      'status', 'needs_coverage',
      'allowed', true,
      'needs_coverage', true,
      'short_user', v_short_user,
      'covering_user', v_covering_user,
      'shortfall_paise', v_shortfall,
      'proposed_srujan_paise', v_srujan_req,
      'proposed_disha_paise', v_disha_req,
      'adjusted_srujan_paise', v_adj_srujan,
      'adjusted_disha_paise', v_adj_disha,
      'resulting_disha_balance_paise', 0,
      'resulting_srujan_balance_paise', (v_srujan_balance - v_adj_srujan)
    );
  END IF;

  -- Both can comfortably cover their share
  RETURN jsonb_build_object(
    'status', 'ok',
    'allowed', true,
    'needs_coverage', false,
    'srujan_paise', v_srujan_req,
    'disha_paise', v_disha_req,
    'resulting_srujan_balance_paise', (v_srujan_balance - v_srujan_req),
    'resulting_disha_balance_paise', (v_disha_balance - v_disha_req)
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- Function: record_expense_atomic(...)
-- ATOMIC TRANSACTION EXECUTION:
-- 1. Locks relevant ledger rows for the household to prevent race conditions.
-- 2. Strictly validates resulting balance >= 0.
-- 3. Inserts into expenses.
-- 4. Inserts debit rows into ledger.
-- All operations succeed or all roll back together.
-- ----------------------------------------------------------------------------
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
  p_idempotency_key       uuid DEFAULT NULL,
  p_category              expense_category DEFAULT 'other'
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
    idempotency_key,
    category
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
    p_idempotency_key,
    p_category
  )
  RETURNING id INTO v_new_expense_id;

  -- 2. Insert debit ledger entry for Srujan (if non-zero)
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

  -- 3. Insert debit ledger entry for Disha (if non-zero)
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

  -- Return the created expense details and updated balances
  RETURN jsonb_build_object(
    'success', true,
    'expense_id', v_new_expense_id,
    'srujan_new_balance_paise', (v_srujan_balance - p_srujan_amount_paise),
    'disha_new_balance_paise', (v_disha_balance - p_disha_amount_paise)
  );
END;
$$;

-- ============================================================================
-- 5. INITIAL PRIVATE HOUSEHOLD SEED
-- ============================================================================
INSERT INTO public.profiles (id, display_name, household_id)
VALUES 
  ('11111111-1111-1111-1111-111111111112', 'Srujan', '11111111-1111-1111-1111-111111111111'),
  ('11111111-1111-1111-1111-111111111113', 'Disha', '11111111-1111-1111-1111-111111111111')
ON CONFLICT (id) DO UPDATE 
  SET display_name = EXCLUDED.display_name, household_id = EXCLUDED.household_id;

INSERT INTO public.allowance_config (household_id, daily_rate_paise, effective_from)
VALUES ('11111111-1111-1111-1111-111111111111', 5000, CURRENT_DATE)
ON CONFLICT (household_id, effective_from) DO NOTHING;

SELECT process_household_allowances('11111111-1111-1111-1111-111111111111', CURRENT_DATE);

-- 6. RPC LOCKDOWN: revoke execute on all public schema functions from anon, authenticated, public
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM public, anon, authenticated;



