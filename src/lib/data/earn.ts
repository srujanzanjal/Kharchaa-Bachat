"use server";

import {
  DEFAULT_HOUSEHOLD_ID,
  DISHA_PROFILE_ID,
  getDb,
  SRUJAN_PROFILE_ID,
} from "@/lib/server/db";
import type {
  AsyncData,
  ChallengeType,
  EarnAttemptRecord,
  EarnAttemptResult,
  EarnChallenge,
  EarnStatus,
  StreakMilestoneInfo,
} from "@/types";

const DB_UNAVAILABLE_MESSAGE = "We can\u2019t reach your data right now.";
const DAILY_LIMIT_PAISE = 5000; // ₹50
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function resolveProfileId(profileName: string): string | null {
  const name = profileName.toLowerCase().trim();
  if (name === "srujan") return SRUJAN_PROFILE_ID;
  if (name === "disha") return DISHA_PROFILE_ID;
  return null;
}

/**
 * Fetches the earning status for a given profile for today (IST).
 * Returns today's game earnings, streak bonuses, streak status, and recent attempts.
 */
export async function fetchEarnStatus(
  profileName: string
): Promise<AsyncData<EarnStatus>> {
  try {
    const profileId = resolveProfileId(profileName);
    if (!profileId) {
      return {
        status: "error",
        data: null,
        error: "Invalid participant selected.",
      };
    }

    const db = getDb();

    // 1. Get today's game earnings (IST)
    const todayGameRes = await db.query(
      `SELECT COALESCE(SUM(reward_paise), 0)::integer AS today_game_earned
       FROM earn_attempts
       WHERE household_id = $1
         AND profile_id = $2
         AND is_correct = true
         AND reward_paise > 0
         AND (created_at AT TIME ZONE 'Asia/Kolkata')::date = (NOW() AT TIME ZONE 'Asia/Kolkata')::date;`,
      [DEFAULT_HOUSEHOLD_ID, profileId]
    );

    const todayGameEarned = Number(todayGameRes.rows[0]?.today_game_earned || 0);

    // 2. Get today's streak bonus earnings (IST)
    const todayStreakRes = await db.query(
      `SELECT COALESCE(SUM(reward_paise), 0)::integer AS today_streak_earned
       FROM earn_streak_milestones
       WHERE household_id = $1
         AND profile_id = $2
         AND awarded_date = (NOW() AT TIME ZONE 'Asia/Kolkata')::date;`,
      [DEFAULT_HOUSEHOLD_ID, profileId]
    );

    const todayStreakEarned = Number(todayStreakRes.rows[0]?.today_streak_earned || 0);

    // 3. Get streak metadata with explicit IST date boundaries
    const streakRes = await db.query(
      `SELECT
         current_streak,
         best_streak,
         to_char(streak_started_on, 'YYYY-MM-DD') AS streak_started_on,
         to_char(last_qualifying_date, 'YYYY-MM-DD') AS last_qualifying_date,
         to_char((NOW() AT TIME ZONE 'Asia/Kolkata')::date, 'YYYY-MM-DD') AS today_ist,
         to_char(((NOW() AT TIME ZONE 'Asia/Kolkata')::date - INTERVAL '1 day')::date, 'YYYY-MM-DD') AS yesterday_ist
       FROM earn_streaks
       WHERE profile_id = $1;`,
      [profileId]
    );

    let activeStreak = 0;
    let bestStreak = 0;
    let lastQualifying: string | null = null;

    if (streakRes.rows.length > 0) {
      const row = streakRes.rows[0];
      lastQualifying = row.last_qualifying_date || null;
      bestStreak = Number(row.best_streak || 0);

      // A) last_qualifying_date = today_ist -> active current_streak
      // B) last_qualifying_date = yesterday_ist -> active current_streak
      // C) last_qualifying_date < yesterday_ist or NULL -> active current_streak = 0
      if (lastQualifying && (lastQualifying === row.today_ist || lastQualifying === row.yesterday_ist)) {
        activeStreak = Number(row.current_streak || 0);
      } else {
        activeStreak = 0; // Missed a day: active streak broken
      }
    }

    // 4. Get total streak bonus earnings ever and historically unlocked milestones
    const milestoneHistoryRes = await db.query(
      `SELECT
         COALESCE(SUM(reward_paise), 0)::integer AS total_streak_earnings,
         COALESCE(array_agg(DISTINCT milestone_days), ARRAY[]::integer[]) AS unlocked_days
       FROM earn_streak_milestones
       WHERE profile_id = $1;`,
      [profileId]
    );
    const totalStreakEarnings = Number(milestoneHistoryRes.rows[0]?.total_streak_earnings || 0);
    const unlockedDays: number[] = milestoneHistoryRes.rows[0]?.unlocked_days || [];

    // 5. Build milestone progress & next milestone for current progression
    const milestoneConfigs = [
      { days: 3 as const, reward_paise: 1000 },
      { days: 7 as const, reward_paise: 2000 },
      { days: 14 as const, reward_paise: 5000 },
      { days: 30 as const, reward_paise: 10000 },
    ];

    // Next milestone is determined by active streak in the current progression
    const nextConfig = milestoneConfigs.find((m) => m.days > activeStreak);
    const nextMilestoneInfo: StreakMilestoneInfo | null = nextConfig
      ? {
          days: nextConfig.days,
          reward_paise: nextConfig.reward_paise,
          is_unlocked: false,
          is_next: true,
        }
      : null;

    const milestones = milestoneConfigs.map((m) => {
      // Historically unlocked if user ever earned it, or if active streak has reached it
      const isUnlocked = unlockedDays.includes(m.days) || activeStreak >= m.days;
      const isNext = nextConfig ? nextConfig.days === m.days : false;
      return {
        days: m.days,
        reward_paise: m.reward_paise,
        is_unlocked: isUnlocked,
        is_next: isNext,
      };
    });

    // 6. Get recent attempts (today, IST, most recent first)
    const attemptsRes = await db.query(
      `SELECT
         ea.id,
         ea.challenge_id,
         ec.challenge_type,
         ea.is_correct,
         ea.reward_paise,
         ea.created_at
       FROM earn_attempts ea
       JOIN earn_challenges ec ON ec.id = ea.challenge_id
       WHERE ea.household_id = $1
         AND ea.profile_id = $2
         AND (ea.created_at AT TIME ZONE 'Asia/Kolkata')::date = (NOW() AT TIME ZONE 'Asia/Kolkata')::date
       ORDER BY ea.created_at DESC
       LIMIT 20;`,
      [DEFAULT_HOUSEHOLD_ID, profileId]
    );

    const recentAttempts: EarnAttemptRecord[] = (attemptsRes.rows || []).map(
      (r) => ({
        id: r.id,
        challenge_id: r.challenge_id,
        challenge_type: r.challenge_type as ChallengeType,
        is_correct: r.is_correct,
        reward_paise: Number(r.reward_paise),
        created_at:
          r.created_at instanceof Date
            ? r.created_at.toISOString()
            : String(r.created_at),
      })
    );

    const remainingGame = Math.max(0, DAILY_LIMIT_PAISE - todayGameEarned);

    return {
      status: "success",
      data: {
        today_game_earned_paise: todayGameEarned,
        today_streak_earned_paise: todayStreakEarned,
        today_total_earned_paise: todayGameEarned + todayStreakEarned,
        today_earned_paise: todayGameEarned + todayStreakEarned,
        daily_game_limit_paise: DAILY_LIMIT_PAISE,
        daily_limit_paise: DAILY_LIMIT_PAISE,
        remaining_game_paise: remainingGame,
        remaining_paise: remainingGame,
        daily_limit_reached: remainingGame <= 0,
        recent_attempts: recentAttempts,
        streak: {
          current_streak: activeStreak,
          best_streak: bestStreak,
          streak_earnings_paise: totalStreakEarnings,
          milestones,
          next_milestone: nextMilestoneInfo,
          last_qualifying_date: lastQualifying,
        },
      },
    };
  } catch (err) {
    console.error("[fetchEarnStatus]", err);
    return {
      status: "error",
      data: null,
      error: DB_UNAVAILABLE_MESSAGE,
    };
  }
}

/**
 * Selects the next challenge for a given profile using anti-repetition scoring.
 * NEVER returns correct_answer to the client.
 */
export async function fetchNextChallenge(
  profileName: string
): Promise<AsyncData<EarnChallenge>> {
  try {
    const profileId = resolveProfileId(profileName);
    if (!profileId) {
      return {
        status: "error",
        data: null,
        error: "Invalid participant selected.",
      };
    }

    const db = getDb();

    // 1. Get all active challenges
    const challengesRes = await db.query(
      `SELECT id, challenge_type, difficulty, prompt, options, reward_paise
       FROM earn_challenges
       WHERE is_active = true;`
    );

    const allChallenges = challengesRes.rows || [];
    if (allChallenges.length === 0) {
      return {
        status: "error",
        data: null,
        error: "No challenges available right now.",
      };
    }

    // 2. Get recent attempts for anti-repetition (last 14 days)
    const historyRes = await db.query(
      `SELECT challenge_id, created_at
       FROM earn_attempts
       WHERE profile_id = $1
         AND created_at > NOW() - INTERVAL '14 days'
       ORDER BY created_at DESC;`,
      [profileId]
    );

    const history = historyRes.rows || [];

    // 3. Get today's attempted challenge types (IST)
    const todayTypesRes = await db.query(
      `SELECT DISTINCT ec.challenge_type
       FROM earn_attempts ea
       JOIN earn_challenges ec ON ec.id = ea.challenge_id
       WHERE ea.profile_id = $1
         AND (ea.created_at AT TIME ZONE 'Asia/Kolkata')::date = (NOW() AT TIME ZONE 'Asia/Kolkata')::date;`,
      [profileId]
    );

    const todayTypes = new Set(
      (todayTypesRes.rows || []).map((r) => r.challenge_type)
    );

    // 4. Build recency map: challenge_id -> days since last attempt
    const now = Date.now();
    const recencyMap = new Map<string, number>();
    for (const h of history) {
      const cid = h.challenge_id;
      if (!recencyMap.has(cid)) {
        const attemptDate =
          h.created_at instanceof Date ? h.created_at : new Date(h.created_at);
        const daysSince = (now - attemptDate.getTime()) / (1000 * 60 * 60 * 24);
        recencyMap.set(cid, daysSince);
      }
    }

    // 5. Score each challenge
    // Use today's IST date as seed for deterministic-per-day randomness
    const todayStr = new Date().toLocaleDateString("en-CA", {
      timeZone: "Asia/Kolkata",
    });

    const scored = allChallenges.map((c) => {
      // Deterministic pseudo-random based on challenge id + today's date
      let hash = 0;
      const seed = c.id + todayStr;
      for (let i = 0; i < seed.length; i++) {
        const chr = seed.charCodeAt(i);
        hash = (hash << 5) - hash + chr;
        hash |= 0;
      }
      const baseScore = ((hash >>> 0) % 10000) / 10000; // 0.0 to 1.0

      // Recency penalty
      let recencyMultiplier = 1.0;
      const daysSince = recencyMap.get(c.id);
      if (daysSince !== undefined) {
        if (daysSince < 3) recencyMultiplier = 0.05;
        else if (daysSince < 7) recencyMultiplier = 0.3;
        else if (daysSince < 14) recencyMultiplier = 0.6;
      }

      // Type diversity bonus
      const diversityMultiplier = todayTypes.has(c.challenge_type) ? 1.0 : 1.3;

      const finalScore = baseScore * recencyMultiplier * diversityMultiplier;

      return { challenge: c, score: finalScore };
    });

    // Sort by score descending and pick the best
    scored.sort((a, b) => b.score - a.score);
    const selected = scored[0].challenge;

    // Parse options safely
    let parsedOptions: string[] | null = null;
    if (selected.options) {
      try {
        parsedOptions =
          typeof selected.options === "string"
            ? JSON.parse(selected.options)
            : selected.options;
      } catch {
        parsedOptions = null;
      }
    }

    return {
      status: "success",
      data: {
        id: selected.id,
        challenge_type: selected.challenge_type as ChallengeType,
        difficulty: selected.difficulty,
        prompt: selected.prompt,
        options: parsedOptions,
        reward_paise: Number(selected.reward_paise),
      },
    };
  } catch (err) {
    console.error("[fetchNextChallenge]", err);
    return {
      status: "error",
      data: null,
      error: DB_UNAVAILABLE_MESSAGE,
    };
  }
}

/**
 * Submits a challenge answer atomically via claim_earn_reward stored procedure.
 * The client NEVER knows the correct answer before submission.
 */
export async function submitChallengeAnswer(params: {
  profileName: string;
  challengeId: string;
  submittedAnswer: string;
  idempotencyKey: string;
}): Promise<AsyncData<EarnAttemptResult>> {
  try {
    // 1. Validate profile server-side
    const profileId = resolveProfileId(params.profileName);
    if (!profileId) {
      return {
        status: "error",
        data: null,
        error: "Invalid participant selected.",
      };
    }

    // 2. Validate challenge ID format
    if (!params.challengeId || !UUID_REGEX.test(params.challengeId)) {
      return {
        status: "error",
        data: null,
        error: "Invalid challenge reference.",
      };
    }

    // 3. Validate answer
    const answer = (params.submittedAnswer || "").trim();
    if (answer.length === 0 || answer.length > 500) {
      return {
        status: "error",
        data: null,
        error: "Please provide a valid answer.",
      };
    }

    // 4. Validate idempotency key
    let validIdempotencyKey: string | null = null;
    if (params.idempotencyKey && UUID_REGEX.test(params.idempotencyKey)) {
      validIdempotencyKey = params.idempotencyKey;
    }

    // 5. Call atomic stored procedure
    const db = getDb();
    const result = await db.query(
      `SELECT claim_earn_reward($1, $2, $3, $4, $5) AS result;`,
      [
        DEFAULT_HOUSEHOLD_ID,
        profileId,
        params.challengeId,
        answer,
        validIdempotencyKey,
      ]
    );

    if (!result.rows || result.rows.length === 0) {
      return {
        status: "error",
        data: null,
        error: DB_UNAVAILABLE_MESSAGE,
      };
    }

    const res = result.rows[0].result as EarnAttemptResult;

    if (!res || !res.success) {
      return {
        status: "error",
        data: null,
        error: DB_UNAVAILABLE_MESSAGE,
      };
    }

    return {
      status: "success",
      data: {
        success: true,
        idempotent_replay: Boolean(res.idempotent_replay),
        attempt_id: res.attempt_id,
        is_correct: Boolean(res.is_correct),
        reward_paise: Number(res.reward_paise),
        streak_bonus_paise: Number(res.streak_bonus_paise || 0),
        total_earned_paise: Number(
          res.total_earned_paise ||
            Number(res.reward_paise) + Number(res.streak_bonus_paise || 0)
        ),
        challenge_id: res.challenge_id,
        today_game_earned_paise: Number(res.today_game_earned_paise || 0),
        daily_game_limit_paise: Number(res.daily_game_limit_paise || 5000),
        daily_limit_reached: Boolean(res.daily_limit_reached),
        current_streak: Number(res.current_streak || 0),
        best_streak: Number(res.best_streak || 0),
        milestone_reached: Boolean(res.milestone_reached),
        milestone_days: Number(res.milestone_days || 0),
        explanation: res.explanation || null,
      },
    };
  } catch (err: unknown) {
    console.error("[submitChallengeAnswer]", err);
    let clientMessage = DB_UNAVAILABLE_MESSAGE;
    if (err instanceof Error) {
      if (err.message.includes("not found or is no longer active")) {
        clientMessage = "This challenge is no longer available.";
      } else if (err.message.includes("does not belong")) {
        clientMessage = "Invalid participant selected.";
      }
    }
    return {
      status: "error",
      data: null,
      error: clientMessage,
    };
  }
}
