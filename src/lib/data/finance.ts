"use server";

import {
  DEFAULT_HOUSEHOLD_ID,
  DISHA_PROFILE_ID,
  getDb,
  SRUJAN_PROFILE_ID,
} from "@/lib/server/db";
import type {
  AsyncData,
  CoverageCheckResult,
  ExpenseCategory,
  ExpenseOwner,
  ExpenseRecord,
  HouseholdSummary,
} from "@/types";

const DB_UNAVAILABLE_MESSAGE = "We can\u2019t reach your data right now.";
const MAX_EXPENSE_PAISE = 100_000_000; // ₹10,00,000 (10 Lakh) maximum limit
const MAX_DAILY_RATE_PAISE = 5_000_000; // ₹50,000 / day maximum limit
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const VALID_CATEGORIES: ExpenseCategory[] = [
  "food",
  "coffee_tea",
  "groceries",
  "sweets",
  "drinks",
  "other",
];

/**
 * Fetches the aggregate ledger summary for the private household.
 * Always computes balance dynamically directly from the ledger.
 */
export async function fetchHouseholdSummary(): Promise<
  AsyncData<HouseholdSummary>
> {
  try {
    const db = getDb();
    const result = await db.query(
      "SELECT get_household_summary($1) AS summary;",
      [DEFAULT_HOUSEHOLD_ID]
    );

    if (!result.rows || result.rows.length === 0) {
      return {
        status: "error",
        data: null,
        error: DB_UNAVAILABLE_MESSAGE,
      };
    }

    const summary = result.rows[0].summary as HouseholdSummary;
    return {
      status: "success",
      data: summary,
    };
  } catch (err) {
    console.error("[fetchHouseholdSummary]", err);
    return {
      status: "error",
      data: null,
      error: DB_UNAVAILABLE_MESSAGE,
    };
  }
}

/**
 * Idempotent allowance catch-up processor.
 * Guarantees all missing days up to today are credited without duplicates.
 */
export async function runAllowanceCatchUp(): Promise<
  AsyncData<{ allowances_created: number }>
> {
  try {
    const db = getDb();
    const result = await db.query(
      "SELECT process_household_allowances($1, CURRENT_DATE) AS res;",
      [DEFAULT_HOUSEHOLD_ID]
    );

    if (!result.rows || result.rows.length === 0) {
      return {
        status: "error",
        data: null,
        error: DB_UNAVAILABLE_MESSAGE,
      };
    }

    const res = result.rows[0].res as { allowances_created: number };
    return {
      status: "success",
      data: res,
    };
  } catch (err) {
    console.error("[runAllowanceCatchUp]", err);
    return {
      status: "error",
      data: null,
      error: DB_UNAVAILABLE_MESSAGE,
    };
  }
}

/**
 * Checks expense eligibility and identifies shortfall coverage needs.
 * Enforces strict server-side validation on bounds and owners.
 */
export async function checkExpenseCoverage(params: {
  totalAmountPaise: number;
  owner: ExpenseOwner;
  srujanSplitPaise?: number;
  dishaSplitPaise?: number;
}): Promise<AsyncData<CoverageCheckResult>> {
  try {
    // 1. Strict server-side validation
    if (
      !Number.isInteger(params.totalAmountPaise) ||
      params.totalAmountPaise <= 0 ||
      params.totalAmountPaise > MAX_EXPENSE_PAISE
    ) {
      return {
        status: "error",
        data: null,
        error: "Expense amount must be a valid positive amount.",
      };
    }

    if (!["srujan", "disha", "both"].includes(params.owner)) {
      return {
        status: "error",
        data: null,
        error: "Invalid expense owner specified.",
      };
    }

    if (
      params.srujanSplitPaise !== undefined &&
      (!Number.isInteger(params.srujanSplitPaise) || params.srujanSplitPaise < 0)
    ) {
      return {
        status: "error",
        data: null,
        error: "Invalid Srujan contribution amount.",
      };
    }

    if (
      params.dishaSplitPaise !== undefined &&
      (!Number.isInteger(params.dishaSplitPaise) || params.dishaSplitPaise < 0)
    ) {
      return {
        status: "error",
        data: null,
        error: "Invalid Disha contribution amount.",
      };
    }

    if (
      params.srujanSplitPaise !== undefined &&
      params.dishaSplitPaise !== undefined &&
      params.srujanSplitPaise + params.dishaSplitPaise !== params.totalAmountPaise
    ) {
      return {
        status: "error",
        data: null,
        error: "Contribution amounts must equal the total expense.",
      };
    }

    const db = getDb();
    const result = await db.query(
      "SELECT check_expense_coverage($1, $2, $3, $4, $5) AS check_res;",
      [
        DEFAULT_HOUSEHOLD_ID,
        params.totalAmountPaise,
        params.owner,
        params.srujanSplitPaise ?? null,
        params.dishaSplitPaise ?? null,
      ]
    );

    if (!result.rows || result.rows.length === 0) {
      return {
        status: "error",
        data: null,
        error: DB_UNAVAILABLE_MESSAGE,
      };
    }

    const rawCheck = result.rows[0].check_res as Record<string, unknown>;
    const checkRes: CoverageCheckResult = {
      status: rawCheck.status as CoverageCheckResult["status"],
      allowed: Boolean(rawCheck.allowed),
      needs_coverage: Boolean(rawCheck.needs_coverage),
      short_user: (rawCheck.short_user || rawCheck.user) as
        | "Srujan"
        | "Disha"
        | undefined,
      covering_user: rawCheck.covering_user as "Srujan" | "Disha" | undefined,
      shortfall_paise:
        typeof rawCheck.shortfall_paise === "number"
          ? rawCheck.shortfall_paise
          : undefined,
      proposed_srujan_paise:
        typeof rawCheck.proposed_srujan_paise === "number"
          ? rawCheck.proposed_srujan_paise
          : undefined,
      proposed_disha_paise:
        typeof rawCheck.proposed_disha_paise === "number"
          ? rawCheck.proposed_disha_paise
          : undefined,
      adjusted_srujan_paise:
        typeof rawCheck.adjusted_srujan_paise === "number"
          ? rawCheck.adjusted_srujan_paise
          : undefined,
      adjusted_disha_paise:
        typeof rawCheck.adjusted_disha_paise === "number"
          ? rawCheck.adjusted_disha_paise
          : undefined,
      resulting_srujan_balance_paise:
        typeof rawCheck.resulting_srujan_balance_paise === "number"
          ? rawCheck.resulting_srujan_balance_paise
          : undefined,
      resulting_disha_balance_paise:
        typeof rawCheck.resulting_disha_balance_paise === "number"
          ? rawCheck.resulting_disha_balance_paise
          : undefined,
      srujan_paise:
        typeof rawCheck.srujan_paise === "number"
          ? rawCheck.srujan_paise
          : undefined,
      disha_paise:
        typeof rawCheck.disha_paise === "number"
          ? rawCheck.disha_paise
          : undefined,
      message:
        typeof rawCheck.message === "string" ? rawCheck.message : undefined,
    };

    return {
      status: "success",
      data: checkRes,
    };
  } catch (err) {
    console.error("[checkExpenseCoverage]", err);
    return {
      status: "error",
      data: null,
      error: DB_UNAVAILABLE_MESSAGE,
    };
  }
}

/**
 * Commits an expense and its corresponding debits atomically inside a single database transaction.
 * Strictly prevents negative balances at the database level.
 * Supports idempotency key to prevent accidental duplicate charges.
 */
export async function recordExpenseAtomic(params: {
  totalAmountPaise: number;
  owner: ExpenseOwner;
  category: ExpenseCategory;
  srujanAmountPaise: number;
  dishaAmountPaise: number;
  note?: string;
  coverageApproved?: boolean;
  coverageFromName?: string;
  coverageAmountPaise?: number;
  idempotencyKey?: string;
}): Promise<AsyncData<{ expense_id: string }>> {
  try {
    // 1. Strict server-side validation
    if (
      !Number.isInteger(params.totalAmountPaise) ||
      params.totalAmountPaise <= 0 ||
      params.totalAmountPaise > MAX_EXPENSE_PAISE
    ) {
      return {
        status: "error",
        data: null,
        error: "Expense amount must be a valid positive amount.",
      };
    }

    if (!["srujan", "disha", "both"].includes(params.owner)) {
      return {
        status: "error",
        data: null,
        error: "Invalid expense owner specified.",
      };
    }

    if (!params.category || !VALID_CATEGORIES.includes(params.category)) {
      return {
        status: "error",
        data: null,
        error: "A valid expense category is required.",
      };
    }

    if (
      !Number.isInteger(params.srujanAmountPaise) ||
      params.srujanAmountPaise < 0 ||
      !Number.isInteger(params.dishaAmountPaise) ||
      params.dishaAmountPaise < 0
    ) {
      return {
        status: "error",
        data: null,
        error: "Contributions must be non-negative integers.",
      };
    }

    if (
      params.srujanAmountPaise + params.dishaAmountPaise !==
      params.totalAmountPaise
    ) {
      return {
        status: "error",
        data: null,
        error: "Contribution amounts must equal total expense amount.",
      };
    }

    // Sanitize note
    const sanitizedNote = params.note
      ? params.note.trim().slice(0, 255)
      : null;

    // Validate idempotency key format if supplied
    let validIdempotencyKey: string | null = null;
    if (params.idempotencyKey) {
      if (UUID_REGEX.test(params.idempotencyKey)) {
        validIdempotencyKey = params.idempotencyKey;
      }
    }

    // Determine createdBy profile strictly server-side
    const createdBy =
      params.owner === "disha" ? DISHA_PROFILE_ID : SRUJAN_PROFILE_ID;

    const db = getDb();
    const result = await db.query(
      `SELECT record_expense_atomic($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) AS record_res;`,
      [
        DEFAULT_HOUSEHOLD_ID,
        createdBy,
        params.totalAmountPaise,
        params.owner,
        params.srujanAmountPaise,
        params.dishaAmountPaise,
        sanitizedNote,
        params.coverageApproved ?? false,
        params.coverageFromName ?? null,
        params.coverageAmountPaise ?? 0,
        validIdempotencyKey,
        params.category,
      ]
    );

    if (!result.rows || result.rows.length === 0) {
      return {
        status: "error",
        data: null,
        error: DB_UNAVAILABLE_MESSAGE,
      };
    }

    const recordRes = result.rows[0].record_res as {
      success: boolean;
      expense_id: string;
      idempotent_replay?: boolean;
    };

    if (!recordRes || !recordRes.success) {
      return {
        status: "error",
        data: null,
        error: DB_UNAVAILABLE_MESSAGE,
      };
    }

    return {
      status: "success",
      data: { expense_id: recordRes.expense_id },
    };
  } catch (err: unknown) {
    console.error("[recordExpenseAtomic]", err);
    let clientMessage = DB_UNAVAILABLE_MESSAGE;
    if (err instanceof Error) {
      if (err.message.includes("cannot become negative")) {
        clientMessage = "Expense exceeds available balance.";
      } else if (err.message.includes("do not equal total")) {
        clientMessage = "Contribution amounts must equal total expense.";
      }
    }
    return {
      status: "error",
      data: null,
      error: clientMessage,
    };
  }
}

/**
 * Fetches recent chronological expense records.
 * Strictly scopes query to DEFAULT_HOUSEHOLD_ID.
 */
export async function fetchRecentExpenses(
  limit: number = 20
): Promise<AsyncData<ExpenseRecord[]>> {
  try {
    const validLimit = Math.max(1, Math.min(100, Math.floor(limit) || 20));
    const db = getDb();
    const result = await db.query(
      `SELECT 
        id, household_id, created_by, total_amount_paise, owner, category,
        srujan_amount_paise, disha_amount_paise, note, coverage_approved,
        coverage_from, coverage_amount_paise, created_at
       FROM expenses
       WHERE household_id = $1
       ORDER BY created_at DESC
       LIMIT $2;`,
      [DEFAULT_HOUSEHOLD_ID, validLimit]
    );

    const expenses = (result.rows || []).map((r) => ({
      id: r.id,
      household_id: r.household_id,
      created_by: r.created_by,
      total_amount_paise: r.total_amount_paise,
      owner: r.owner,
      category: (r.category as ExpenseCategory) || "other",
      srujan_amount_paise: r.srujan_amount_paise,
      disha_amount_paise: r.disha_amount_paise,
      note: r.note,
      coverage_approved: r.coverage_approved,
      coverage_from: r.coverage_from,
      coverage_amount_paise: r.coverage_amount_paise,
      created_at:
        r.created_at instanceof Date
          ? r.created_at.toISOString()
          : String(r.created_at),
    }));

    return {
      status: "success",
      data: expenses,
    };
  } catch (err) {
    console.error("[fetchRecentExpenses]", err);
    return {
      status: "error",
      data: null,
      error: DB_UNAVAILABLE_MESSAGE,
    };
  }
}

/**
 * Updates daily allowance from an effective date forward.
 * Historical entries remain untouched.
 */
export async function updateDailyAllowance(params: {
  dailyRatePaise: number;
  effectiveFrom: string; // YYYY-MM-DD
}): Promise<AsyncData<{ updated: boolean }>> {
  try {
    // 1. Strict server-side validation
    if (
      !Number.isInteger(params.dailyRatePaise) ||
      params.dailyRatePaise <= 0 ||
      params.dailyRatePaise > MAX_DAILY_RATE_PAISE
    ) {
      return {
        status: "error",
        data: null,
        error: "Daily allowance must be a valid positive amount.",
      };
    }

    if (
      !DATE_REGEX.test(params.effectiveFrom) ||
      isNaN(Date.parse(params.effectiveFrom))
    ) {
      return {
        status: "error",
        data: null,
        error: "Effective date must be a valid date in YYYY-MM-DD format.",
      };
    }

    const db = getDb();

    await db.query(
      `INSERT INTO allowance_config (household_id, daily_rate_paise, effective_from)
       VALUES ($1, $2, $3)
       ON CONFLICT (household_id, effective_from) 
       DO UPDATE SET daily_rate_paise = EXCLUDED.daily_rate_paise;`,
      [DEFAULT_HOUSEHOLD_ID, params.dailyRatePaise, params.effectiveFrom]
    );

    // Trigger catch-up with the new rate configuration
    await runAllowanceCatchUp();

    return {
      status: "success",
      data: { updated: true },
    };
  } catch (err) {
    console.error("[updateDailyAllowance]", err);
    return {
      status: "error",
      data: null,
      error: DB_UNAVAILABLE_MESSAGE,
    };
  }
}
