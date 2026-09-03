-- ============================================================================
-- KHARCHAA BACHAT — PHASE 4: INITIAL PRIVATE HOUSEHOLD SEED
-- ============================================================================

-- 1. Remove auth.users FK dependency from profiles
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;

-- 2. Seed Srujan and Disha profiles in the private household
INSERT INTO public.profiles (id, display_name, household_id)
VALUES 
  ('11111111-1111-1111-1111-111111111112', 'Srujan', '11111111-1111-1111-1111-111111111111'),
  ('11111111-1111-1111-1111-111111111113', 'Disha', '11111111-1111-1111-1111-111111111111')
ON CONFLICT (id) DO UPDATE 
  SET display_name = EXCLUDED.display_name, household_id = EXCLUDED.household_id;

-- 3. Initial allowance configuration (₹50 = 5000 paise)
INSERT INTO public.allowance_config (household_id, daily_rate_paise, effective_from)
VALUES ('11111111-1111-1111-1111-111111111111', 5000, CURRENT_DATE)
ON CONFLICT (household_id, effective_from) DO NOTHING;

-- 4. Catch up allowance for today
SELECT process_household_allowances('11111111-1111-1111-1111-111111111111', CURRENT_DATE);
