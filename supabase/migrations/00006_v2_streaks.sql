-- ============================================================================
-- Migration: 00006_v2_streaks.sql
-- Description: V2-E Daily Earn Streaks + Bonus Rewards
-- ============================================================================

-- 1. Table: earn_streaks
CREATE TABLE IF NOT EXISTS earn_streaks (
  profile_id          uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  household_id        uuid NOT NULL,
  current_streak      integer NOT NULL DEFAULT 0,
  best_streak         integer NOT NULL DEFAULT 0,
  streak_started_on   date,
  last_qualifying_date date,
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_earn_streaks_household ON earn_streaks(household_id);

-- 2. Table: earn_streak_milestones
CREATE TABLE IF NOT EXISTS earn_streak_milestones (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id        uuid NOT NULL,
  profile_id          uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  milestone_days      integer NOT NULL,
  reward_paise        integer NOT NULL,
  streak_started_on   date NOT NULL,
  awarded_date        date NOT NULL,
  attempt_id          uuid REFERENCES earn_attempts(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unique_profile_milestone_progression UNIQUE (profile_id, milestone_days, streak_started_on)
);

CREATE INDEX IF NOT EXISTS idx_earn_streak_milestones_profile ON earn_streak_milestones(profile_id);
CREATE INDEX IF NOT EXISTS idx_earn_streak_milestones_household ON earn_streak_milestones(household_id);

-- 3. Initialize streak rows for existing profiles
INSERT INTO earn_streaks (profile_id, household_id, current_streak, best_streak)
SELECT id, household_id, 0, 0
FROM profiles
ON CONFLICT (profile_id) DO NOTHING;

-- 4. Enable RLS
ALTER TABLE earn_streaks ENABLE ROW LEVEL SECURITY;
ALTER TABLE earn_streak_milestones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "earn_streaks_select_household" ON earn_streaks;
CREATE POLICY "earn_streaks_select_household" ON earn_streaks
  FOR SELECT TO authenticated
  USING (household_id = (SELECT get_auth_household_id()));

DROP POLICY IF EXISTS "earn_streak_milestones_select_household" ON earn_streak_milestones;
CREATE POLICY "earn_streak_milestones_select_household" ON earn_streak_milestones
  FOR SELECT TO authenticated
  USING (household_id = (SELECT get_auth_household_id()));

-- 5. Upgraded Atomic reward claim stored procedure with streaks & milestone bonuses
CREATE OR REPLACE FUNCTION claim_earn_reward(
  p_household_id      uuid,
  p_profile_id        uuid,
  p_challenge_id      uuid,
  p_submitted_answer  text,
  p_idempotency_key   uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_challenge           RECORD;
  v_existing_attempt    RECORD;
  v_is_correct          boolean := false;
  v_game_reward_paise   integer := 0;
  v_streak_bonus_paise  integer := 0;
  v_milestone_days      integer := 0;
  v_today_ist           date;
  v_today_game_earned   integer := 0;
  v_remaining_game      integer;
  v_new_attempt_id      uuid;
  v_normalized_answer   text;
  v_normalized_correct  text;
  v_daily_game_limit    integer := 5000; -- ₹50 = 5000 paise game cap
  v_streak              RECORD;
  v_current_streak      integer := 0;
  v_best_streak         integer := 0;
  v_streak_started_on   date;
  v_milestone_reached   boolean := false;
  v_replayed_milestone  integer := 0;
  v_replayed_days       integer := 0;
BEGIN
  -- 0. Validate profile belongs to household
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = p_profile_id AND household_id = p_household_id
  ) THEN
    RAISE EXCEPTION 'Profile does not belong to this household.';
  END IF;

  -- 1. Check idempotency: return existing result if already processed
  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_existing_attempt
    FROM earn_attempts
    WHERE idempotency_key = p_idempotency_key;

    IF v_existing_attempt IS NOT NULL THEN
      -- Check if this attempt triggered a milestone
      SELECT
        COALESCE(SUM(reward_paise), 0),
        COALESCE(MAX(milestone_days), 0)
      INTO v_replayed_milestone, v_replayed_days
      FROM earn_streak_milestones
      WHERE attempt_id = v_existing_attempt.id;

      -- Get latest streak state for user
      SELECT * INTO v_streak FROM earn_streaks WHERE profile_id = p_profile_id;
      v_today_ist := (NOW() AT TIME ZONE 'Asia/Kolkata')::date;
      v_best_streak := COALESCE(v_streak.best_streak, 0);

      IF v_streak IS NULL OR v_streak.last_qualifying_date IS NULL OR v_streak.last_qualifying_date < (v_today_ist - INTERVAL '1 day')::date THEN
        v_current_streak := 0;
      ELSE
        v_current_streak := COALESCE(v_streak.current_streak, 0);
      END IF;

      RETURN jsonb_build_object(
        'success', true,
        'idempotent_replay', true,
        'attempt_id', v_existing_attempt.id,
        'is_correct', v_existing_attempt.is_correct,
        'reward_paise', v_existing_attempt.reward_paise,
        'streak_bonus_paise', v_replayed_milestone,
        'total_earned_paise', v_existing_attempt.reward_paise + v_replayed_milestone,
        'challenge_id', v_existing_attempt.challenge_id,
        'current_streak', v_current_streak,
        'best_streak', v_best_streak,
        'milestone_reached', (v_replayed_milestone > 0),
        'milestone_days', v_replayed_days
      );
    END IF;
  END IF;

  -- 2. Concurrency serialization: lock profiles for household
  PERFORM 1 FROM profiles WHERE household_id = p_household_id FOR UPDATE;

  -- 3. Verify challenge exists and is active
  SELECT * INTO v_challenge
  FROM earn_challenges
  WHERE id = p_challenge_id AND is_active = true;

  IF v_challenge IS NULL THEN
    RAISE EXCEPTION 'Challenge not found or is no longer active.';
  END IF;

  -- 4. Normalize answers for comparison
  v_normalized_answer := lower(trim(p_submitted_answer));
  v_normalized_correct := lower(trim(v_challenge.correct_answer));

  -- Handle numeric equivalence: strip trailing .0, .00 etc.
  IF v_normalized_answer ~ '^\-?[0-9]+\.0+$' THEN
    v_normalized_answer := regexp_replace(v_normalized_answer, '\.0+$', '');
  END IF;
  IF v_normalized_correct ~ '^\-?[0-9]+\.0+$' THEN
    v_normalized_correct := regexp_replace(v_normalized_correct, '\.0+$', '');
  END IF;

  v_is_correct := (v_normalized_answer = v_normalized_correct);

  -- 5. Calculate today's IST date and game earnings (excluding streak bonuses)
  v_today_ist := (NOW() AT TIME ZONE 'Asia/Kolkata')::date;

  SELECT COALESCE(SUM(reward_paise), 0) INTO v_today_game_earned
  FROM earn_attempts
  WHERE profile_id = p_profile_id
    AND is_correct = true
    AND reward_paise > 0
    AND (created_at AT TIME ZONE 'Asia/Kolkata')::date = v_today_ist;

  v_remaining_game := v_daily_game_limit - v_today_game_earned;

  -- 6. Determine game challenge reward (subject to ₹50 game cap)
  IF v_is_correct THEN
    IF v_remaining_game <= 0 THEN
      -- Daily game limit already reached: ₹0 game reward
      v_game_reward_paise := 0;
    ELSIF v_challenge.reward_paise > v_remaining_game THEN
      -- Partial: give what's remaining up to the ₹50 game limit
      v_game_reward_paise := v_remaining_game;
    ELSE
      v_game_reward_paise := v_challenge.reward_paise;
    END IF;
  ELSE
    v_game_reward_paise := 0;
  END IF;

  -- 7. Insert attempt record FIRST so we have v_new_attempt_id
  INSERT INTO earn_attempts (
    household_id,
    profile_id,
    challenge_id,
    submitted_answer,
    is_correct,
    reward_paise,
    idempotency_key
  ) VALUES (
    p_household_id,
    p_profile_id,
    p_challenge_id,
    p_submitted_answer,
    v_is_correct,
    v_game_reward_paise,
    p_idempotency_key
  )
  RETURNING id INTO v_new_attempt_id;

  -- 8. If game reward > 0, insert ledger credit
  IF v_game_reward_paise > 0 THEN
    INSERT INTO ledger (
      household_id,
      user_id,
      entry_type,
      amount_paise,
      description
    ) VALUES (
      p_household_id,
      p_profile_id,
      'earn_credit',
      v_game_reward_paise,
      '💰 Earn lil Kharchaa · ' || COALESCE(
        CASE v_challenge.challenge_type
          WHEN 'number_sequence' THEN 'Number Sequence'
          WHEN 'logic' THEN 'Logic Puzzle'
          WHEN 'pattern' THEN 'Pattern'
          WHEN 'arithmetic' THEN 'Arithmetic'
          WHEN 'riddle' THEN 'Riddle'
          WHEN 'probability' THEN 'Probability'
          WHEN 'comparison' THEN 'Comparison'
          WHEN 'odd_one_out' THEN 'Odd One Out'
          WHEN 'deduction' THEN 'Deduction'
        END,
        'Challenge'
      )
    );
  END IF;

  -- 9. STREAK & MILESTONE BONUS PROCESSING
  -- Lock or initialize user's streak row
  SELECT * INTO v_streak
  FROM earn_streaks
  WHERE profile_id = p_profile_id
  FOR UPDATE;

  IF v_streak IS NULL THEN
    INSERT INTO earn_streaks (profile_id, household_id, current_streak, best_streak)
    VALUES (p_profile_id, p_household_id, 0, 0)
    RETURNING * INTO v_streak;
  END IF;

  v_current_streak := v_streak.current_streak;
  v_best_streak := v_streak.best_streak;
  v_streak_started_on := v_streak.streak_started_on;

  IF v_is_correct THEN
    IF v_streak.last_qualifying_date = v_today_ist THEN
      -- Already qualified today: streak count stays unchanged today
      v_current_streak := v_streak.current_streak;
      v_best_streak := v_streak.best_streak;
    ELSIF v_streak.last_qualifying_date = (v_today_ist - INTERVAL '1 day')::date THEN
      -- Consecutive calendar day: increment streak!
      v_current_streak := v_streak.current_streak + 1;
      v_streak_started_on := COALESCE(v_streak.streak_started_on, (v_today_ist - (v_streak.current_streak || ' days')::interval)::date);
      v_best_streak := GREATEST(v_streak.best_streak, v_current_streak);

      UPDATE earn_streaks
      SET current_streak = v_current_streak,
          best_streak = v_best_streak,
          last_qualifying_date = v_today_ist,
          streak_started_on = v_streak_started_on,
          updated_at = now()
      WHERE profile_id = p_profile_id;
    ELSE
      -- Missed one or more days, or first qualifying day: start new streak at 1!
      v_current_streak := 1;
      v_streak_started_on := v_today_ist;
      v_best_streak := GREATEST(v_streak.best_streak, 1);

      UPDATE earn_streaks
      SET current_streak = 1,
          best_streak = v_best_streak,
          last_qualifying_date = v_today_ist,
          streak_started_on = v_today_ist,
          updated_at = now()
      WHERE profile_id = p_profile_id;
    END IF;

    -- Check if a milestone was reached on this qualification
    -- Milestones: 3 (+₹10 = 1000p), 7 (+₹20 = 2000p), 14 (+₹50 = 5000p), 30 (+₹100 = 10000p)
    IF v_streak.last_qualifying_date IS DISTINCT FROM v_today_ist THEN
      IF v_current_streak = 3 THEN
        v_milestone_days := 3;
        v_streak_bonus_paise := 1000;
      ELSIF v_current_streak = 7 THEN
        v_milestone_days := 7;
        v_streak_bonus_paise := 2000;
      ELSIF v_current_streak = 14 THEN
        v_milestone_days := 14;
        v_streak_bonus_paise := 5000;
      ELSIF v_current_streak = 30 THEN
        v_milestone_days := 30;
        v_streak_bonus_paise := 10000;
      END IF;

      -- Check milestone idempotency: only award if not already awarded for this streak progression
      IF v_streak_bonus_paise > 0 THEN
        IF NOT EXISTS (
          SELECT 1 FROM earn_streak_milestones
          WHERE profile_id = p_profile_id
            AND milestone_days = v_milestone_days
            AND streak_started_on = v_streak_started_on
        ) THEN
          -- Record milestone award
          INSERT INTO earn_streak_milestones (
            household_id,
            profile_id,
            milestone_days,
            reward_paise,
            streak_started_on,
            awarded_date,
            attempt_id
          ) VALUES (
            p_household_id,
            p_profile_id,
            v_milestone_days,
            v_streak_bonus_paise,
            v_streak_started_on,
            v_today_ist,
            v_new_attempt_id
          );

          -- Record separate ledger entry for streak bonus (bypasses ₹50 game cap!)
          INSERT INTO ledger (
            household_id,
            user_id,
            entry_type,
            amount_paise,
            description
          ) VALUES (
            p_household_id,
            p_profile_id,
            'earn_credit',
            v_streak_bonus_paise,
            '🔥 Streak Bonus · ' || v_current_streak || '-day streak'
          );

          v_milestone_reached := true;
        ELSE
          -- Already awarded for this progression
          v_streak_bonus_paise := 0;
          v_milestone_days := 0;
        END IF;
      END IF;
    END IF;
  ELSE
    -- Incorrect attempt: check if existing streak is already stale or never started
    IF v_streak.last_qualifying_date IS NULL OR v_streak.last_qualifying_date < (v_today_ist - INTERVAL '1 day')::date THEN
      v_current_streak := 0;
    ELSE
      v_current_streak := v_streak.current_streak;
    END IF;
  END IF;

  -- 10. Return complete telemetry
  RETURN jsonb_build_object(
    'success', true,
    'idempotent_replay', false,
    'attempt_id', v_new_attempt_id,
    'is_correct', v_is_correct,
    'reward_paise', v_game_reward_paise,
    'streak_bonus_paise', v_streak_bonus_paise,
    'total_earned_paise', v_game_reward_paise + v_streak_bonus_paise,
    'challenge_id', p_challenge_id,
    'today_game_earned_paise', v_today_game_earned + v_game_reward_paise,
    'daily_game_limit_paise', v_daily_game_limit,
    'daily_limit_reached', ((v_today_game_earned + v_game_reward_paise) >= v_daily_game_limit),
    'current_streak', v_current_streak,
    'best_streak', v_best_streak,
    'milestone_reached', v_milestone_reached,
    'milestone_days', v_milestone_days,
    'explanation', v_challenge.explanation
  );
END;
$$;

-- 6. RPC Lockdown
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM public, anon, authenticated;
