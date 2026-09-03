/** Branding — keep centralised so renaming the product is a single change */
export const APP_NAME = "Kharchaa Bachat";

/** Supporting copy — use sparingly */
export const APP_TAGLINE = "A little kharchaa. A little bachat.";

/** The two users of this application */
export const USERS = ["Srujan", "Disha"] as const;

/** Currency configuration */
export const CURRENCY = {
  symbol: "₹",
  code: "INR",
  locale: "en-IN",
} as const;

/** Starting daily allowance per person (₹) */
export const DAILY_ALLOWANCE = 50;

/** Navigation items */
export const NAV_ITEMS = [
  { label: "Home", href: "/", id: "home" },
  { label: "Recap", href: "/recap", id: "recap" },
  { label: "Add", href: "/add", id: "add" },
  { label: "History", href: "/history", id: "history" },
  { label: "Settings", href: "/settings", id: "settings" },
] as const;

/** V2-C: Earn lil Kharchaa */
export const DAILY_EARN_LIMIT_PAISE = 5000; // ₹50

export const CHALLENGE_TYPE_LABELS: Record<string, string> = {
  number_sequence: "Number Sequence",
  logic: "Logic",
  pattern: "Pattern",
  arithmetic: "Arithmetic",
  riddle: "Riddle",
  probability: "Probability",
  comparison: "Comparison",
  odd_one_out: "Odd One Out",
  deduction: "Deduction",
};

export const CHALLENGE_TYPE_ICONS: Record<string, string> = {
  number_sequence: "🔢",
  logic: "🧠",
  pattern: "🔄",
  arithmetic: "➗",
  riddle: "🤔",
  probability: "🎲",
  comparison: "⚖️",
  odd_one_out: "🔍",
  deduction: "🕵️",
};

export const DIFFICULTY_LABELS: Record<string, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
};

export interface StreakMilestoneConfig {
  days: 3 | 7 | 14 | 30;
  rewardPaise: number;
  rewardRupees: number;
  label: string;
}

export const STREAK_MILESTONES: StreakMilestoneConfig[] = [
  { days: 3, rewardPaise: 1000, rewardRupees: 10, label: "+₹10" },
  { days: 7, rewardPaise: 2000, rewardRupees: 20, label: "+₹20" },
  { days: 14, rewardPaise: 5000, rewardRupees: 50, label: "+₹50" },
  { days: 30, rewardPaise: 10000, rewardRupees: 100, label: "+₹100" },
];


