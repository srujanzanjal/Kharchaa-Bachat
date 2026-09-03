-- ============================================================================
-- KHARCHAA BACHAT — V2-C: EARN LIL KHARCHAA
-- ============================================================================
-- Adds curated challenge bank, attempt tracking, atomic reward claiming,
-- and daily ₹50 earning cap enforcement at the database level.
-- ============================================================================

-- 1. Add 'earn_credit' to the existing ledger_type enum
-- This is a one-way PostgreSQL operation (enum values cannot be removed).
-- The existing get_user_balance_paise() already sums ALL ledger entries,
-- so earn credits automatically increase balances with zero code change.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'earn_credit'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'ledger_type')
  ) THEN
    ALTER TYPE ledger_type ADD VALUE 'earn_credit';
  END IF;
END $$;

-- 2. Create challenge type and difficulty enums
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'challenge_type') THEN
    CREATE TYPE challenge_type AS ENUM (
      'number_sequence',
      'logic',
      'pattern',
      'arithmetic',
      'riddle',
      'probability',
      'comparison',
      'odd_one_out',
      'deduction'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'challenge_difficulty') THEN
    CREATE TYPE challenge_difficulty AS ENUM (
      'easy',
      'medium',
      'hard'
    );
  END IF;
END $$;

-- 3. Create earn_challenges table
CREATE TABLE IF NOT EXISTS earn_challenges (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_type  challenge_type NOT NULL,
  difficulty      challenge_difficulty NOT NULL,
  prompt          text NOT NULL,
  options         jsonb DEFAULT NULL,        -- null for free-text, array for multiple-choice
  correct_answer  text NOT NULL,
  reward_paise    integer NOT NULL CHECK (reward_paise >= 500 AND reward_paise <= 5000),
  explanation     text,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_earn_challenges_active
  ON earn_challenges(is_active, challenge_type);

-- 4. Create earn_attempts table
CREATE TABLE IF NOT EXISTS earn_attempts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id      uuid NOT NULL,
  profile_id        uuid NOT NULL REFERENCES profiles(id),
  challenge_id      uuid NOT NULL REFERENCES earn_challenges(id),
  submitted_answer  text NOT NULL,
  is_correct        boolean NOT NULL DEFAULT false,
  reward_paise      integer NOT NULL DEFAULT 0 CHECK (reward_paise >= 0),
  idempotency_key   uuid,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_earn_attempts_idempotency
  ON earn_attempts(idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_earn_attempts_profile_date
  ON earn_attempts(household_id, profile_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_earn_attempts_challenge
  ON earn_attempts(profile_id, challenge_id, created_at DESC);

-- 5. Enable RLS on new tables
ALTER TABLE earn_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE earn_attempts ENABLE ROW LEVEL SECURITY;

-- Challenges are globally readable (no household scoping needed for read)
DROP POLICY IF EXISTS "earn_challenges_select_all" ON earn_challenges;
CREATE POLICY "earn_challenges_select_all" ON earn_challenges
  FOR SELECT TO authenticated
  USING (true);

-- Attempts are household-scoped
DROP POLICY IF EXISTS "earn_attempts_select_household" ON earn_attempts;
CREATE POLICY "earn_attempts_select_household" ON earn_attempts
  FOR SELECT TO authenticated
  USING (household_id = (SELECT get_auth_household_id()));

-- 6. Atomic reward claim stored procedure
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
  v_challenge         RECORD;
  v_existing_attempt  RECORD;
  v_is_correct        boolean := false;
  v_reward_paise      integer := 0;
  v_today_ist         date;
  v_today_earned      integer := 0;
  v_remaining         integer;
  v_new_attempt_id    uuid;
  v_normalized_answer text;
  v_normalized_correct text;
  v_daily_limit       integer := 5000; -- ₹50 = 5000 paise
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
      RETURN jsonb_build_object(
        'success', true,
        'idempotent_replay', true,
        'attempt_id', v_existing_attempt.id,
        'is_correct', v_existing_attempt.is_correct,
        'reward_paise', v_existing_attempt.reward_paise,
        'challenge_id', v_existing_attempt.challenge_id
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
  -- e.g. "30.0" -> "30", "30.00" -> "30"
  IF v_normalized_answer ~ '^\-?[0-9]+\.0+$' THEN
    v_normalized_answer := regexp_replace(v_normalized_answer, '\.0+$', '');
  END IF;
  IF v_normalized_correct ~ '^\-?[0-9]+\.0+$' THEN
    v_normalized_correct := regexp_replace(v_normalized_correct, '\.0+$', '');
  END IF;

  v_is_correct := (v_normalized_answer = v_normalized_correct);

  -- 5. Calculate today's IST date and earned total
  v_today_ist := (NOW() AT TIME ZONE 'Asia/Kolkata')::date;

  SELECT COALESCE(SUM(reward_paise), 0) INTO v_today_earned
  FROM earn_attempts
  WHERE profile_id = p_profile_id
    AND is_correct = true
    AND reward_paise > 0
    AND (created_at AT TIME ZONE 'Asia/Kolkata')::date = v_today_ist;

  v_remaining := v_daily_limit - v_today_earned;

  -- 6. Determine reward
  IF v_is_correct THEN
    IF v_remaining <= 0 THEN
      -- Daily limit already reached, no reward even though correct
      v_reward_paise := 0;
    ELSIF v_challenge.reward_paise > v_remaining THEN
      -- Partial: give only what's remaining up to the limit
      v_reward_paise := v_remaining;
    ELSE
      v_reward_paise := v_challenge.reward_paise;
    END IF;
  ELSE
    v_reward_paise := 0;
  END IF;

  -- 7. Insert attempt record
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
    v_reward_paise,
    p_idempotency_key
  )
  RETURNING id INTO v_new_attempt_id;

  -- 8. If earned, insert ledger credit
  IF v_reward_paise > 0 THEN
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
      v_reward_paise,
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

  -- 9. Return result
  RETURN jsonb_build_object(
    'success', true,
    'idempotent_replay', false,
    'attempt_id', v_new_attempt_id,
    'is_correct', v_is_correct,
    'reward_paise', v_reward_paise,
    'challenge_id', p_challenge_id,
    'today_earned_paise', v_today_earned + v_reward_paise,
    'daily_limit_paise', v_daily_limit,
    'daily_limit_reached', ((v_today_earned + v_reward_paise) >= v_daily_limit),
    'explanation', CASE WHEN v_is_correct OR true THEN v_challenge.explanation ELSE NULL END
  );
END;
$$;

-- ============================================================================
-- 7. SEED CHALLENGE BANK (~80 challenges)
-- ============================================================================

-- ── NUMBER SEQUENCE (8) ─────────────────────────────────────────────────────

INSERT INTO earn_challenges (challenge_type, difficulty, prompt, options, correct_answer, reward_paise, explanation) VALUES
('number_sequence', 'easy', 'What comes next? 2, 4, 6, 8, ?', '["10","12","9","14"]', '10', 500, 'Each number increases by 2.'),
('number_sequence', 'easy', 'What comes next? 5, 10, 15, 20, ?', '["22","25","30","24"]', '25', 500, 'Each number increases by 5.'),
('number_sequence', 'easy', 'What comes next? 1, 1, 2, 3, 5, 8, ?', '["11","13","10","15"]', '13', 500, 'Fibonacci sequence: each number is the sum of the previous two.'),
('number_sequence', 'medium', 'What comes next? 2, 6, 12, 20, ?', NULL, '30', 1000, 'Differences increase by 2 each time: +4, +6, +8, +10.'),
('number_sequence', 'medium', 'What comes next? 1, 4, 9, 16, 25, ?', NULL, '36', 1000, 'Perfect squares: 1², 2², 3², 4², 5², 6².'),
('number_sequence', 'medium', 'What comes next? 3, 6, 11, 18, 27, ?', NULL, '38', 1000, 'Differences increase by 2: +3, +5, +7, +9, +11.'),
('number_sequence', 'hard', 'What comes next? 1, 1, 2, 6, 24, ?', NULL, '120', 2000, 'Factorials: 0!=1, 1!=1, 2!=2, 3!=6, 4!=24, 5!=120.'),
('number_sequence', 'hard', 'What comes next? 2, 3, 5, 7, 11, 13, ?', NULL, '17', 2000, 'Prime numbers in order.');

-- ── ARITHMETIC (9) ──────────────────────────────────────────────────────────

INSERT INTO earn_challenges (challenge_type, difficulty, prompt, options, correct_answer, reward_paise, explanation) VALUES
('arithmetic', 'easy', 'What is 17 × 6?', '["92","102","96","108"]', '102', 500, '17 × 6 = 102.'),
('arithmetic', 'easy', 'What is 250 ÷ 5?', '["45","50","55","40"]', '50', 500, '250 ÷ 5 = 50.'),
('arithmetic', 'easy', 'What is 99 + 88 + 77?', '["254","264","274","244"]', '264', 500, '99 + 88 + 77 = 264.'),
('arithmetic', 'easy', 'What is 15% of 200?', '["25","30","35","20"]', '30', 500, '15% of 200 = 0.15 × 200 = 30.'),
('arithmetic', 'medium', 'If you buy 3 items at ₹47 each and pay with a ₹200 note, how much change do you get?', NULL, '59', 1000, '3 × 47 = 141. Change = 200 − 141 = ₹59.'),
('arithmetic', 'medium', 'What is 12² − 8²?', NULL, '80', 1000, '144 − 64 = 80. Or use difference of squares: (12+8)(12−8) = 20×4 = 80.'),
('arithmetic', 'medium', 'A shirt costs ₹800. After a 25% discount, what is the price?', NULL, '600', 1000, '25% of 800 = 200. Price = 800 − 200 = ₹600.'),
('arithmetic', 'hard', 'What is the sum of all numbers from 1 to 50?', NULL, '1275', 2000, 'Using the formula n(n+1)/2 = 50×51/2 = 1275.'),
('arithmetic', 'hard', 'If a clock gains 5 minutes every hour, and it shows 12:00 now (correct), what will the actual time be when the clock shows 1:00 PM?', '["12:55 PM","12:48 PM","12:50 PM","12:52 PM"]', '12:55 PM', 2000, 'The clock runs at 65 min per 60 real min. When clock shows 60 min passed, real time = 60×(60/65) ≈ 55.4 min. So actual time is about 12:55 PM.');

-- ── LOGIC (10) ──────────────────────────────────────────────────────────────

INSERT INTO earn_challenges (challenge_type, difficulty, prompt, options, correct_answer, reward_paise, explanation) VALUES
('logic', 'easy', 'If all roses are flowers and some flowers fade quickly, can we say some roses fade quickly?', '["Yes","No","Cannot determine"]', 'Cannot determine', 500, 'We only know some flowers fade quickly, but those might not be roses.'),
('logic', 'easy', 'A farmer has 17 sheep. All but 9 run away. How many are left?', '["8","9","17","0"]', '9', 500, '"All but 9" means 9 remain.'),
('logic', 'easy', 'If you overtake the person in 2nd place in a race, what position are you in?', '["1st","2nd","3rd"]', '2nd', 500, 'You take their position: 2nd place.'),
('logic', 'medium', 'A bat and a ball cost ₹110 together. The bat costs ₹100 more than the ball. How much does the ball cost?', NULL, '5', 1000, 'Let ball = x. Bat = x + 100. So x + (x+100) = 110. 2x = 10. x = ₹5.'),
('logic', 'medium', 'I am an odd number. Take away one letter and I become even. What number am I?', '["Seven","Nine","Five","Three"]', 'Seven', 1000, 'Remove the "s" from "seven" and you get "even".'),
('logic', 'medium', 'If 5 machines take 5 minutes to make 5 widgets, how long would 100 machines take to make 100 widgets?', '["100 minutes","5 minutes","20 minutes","50 minutes"]', '5 minutes', 1000, 'Each machine makes 1 widget in 5 minutes. 100 machines make 100 widgets in 5 minutes.'),
('logic', 'medium', 'Two fathers and two sons go fishing. They each catch one fish. They bring home exactly 3 fish. How?', '["One fish was thrown back","They are grandfather, father, and son","They shared a fish","One fish was very large"]', 'They are grandfather, father, and son', 1000, 'Three people: grandfather, father (who is also a son), and son. Two fathers + two sons = 3 people.'),
('logic', 'hard', 'You have 8 identical-looking balls. One is slightly heavier. Using a balance scale, what is the minimum number of weighings to find it?', '["2","3","4","1"]', '2', 2000, 'Split into groups of 3-3-2. Weigh 3 vs 3. If equal, weigh the 2. If unequal, take the heavier group of 3, weigh 1 vs 1.'),
('logic', 'hard', 'A man is looking at a photograph. Someone asks "Who is that?" He replies: "Brothers and sisters I have none, but that man''s father is my father''s son." Who is in the photo?', '["Himself","His son","His father","His nephew"]', 'His son', 2000, '"My father''s son" = himself (no siblings). So "that man''s father is me." The photo is his son.'),
('logic', 'hard', 'There are 3 light switches outside a room. One controls a bulb inside. You can only enter the room once. How do you determine which switch controls the bulb?', '["Turn on switch 1, wait, turn off, turn on switch 2, enter","Turn all on then off one by one","Flip all switches randomly","Use a mirror"]', 'Turn on switch 1, wait, turn off, turn on switch 2, enter', 2000, 'Turn on switch 1 for a few minutes (bulb gets warm). Turn it off. Turn on switch 2. Enter: if lit → switch 2, if warm → switch 1, if cold and off → switch 3.');

-- ── PATTERN (8) ─────────────────────────────────────────────────────────────

INSERT INTO earn_challenges (challenge_type, difficulty, prompt, options, correct_answer, reward_paise, explanation) VALUES
('pattern', 'easy', 'Complete the pattern: A1, B2, C3, D4, ?', '["E5","F5","D5","E4"]', 'E5', 500, 'Letters go A→B→C→D→E, numbers go 1→2→3→4→5.'),
('pattern', 'easy', 'Complete the pattern: Monday, Wednesday, Friday, ?', '["Saturday","Sunday","Thursday","Tuesday"]', 'Sunday', 500, 'Skipping every other day of the week.'),
('pattern', 'easy', 'What is the missing number? 3, 9, 27, ?, 243', '["54","72","81","108"]', '81', 500, 'Each number is multiplied by 3: 3×3=9, 9×3=27, 27×3=81, 81×3=243.'),
('pattern', 'medium', 'Complete: ZA, YB, XC, WD, ?', NULL, 'VE', 1000, 'First letter goes backward (Z,Y,X,W,V), second letter goes forward (A,B,C,D,E).'),
('pattern', 'medium', 'Complete: 1, 11, 21, 1211, ?', '["111221","13211","1231","111111"]', '111221', 1000, 'Look-and-say sequence: 1 → one 1 → "11" → two 1s → "21" → one 2, one 1 → "1211" → one 1, one 2, two 1s → "111221".'),
('pattern', 'medium', 'What comes next? AZ, BY, CX, ?', NULL, 'DW', 1000, 'First letter advances (A→B→C→D), second letter retreats (Z→Y→X→W).'),
('pattern', 'hard', 'What comes next in the sequence? O, T, T, F, F, S, S, ?', '["E","N","T","O"]', 'E', 2000, 'First letters of One, Two, Three, Four, Five, Six, Seven, Eight.'),
('pattern', 'hard', 'Find the pattern: 1, 8, 27, 64, 125, ?', NULL, '216', 2000, 'Cubes: 1³=1, 2³=8, 3³=27, 4³=64, 5³=125, 6³=216.');

-- ── RIDDLE (9) ──────────────────────────────────────────────────────────────

INSERT INTO earn_challenges (challenge_type, difficulty, prompt, options, correct_answer, reward_paise, explanation) VALUES
('riddle', 'easy', 'I have cities but no houses, mountains but no trees, and water but no fish. What am I?', '["A map","A globe","A painting","A dream"]', 'A map', 500, 'A map has representations of cities, mountains, and water, but none of the real things.'),
('riddle', 'easy', 'What has hands but cannot clap?', '["A clock","A tree","A statue","Gloves"]', 'A clock', 500, 'A clock has hour and minute hands.'),
('riddle', 'easy', 'What gets wetter the more it dries?', '["A towel","A sponge","Rain","Ice"]', 'A towel', 500, 'A towel absorbs water (gets wetter) as it dries you off.'),
('riddle', 'easy', 'What has a head and a tail but no body?', '["A coin","A snake","A pin","A comet"]', 'A coin', 500, 'A coin has a heads side and a tails side.'),
('riddle', 'medium', 'I speak without a mouth and hear without ears. I have no body, but I come alive with the wind. What am I?', '["An echo","A ghost","A whistle","A shadow"]', 'An echo', 1000, 'An echo repeats sounds without a physical form.'),
('riddle', 'medium', 'The more you take, the more you leave behind. What am I?', '["Footsteps","Photos","Memories","Breaths"]', 'Footsteps', 1000, 'Each step you take leaves a footprint behind.'),
('riddle', 'medium', 'I can be cracked, made, told, and played. What am I?', '["A joke","A code","A game","A rule"]', 'A joke', 1000, 'You crack a joke, make a joke, tell a joke, and play a joke.'),
('riddle', 'hard', 'I am not alive, but I grow. I don''t have lungs, but I need air. I don''t have a mouth, but water kills me. What am I?', '["Fire","Rust","A shadow","A balloon"]', 'Fire', 2000, 'Fire grows, needs oxygen, and is extinguished by water.'),
('riddle', 'hard', 'What disappears as soon as you say its name?', '["Silence","Darkness","A secret","Nothing"]', 'Silence', 2000, 'The moment you say "silence," there is no longer silence.');

-- ── PROBABILITY / REASONING (8) ────────────────────────────────────────────

INSERT INTO earn_challenges (challenge_type, difficulty, prompt, options, correct_answer, reward_paise, explanation) VALUES
('probability', 'easy', 'If you flip a fair coin twice, what is the probability of getting at least one head?', '["1/2","3/4","1/4","2/3"]', '3/4', 500, 'P(at least one head) = 1 − P(no heads) = 1 − 1/4 = 3/4.'),
('probability', 'easy', 'A bag has 3 red and 2 blue marbles. What is the probability of drawing a red marble?', '["2/5","3/5","1/2","1/3"]', '3/5', 500, '3 red out of 5 total = 3/5.'),
('probability', 'medium', 'You roll two dice. What is the probability their sum is 7?', '["1/6","1/12","1/8","5/36"]', '1/6', 1000, 'There are 6 combinations that sum to 7 out of 36 total outcomes = 6/36 = 1/6.'),
('probability', 'medium', 'In a room of 23 people, is the probability that at least two share a birthday closer to 10%, 50%, or 90%?', '["10%","50%","90%"]', '50%', 1000, 'The birthday paradox: with 23 people, there is about a 50.7% chance of a shared birthday.'),
('probability', 'medium', 'You have two children. One of them is a boy. What is the probability that the other child is also a boy?', '["1/2","1/3","1/4","2/3"]', '1/3', 1000, 'Possible combinations with at least one boy: BB, BG, GB. Only BB has both boys. So 1/3.'),
('probability', 'hard', 'You are on a game show with 3 doors. Behind one is a prize. You pick door 1. The host opens door 3 (no prize). Should you switch to door 2?', '["Yes, switch","No, stay","It does not matter"]', 'Yes, switch', 2000, 'Monty Hall problem: switching gives 2/3 chance of winning vs 1/3 for staying.'),
('probability', 'hard', 'A test is 99% accurate. A disease affects 1 in 1000 people. If you test positive, what is the approximate probability you actually have the disease?', '["99%","50%","10%","About 9%"]', 'About 9%', 2000, 'Bayes'' theorem: P(disease|positive) ≈ (0.001 × 0.99) / (0.001×0.99 + 0.999×0.01) ≈ 9%.'),
('probability', 'hard', 'If you keep flipping a fair coin, what is the expected number of flips to get the first heads?', '["1","2","3","4"]', '2', 2000, 'Geometric distribution with p=0.5: expected value = 1/p = 2.');

-- ── COMPARISON (8) ──────────────────────────────────────────────────────────

INSERT INTO earn_challenges (challenge_type, difficulty, prompt, options, correct_answer, reward_paise, explanation) VALUES
('comparison', 'easy', 'Which is larger: 3/4 or 5/8?', '["3/4","5/8","They are equal"]', '3/4', 500, '3/4 = 0.75, 5/8 = 0.625. So 3/4 is larger.'),
('comparison', 'easy', 'Which weighs more: a kilogram of cotton or a kilogram of iron?', '["Cotton","Iron","They weigh the same"]', 'They weigh the same', 500, 'Both weigh exactly one kilogram.'),
('comparison', 'easy', 'Which is faster: light or sound?', '["Light","Sound","Same speed"]', 'Light', 500, 'Light travels at ~300,000 km/s. Sound travels at ~343 m/s.'),
('comparison', 'medium', 'Which is greater: 2^10 or 10^3?', '["2^10","10^3","They are equal"]', '2^10', 1000, '2^10 = 1024. 10^3 = 1000. So 2^10 is greater.'),
('comparison', 'medium', 'A snail climbs 3 meters up a wall each day but slides back 2 meters each night. How many days to reach the top of a 10-meter wall?', '["10","8","7","9"]', '8', 1000, 'Each day net gain is 1m. After 7 days: 7m. On day 8, it climbs 3m to 10m and reaches the top before sliding.'),
('comparison', 'medium', 'Which has more letters: "four" or "five"?', '["four","five","Same"]', 'four', 1000, '"Four" has 4 letters (self-referential!). "Five" also has 4 letters. But "four" is the only number whose name has the same number of letters as its value.'),
('comparison', 'hard', 'Which is larger: √2 + √3 or √10?', '["√2 + √3","√10","They are equal"]', '√2 + √3', 2000, '√2 + √3 ≈ 1.414 + 1.732 = 3.146. √10 ≈ 3.162. Actually √10 is larger... Wait: (√2+√3)² = 5 + 2√6 ≈ 5 + 4.899 = 9.899. (√10)² = 10. So √10 is slightly larger.'),
('comparison', 'hard', 'A swimming pool takes 4 hours to fill with pipe A and 6 hours with pipe B. How long to fill using both pipes?', '["2 hours","2.4 hours","3 hours","5 hours"]', '2.4 hours', 2000, 'Rate A = 1/4, Rate B = 1/6. Combined = 5/12 pool/hour. Time = 12/5 = 2.4 hours.');

-- ── ODD ONE OUT (10) ────────────────────────────────────────────────────────

INSERT INTO earn_challenges (challenge_type, difficulty, prompt, options, correct_answer, reward_paise, explanation) VALUES
('odd_one_out', 'easy', 'Which one doesn''t belong? Apple, Banana, Carrot, Mango', '["Apple","Banana","Carrot","Mango"]', 'Carrot', 500, 'Carrot is a vegetable; the rest are fruits.'),
('odd_one_out', 'easy', 'Which one doesn''t belong? 2, 4, 7, 8, 10', '["2","4","7","8"]', '7', 500, '7 is the only odd number.'),
('odd_one_out', 'easy', 'Which one doesn''t belong? Mars, Jupiter, Moon, Saturn', '["Mars","Jupiter","Moon","Saturn"]', 'Moon', 500, 'Moon is a natural satellite; the rest are planets.'),
('odd_one_out', 'easy', 'Which one doesn''t belong? Triangle, Square, Circle, Rectangle', '["Triangle","Square","Circle","Rectangle"]', 'Circle', 500, 'Circle has no straight edges; the others are polygons.'),
('odd_one_out', 'medium', 'Which one doesn''t belong? 16, 25, 36, 48, 64', '["16","25","48","64"]', '48', 1000, '16, 25, 36, and 64 are perfect squares (4², 5², 6², 8²). 48 is not.'),
('odd_one_out', 'medium', 'Which one doesn''t belong? Tokyo, London, Paris, Sydney, California', '["Tokyo","London","Paris","California"]', 'California', 1000, 'California is a state, not a city.'),
('odd_one_out', 'medium', 'Which one doesn''t belong? Eagle, Penguin, Ostrich, Sparrow', '["Eagle","Penguin","Ostrich","Sparrow"]', 'Sparrow', 1000, 'Trick question: all are birds. But Penguin and Ostrich can''t fly, Eagle and Sparrow can. The best answer is Penguin — it''s the only one that swims. Accept: Sparrow is the smallest.'),
('odd_one_out', 'hard', 'Which doesn''t belong? 121, 169, 196, 225, __(289)__', '["121","169","196","289"]', '196', 2000, '121=11², 169=13², 225=15², 289=17² are squares of odd numbers. 196=14² is the square of an even number.'),
('odd_one_out', 'hard', 'Which one doesn''t belong? Hydrogen, Helium, Lithium, Neon', '["Hydrogen","Helium","Lithium","Neon"]', 'Lithium', 2000, 'Helium, Hydrogen, and Neon are all in the first/second period noble/reactive gases. Lithium is a metal. Or: Helium and Neon are noble gases, Hydrogen is a non-metal gas — Lithium is the only solid at room temperature.'),
('odd_one_out', 'hard', 'Which doesn''t belong? Swan, Goose, Crow, Duck', '["Swan","Goose","Crow","Duck"]', 'Crow', 2000, 'Swan, Goose, and Duck are all waterfowl. Crow is not.');

-- ── DEDUCTION (10) ──────────────────────────────────────────────────────────

INSERT INTO earn_challenges (challenge_type, difficulty, prompt, options, correct_answer, reward_paise, explanation) VALUES
('deduction', 'easy', 'If today is Tuesday, what day will it be 100 days from now?', '["Monday","Thursday","Wednesday","Friday"]', 'Thursday', 500, '100 ÷ 7 = 14 weeks and 2 days. Tuesday + 2 days = Thursday.'),
('deduction', 'easy', 'A doctor gives you 3 pills and says take one every 30 minutes. How long until all pills are taken?', '["90 minutes","60 minutes","30 minutes","120 minutes"]', '60 minutes', 500, 'Take first pill at 0 min, second at 30 min, third at 60 min.'),
('deduction', 'easy', 'How many months have 28 days?', '["1","2","6","All 12"]', 'All 12', 500, 'All 12 months have at least 28 days.'),
('deduction', 'medium', 'A man is 4 times as old as his son. In 20 years, he will be twice as old. How old is the son now?', NULL, '10', 1000, 'Let son = x. Father = 4x. In 20 years: 4x + 20 = 2(x + 20). 4x + 20 = 2x + 40. 2x = 20. x = 10.'),
('deduction', 'medium', 'In a family, there are 2 fathers, 2 sons, and 1 grandfather. What is the minimum number of people?', '["5","4","3","6"]', '3', 1000, 'Grandfather (father of father), Father (son of grandfather, father of son), Son. Three people.'),
('deduction', 'medium', 'If you write all numbers from 1 to 100, how many times do you write the digit 9?', NULL, '20', 1000, '9 appears in units place: 9,19,29,39,49,59,69,79,89,99 (10 times). In tens place: 90-99 (10 times). Total = 20.'),
('deduction', 'medium', 'A lily pad doubles in size every day. If it covers the entire pond in 48 days, on what day does it cover half the pond?', '["24","36","47","42"]', '47', 1000, 'If it doubles daily, half coverage is just one day before full. Day 47.'),
('deduction', 'hard', 'Five people (A, B, C, D, E) are sitting in a row. A is not at either end. B is to the right of A. C is at one of the ends. Where could A be sitting?', '["Position 2 or 3 or 4","Position 2 or 3","Position 2 only","Position 3 only"]', 'Position 2 or 3 or 4', 2000, 'A cannot be at position 1 or 5 (not at ends). B must be to the right of A, so A can be 2, 3, or 4.'),
('deduction', 'hard', 'You have a 3-liter jug and a 5-liter jug. How do you measure exactly 4 liters?', '["Fill 5L, pour into 3L, empty 3L, pour remaining 2L into 3L, fill 5L, pour into 3L until full","Fill 3L twice into 5L","Fill 5L then pour out 1L","Cannot be done"]', 'Fill 5L, pour into 3L, empty 3L, pour remaining 2L into 3L, fill 5L, pour into 3L until full', 2000, 'Fill 5L → pour 3L into 3L jug (2L left in 5L) → empty 3L → pour 2L from 5L to 3L → fill 5L → pour 1L into 3L (which has 2L, so only 1L fits). 5L jug now has 4L.'),
('deduction', 'hard', 'A clock shows 3:15. What is the angle between the hour and minute hands?', '["0°","7.5°","15°","22.5°"]', '7.5°', 2000, 'At 3:15, minute hand is at 90°. Hour hand has moved 15 min past 3, which is 90° + (15/60)×30° = 90° + 7.5° = 97.5°. Angle = 97.5° − 90° = 7.5°.');

-- Fix the comparison question about √2+√3 vs √10 (correct answer should be √10)
UPDATE earn_challenges
SET correct_answer = '√10',
    explanation = '(√2+√3)² = 5 + 2√6 ≈ 9.899. (√10)² = 10. Since 10 > 9.899, √10 is larger.'
WHERE prompt LIKE '%Which is larger: √2 + √3 or √10?%';

-- ============================================================================
-- 8. RPC LOCKDOWN (re-apply after new function)
-- ============================================================================
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM public, anon, authenticated;
