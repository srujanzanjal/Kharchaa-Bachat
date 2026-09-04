import type { USERS } from "@/lib/constants";

// ── Users ──────────────────────────────────────────

/** The two registered users */
export type User = (typeof USERS)[number];

/** Who an expense belongs to (DB enum lowercase, or visual display) */
export type ExpenseOwner = "srujan" | "disha" | "both";

/** Expense category — must match the expense_category enum in PostgreSQL */
export type ExpenseCategory =
  | "food"
  | "coffee_tea"
  | "groceries"
  | "sweets"
  | "drinks"
  | "other";

/** Human-readable display labels for each category */
export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  food: "Food",
  coffee_tea: "Coffee & Tea",
  groceries: "Groceries",
  sweets: "Sweets",
  drinks: "Drinks",
  other: "Other",
};

/** Visual icons for each category */
export const EXPENSE_CATEGORY_ICONS: Record<ExpenseCategory, string> = {
  food: "🍕",
  coffee_tea: "☕",
  groceries: "🛒",
  sweets: "🍰",
  drinks: "🥤",
  other: "📝",
};

/** Ordered list of category options for selectors */
export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  "food",
  "coffee_tea",
  "groceries",
  "sweets",
  "drinks",
  "other",
];

export type LedgerType = "allowance" | "expense_debit" | "manual_credit" | "earn_credit";
export type FlowType = "credit" | "debit";
export type CreditKind = "allowance" | "earn" | "streak" | "manual";

export interface HistoryLedgerItem {
  id: string;
  flowType: FlowType;
  amountPaise: number;
  owner: ExpenseOwner | string;
  category?: ExpenseCategory | null;
  creditKind?: CreditKind | null;
  title: string;
  icon: string;
  note?: string | null;
  splitDetail?: string | null;
  srujanAmountPaise?: number | null;
  dishaAmountPaise?: number | null;
  coverageApproved?: boolean | null;
  createdAt: string;
  allowanceDate?: string | null;
  effectiveDate?: string | null;
}

// ── Database Models ────────────────────────────────

export interface Profile {
  id: string;
  display_name: string;
  household_id: string;
  created_at: string;
}

export interface AllowanceConfig {
  id: string;
  household_id: string;
  daily_rate_paise: number;
  effective_from: string; // YYYY-MM-DD
  created_at: string;
}

export interface ExpenseRecord {
  id: string;
  household_id: string;
  created_by: string;
  total_amount_paise: number;
  owner: ExpenseOwner;
  category: ExpenseCategory;
  srujan_amount_paise: number;
  disha_amount_paise: number;
  note: string | null;
  coverage_approved: boolean;
  coverage_from: string | null;
  coverage_amount_paise: number;
  created_at: string;
}

export interface LedgerEntry {
  id: string;
  household_id: string;
  user_id: string;
  entry_type: LedgerType;
  amount_paise: number;
  reference_id: string | null;
  allowance_date: string | null;
  description: string | null;
  created_at: string;
}

// ── Aggregate Financial State ──────────────────────

export interface UserBalance {
  id: string | null;
  name: User;
  balance_paise: number;
  balance_rupees: number;
}

export interface HouseholdSummary {
  household_id: string;
  srujan: {
    id: string | null;
    balance_paise: number;
  };
  disha: {
    id: string | null;
    balance_paise: number;
  };
  combined_paise: number;
  daily_rate_paise: number;
}

// ── Expense Shortfall & Coverage Check Results ─────

export type CoverageStatus =
  | "ok"
  | "needs_coverage"
  | "insufficient_combined_balance"
  | "insufficient_individual_balance"
  | "cannot_cover"
  | "invalid_split"
  | "invalid_owner";

export interface CoverageCheckResult {
  status: CoverageStatus;
  allowed: boolean;
  needs_coverage?: boolean;
  short_user?: "Srujan" | "Disha";
  covering_user?: "Srujan" | "Disha";
  shortfall_paise?: number;
  proposed_srujan_paise?: number;
  proposed_disha_paise?: number;
  adjusted_srujan_paise?: number;
  adjusted_disha_paise?: number;
  resulting_srujan_balance_paise?: number;
  resulting_disha_balance_paise?: number;
  srujan_paise?: number;
  disha_paise?: number;
  message?: string;
}

// ── Application Async State ────────────────────────

export type DataStatus = "idle" | "loading" | "success" | "error";

export type AsyncData<T> = {
  status: DataStatus;
  data: T | null;
  error?: string;
};

// ── Monthly Recap & Awards ─────────────────────────

export interface CategorySpending {
  category: ExpenseCategory;
  label: string;
  total_paise: number;
  percentage: number;
  expense_count: number;
}

export interface MonthlyAward {
  id: string;
  title: string;
  icon: string;
  recipient: string;
  detail: string;
}

export interface MonthlyRecapData {
  year: number;
  month: number;
  month_name: string;
  total_spent_paise: number;
  expense_count: number;
  average_expense_paise: number;
  largest_expense: {
    id: string;
    total_amount_paise: number;
    owner: ExpenseOwner;
    category: ExpenseCategory;
    note: string | null;
    created_at: string;
  } | null;
  largest_category: {
    category: ExpenseCategory;
    label: string;
    total_paise: number;
    percentage: number;
  } | null;
  categories: CategorySpending[];
  awards: MonthlyAward[];
  headline: string;
  subheadline: string;
  srujan_total_paise: number;
  disha_total_paise: number;
}

// ── V2-C: Earn lil Kharchaa ────────────────────────

export type ChallengeType =
  | "number_sequence"
  | "logic"
  | "pattern"
  | "arithmetic"
  | "riddle"
  | "probability"
  | "comparison"
  | "odd_one_out"
  | "deduction";

export type ChallengeDifficulty = "easy" | "medium" | "hard";

/** Client-safe challenge (correct_answer is NEVER sent to client) */
export interface EarnChallenge {
  id: string;
  challenge_type: ChallengeType;
  difficulty: ChallengeDifficulty;
  prompt: string;
  options: string[] | null;
  reward_paise: number;
}

export interface EarnAttemptRecord {
  id: string;
  challenge_id: string;
  challenge_type: ChallengeType;
  is_correct: boolean;
  reward_paise: number;
  created_at: string;
}

export interface EarnAttemptResult {
  success: boolean;
  idempotent_replay: boolean;
  attempt_id: string;
  is_correct: boolean;
  reward_paise: number; // game reward
  streak_bonus_paise: number; // add-on streak bonus
  total_earned_paise: number; // reward_paise + streak_bonus_paise
  challenge_id: string;
  today_game_earned_paise: number;
  daily_game_limit_paise: number;
  daily_limit_reached: boolean;
  current_streak: number;
  best_streak: number;
  milestone_reached: boolean;
  milestone_days: number;
  explanation: string | null;
}

// ── V2-E: Daily Earn Streaks + Bonus Rewards ────────

export type StreakMilestoneDays = 3 | 7 | 14 | 30;

export interface StreakMilestoneInfo {
  days: StreakMilestoneDays;
  reward_paise: number;
  is_unlocked: boolean;
  is_next: boolean;
}

export interface UserStreakData {
  current_streak: number;
  best_streak: number;
  streak_earnings_paise: number;
  milestones: StreakMilestoneInfo[];
  next_milestone: StreakMilestoneInfo | null;
  last_qualifying_date: string | null;
}

export interface EarnStatus {
  today_game_earned_paise: number;
  today_streak_earned_paise: number;
  today_total_earned_paise: number;
  today_earned_paise: number; // backward-compatible alias for total earned today
  daily_game_limit_paise: number;
  daily_limit_paise: number; // backward-compatible alias for daily game limit (5000 paise)
  remaining_game_paise: number;
  remaining_paise: number; // backward-compatible alias for remaining game allowance
  daily_limit_reached: boolean;
  recent_attempts: EarnAttemptRecord[];
  streak: UserStreakData;
}
