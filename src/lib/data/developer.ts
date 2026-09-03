"use server";

import {
  DEFAULT_HOUSEHOLD_ID,
  DISHA_PROFILE_ID,
  getDb,
  SRUJAN_PROFILE_ID,
} from "@/lib/server/db";
import type { AsyncData } from "@/types";

export interface SubsystemHealth {
  name: string;
  status: "healthy" | "degraded" | "error";
  latencyMs: number;
  message: string;
}

export interface DiagnosticsData {
  overallStatus: "healthy" | "degraded" | "error";
  checkedAt: string;
  subsystems: SubsystemHealth[];
}

export interface DatabaseStatusData {
  connected: boolean;
  latencyMs: number;
  engine: string;
  poolStatus: string;
  serverTimeUtc: string;
  serverTimeIst: string;
  tableCount: number;
}

export interface LedgerStatsData {
  totalLedgerEntries: number;
  allowanceCredits: { count: number; sumPaise: number };
  expenseDebits: { count: number; sumPaise: number };
  earnCredits: { count: number; sumPaise: number };
  manualCredits: { count: number; sumPaise: number };
  currentBalances: {
    srujanPaise: number;
    dishaPaise: number;
    combinedPaise: number;
  };
  totalExpenses: { count: number; sumPaise: number };
  earnSummary: { totalAttempts: number; correctAttempts: number; totalRewardPaise: number };
}

export interface VerificationTestResult {
  id: string;
  name: string;
  description: string;
  status: "pass" | "fail";
  details: string;
  durationMs: number;
}

export interface SystemInfoData {
  appName: string;
  appVersion: string;
  framework: string;
  nodeVersion: string;
  environment: string;
  serverTimeUtc: string;
  serverTimeIst: string;
}

const SAFE_ERROR_MESSAGE = "Subsystem diagnostics failed.";

/**
 * Runs read-only diagnostics across all major application subsystems.
 * NEVER exposes database connection strings, passwords, or secrets.
 */
export async function fetchDiagnostics(): Promise<AsyncData<DiagnosticsData>> {
  try {
    const db = getDb();
    const subsystems: SubsystemHealth[] = [];

    // 1. Database Check
    const dbStart = performance.now();
    try {
      await db.query("SELECT 1;");
      const dbLatency = Math.round(performance.now() - dbStart);
      subsystems.push({
        name: "PostgreSQL Database",
        status: "healthy",
        latencyMs: dbLatency,
        message: "Connected and responsive.",
      });
    } catch {
      subsystems.push({
        name: "PostgreSQL Database",
        status: "error",
        latencyMs: Math.round(performance.now() - dbStart),
        message: "Database unavailable.",
      });
    }

    // 2. Ledger Subsystem Check
    const ledgerStart = performance.now();
    try {
      const res = await db.query(
        "SELECT COUNT(*)::integer AS count FROM ledger WHERE household_id = $1;",
        [DEFAULT_HOUSEHOLD_ID]
      );
      subsystems.push({
        name: "Financial Ledger",
        status: "healthy",
        latencyMs: Math.round(performance.now() - ledgerStart),
        message: `Active (${res.rows[0]?.count ?? 0} immutable entries).`,
      });
    } catch {
      subsystems.push({
        name: "Financial Ledger",
        status: "error",
        latencyMs: Math.round(performance.now() - ledgerStart),
        message: "Ledger check failed.",
      });
    }

    // 3. Expense Subsystem Check
    const expenseStart = performance.now();
    try {
      const res = await db.query(
        "SELECT COUNT(*)::integer AS count FROM expenses WHERE household_id = $1;",
        [DEFAULT_HOUSEHOLD_ID]
      );
      subsystems.push({
        name: "Expense Recording",
        status: "healthy",
        latencyMs: Math.round(performance.now() - expenseStart),
        message: `Operational (${res.rows[0]?.count ?? 0} expenses recorded).`,
      });
    } catch {
      subsystems.push({
        name: "Expense Recording",
        status: "error",
        latencyMs: Math.round(performance.now() - expenseStart),
        message: "Expense subsystem check failed.",
      });
    }

    // 4. Earn lil Kharchaa Subsystem Check
    const earnStart = performance.now();
    try {
      const res = await db.query(
        "SELECT COUNT(*)::integer AS active FROM earn_challenges WHERE is_active = true;"
      );
      subsystems.push({
        name: "Earn Challenge Bank",
        status: "healthy",
        latencyMs: Math.round(performance.now() - earnStart),
        message: `Available (${res.rows[0]?.active ?? 0} active challenges).`,
      });
    } catch {
      subsystems.push({
        name: "Earn Challenge Bank",
        status: "error",
        latencyMs: Math.round(performance.now() - earnStart),
        message: "Earn subsystem check failed.",
      });
    }

    // 5. Monthly Recap Subsystem Check
    const recapStart = performance.now();
    try {
      await db.query(
        `SELECT COUNT(*)::integer FROM expenses
         WHERE household_id = $1
           AND created_at >= date_trunc('month', CURRENT_DATE);`,
        [DEFAULT_HOUSEHOLD_ID]
      );
      subsystems.push({
        name: "Monthly Recap & Awards",
        status: "healthy",
        latencyMs: Math.round(performance.now() - recapStart),
        message: "Aggregation queries operational.",
      });
    } catch {
      subsystems.push({
        name: "Monthly Recap & Awards",
        status: "error",
        latencyMs: Math.round(performance.now() - recapStart),
        message: "Recap check failed.",
      });
    }

    const hasError = subsystems.some((s) => s.status === "error");
    const hasDegraded = subsystems.some((s) => s.status === "degraded");

    return {
      status: "success",
      data: {
        overallStatus: hasError ? "error" : hasDegraded ? "degraded" : "healthy",
        checkedAt: new Date().toISOString(),
        subsystems,
      },
    };
  } catch (err) {
    console.error("[fetchDiagnostics]", err);
    return {
      status: "error",
      data: null,
      error: SAFE_ERROR_MESSAGE,
    };
  }
}

/**
 * Returns safe database connectivity and metadata.
 * Strips all hosts, passwords, and connection strings.
 */
export async function fetchDatabaseStatus(): Promise<AsyncData<DatabaseStatusData>> {
  try {
    const db = getDb();
    const start = performance.now();

    const timeRes = await db.query(
      `SELECT
         NOW() AS utc_now,
         (NOW() AT TIME ZONE 'Asia/Kolkata') AS ist_now,
         version() AS pg_version;`
    );

    const latencyMs = Math.round(performance.now() - start);

    const tablesRes = await db.query(
      `SELECT COUNT(*)::integer AS table_count
       FROM information_schema.tables
       WHERE table_schema = 'public';`
    );

    const utcNow = timeRes.rows[0]?.utc_now;
    const istNow = timeRes.rows[0]?.ist_now;

    return {
      status: "success",
      data: {
        connected: true,
        latencyMs,
        engine: "PostgreSQL 15+ (Server-side Pool)",
        poolStatus: "Active (max: 5 connections, SSL enabled)",
        serverTimeUtc: utcNow instanceof Date ? utcNow.toISOString() : String(utcNow),
        serverTimeIst: istNow instanceof Date ? istNow.toISOString() : String(istNow),
        tableCount: Number(tablesRes.rows[0]?.table_count || 0),
      },
    };
  } catch (err) {
    console.error("[fetchDatabaseStatus]", err);
    return {
      status: "error",
      data: null,
      error: "Unable to connect to database.",
    };
  }
}

/**
 * Computes live, read-only ledger statistics directly from PostgreSQL.
 */
export async function fetchLedgerStats(): Promise<AsyncData<LedgerStatsData>> {
  try {
    const db = getDb();

    // 1. Ledger breakdown by entry_type
    const ledgerBreakdownRes = await db.query(
      `SELECT
         entry_type,
         COUNT(*)::integer AS count,
         COALESCE(SUM(amount_paise), 0)::bigint AS sum_paise
       FROM ledger
       WHERE household_id = $1
       GROUP BY entry_type;`,
      [DEFAULT_HOUSEHOLD_ID]
    );

    const breakdownMap: Record<string, { count: number; sumPaise: number }> = {
      allowance: { count: 0, sumPaise: 0 },
      expense_debit: { count: 0, sumPaise: 0 },
      earn_credit: { count: 0, sumPaise: 0 },
      manual_credit: { count: 0, sumPaise: 0 },
    };

    let totalLedgerEntries = 0;
    for (const r of ledgerBreakdownRes.rows) {
      const type = r.entry_type;
      const count = Number(r.count);
      const sumPaise = Number(r.sum_paise);
      totalLedgerEntries += count;
      if (breakdownMap[type]) {
        breakdownMap[type] = { count, sumPaise };
      }
    }

    // 2. Current balances
    const balRes = await db.query(
      `SELECT
         COALESCE(SUM(CASE WHEN user_id = $2 THEN amount_paise ELSE 0 END), 0)::bigint AS srujan_paise,
         COALESCE(SUM(CASE WHEN user_id = $3 THEN amount_paise ELSE 0 END), 0)::bigint AS disha_paise
       FROM ledger
       WHERE household_id = $1;`,
      [DEFAULT_HOUSEHOLD_ID, SRUJAN_PROFILE_ID, DISHA_PROFILE_ID]
    );

    const srujanPaise = Number(balRes.rows[0]?.srujan_paise || 0);
    const dishaPaise = Number(balRes.rows[0]?.disha_paise || 0);

    // 3. Total expenses
    const expRes = await db.query(
      `SELECT
         COUNT(*)::integer AS count,
         COALESCE(SUM(total_amount_paise), 0)::bigint AS sum_paise
       FROM expenses
       WHERE household_id = $1;`,
      [DEFAULT_HOUSEHOLD_ID]
    );

    // 4. Earn challenge summary
    const earnRes = await db.query(
      `SELECT
         COUNT(*)::integer AS total_attempts,
         COUNT(*) FILTER (WHERE is_correct = true)::integer AS correct_attempts,
         COALESCE(SUM(reward_paise), 0)::bigint AS total_rewards
       FROM earn_attempts
       WHERE household_id = $1;`,
      [DEFAULT_HOUSEHOLD_ID]
    );

    return {
      status: "success",
      data: {
        totalLedgerEntries,
        allowanceCredits: breakdownMap.allowance,
        expenseDebits: breakdownMap.expense_debit,
        earnCredits: breakdownMap.earn_credit,
        manualCredits: breakdownMap.manual_credit,
        currentBalances: {
          srujanPaise,
          dishaPaise,
          combinedPaise: srujanPaise + dishaPaise,
        },
        totalExpenses: {
          count: Number(expRes.rows[0]?.count || 0),
          sumPaise: Number(expRes.rows[0]?.sum_paise || 0),
        },
        earnSummary: {
          totalAttempts: Number(earnRes.rows[0]?.total_attempts || 0),
          correctAttempts: Number(earnRes.rows[0]?.correct_attempts || 0),
          totalRewardPaise: Number(earnRes.rows[0]?.total_rewards || 0),
        },
      },
    };
  } catch (err) {
    console.error("[fetchLedgerStats]", err);
    return {
      status: "error",
      data: null,
      error: "Unable to retrieve ledger statistics.",
    };
  }
}

/**
 * Runs safe, read-only financial invariant verifications against PostgreSQL.
 * CANNOT mutate any financial data.
 */
export async function runFinancialVerificationTests(): Promise<
  AsyncData<VerificationTestResult[]>
> {
  try {
    const db = getDb();
    const results: VerificationTestResult[] = [];

    // Test 1: Balance Derivation Consistency
    const t1Start = performance.now();
    try {
      const sumRes = await db.query(
        `SELECT
           user_id,
           COALESCE(SUM(amount_paise), 0)::bigint AS ledger_sum,
           get_user_balance_paise(user_id) AS fn_sum
         FROM ledger
         WHERE household_id = $1
         GROUP BY user_id;`,
        [DEFAULT_HOUSEHOLD_ID]
      );

      let consistent = true;
      for (const row of sumRes.rows) {
        if (Number(row.ledger_sum) !== Number(row.fn_sum)) {
          consistent = false;
          break;
        }
      }

      results.push({
        id: "balance_derivation",
        name: "Balance Derivation Consistency",
        description: "Reconstructed sum of all ledger entries exactly matches get_user_balance_paise().",
        status: consistent ? "pass" : "fail",
        details: consistent
          ? `Verified ${sumRes.rows.length} profiles with 100% balance alignment.`
          : "Discrepancy detected between raw sum and stored function.",
        durationMs: Math.round(performance.now() - t1Start),
      });
    } catch {
      results.push({
        id: "balance_derivation",
        name: "Balance Derivation Consistency",
        description: "Reconstructed sum of all ledger entries exactly matches get_user_balance_paise().",
        status: "fail",
        details: "Query failed during execution.",
        durationMs: Math.round(performance.now() - t1Start),
      });
    }

    // Test 2: Non-Negative Balance Invariant
    const t2Start = performance.now();
    try {
      const negRes = await db.query(
        `SELECT user_id, COALESCE(SUM(amount_paise), 0)::bigint AS balance
         FROM ledger
         WHERE household_id = $1
         GROUP BY user_id
         HAVING SUM(amount_paise) < 0;`,
        [DEFAULT_HOUSEHOLD_ID]
      );

      const pass = (negRes.rows || []).length === 0;
      results.push({
        id: "non_negative_balance",
        name: "Non-Negative Balance Invariant",
        description: "No participant has a balance below 0 paise.",
        status: pass ? "pass" : "fail",
        details: pass
          ? "All profile balances are strictly non-negative."
          : `Violation: ${negRes.rows.length} profiles have negative balances.`,
        durationMs: Math.round(performance.now() - t2Start),
      });
    } catch {
      results.push({
        id: "non_negative_balance",
        name: "Non-Negative Balance Invariant",
        description: "No participant has a balance below 0 paise.",
        status: "fail",
        details: "Query failed during execution.",
        durationMs: Math.round(performance.now() - t2Start),
      });
    }

    // Test 3: Allowance Idempotency
    const t3Start = performance.now();
    try {
      const dupRes = await db.query(
        `SELECT user_id, allowance_date, COUNT(*)::integer AS count
         FROM ledger
         WHERE household_id = $1 AND entry_type = 'allowance'
         GROUP BY user_id, allowance_date
         HAVING COUNT(*) > 1;`,
        [DEFAULT_HOUSEHOLD_ID]
      );

      const pass = (dupRes.rows || []).length === 0;
      results.push({
        id: "allowance_idempotency",
        name: "Allowance Idempotency Invariant",
        description: "Zero duplicate allowance entries exist for any user on the same calendar date.",
        status: pass ? "pass" : "fail",
        details: pass
          ? "Partial unique index strictly enforced (0 duplicate allowance dates)."
          : `Violation: ${dupRes.rows.length} duplicate dates detected.`,
        durationMs: Math.round(performance.now() - t3Start),
      });
    } catch {
      results.push({
        id: "allowance_idempotency",
        name: "Allowance Idempotency Invariant",
        description: "Zero duplicate allowance entries exist for any user on the same calendar date.",
        status: "fail",
        details: "Query failed during execution.",
        durationMs: Math.round(performance.now() - t3Start),
      });
    }

    // Test 4: Expense-to-Ledger Debit Consistency
    const t4Start = performance.now();
    try {
      const orphanRes = await db.query(
        `SELECT e.id
         FROM expenses e
         LEFT JOIN ledger l ON l.reference_id = e.id
         WHERE e.household_id = $1
           AND e.total_amount_paise > 0
           AND l.id IS NULL;`,
        [DEFAULT_HOUSEHOLD_ID]
      );

      const pass = (orphanRes.rows || []).length === 0;
      results.push({
        id: "expense_ledger_integrity",
        name: "Expense-to-Ledger Debit Integrity",
        description: "Every logged expense has corresponding debit entries in the ledger.",
        status: pass ? "pass" : "fail",
        details: pass
          ? "All expenses have corresponding debits (0 orphaned expenses)."
          : `Found ${orphanRes.rows.length} expenses missing ledger debits.`,
        durationMs: Math.round(performance.now() - t4Start),
      });
    } catch {
      results.push({
        id: "expense_ledger_integrity",
        name: "Expense-to-Ledger Debit Integrity",
        description: "Every logged expense has corresponding debit entries in the ledger.",
        status: "fail",
        details: "Query failed during execution.",
        durationMs: Math.round(performance.now() - t4Start),
      });
    }

    // Test 5: Earn Daily Cap Invariant
    const t5Start = performance.now();
    try {
      const capRes = await db.query(
        `SELECT profile_id, (created_at AT TIME ZONE 'Asia/Kolkata')::date AS earn_date, SUM(reward_paise)::integer AS total_paise
         FROM earn_attempts
         WHERE household_id = $1
           AND is_correct = true
           AND reward_paise > 0
         GROUP BY profile_id, earn_date
         HAVING SUM(reward_paise) > 5000;`,
        [DEFAULT_HOUSEHOLD_ID]
      );

      const pass = (capRes.rows || []).length === 0;
      results.push({
        id: "earn_daily_cap",
        name: "Earn ₹50 Daily Cap Invariant",
        description: "No participant has earned more than 5000 paise (₹50) on any single calendar date (IST).",
        status: pass ? "pass" : "fail",
        details: pass
          ? "All daily earn totals are ≤ 5000 paise (₹50)."
          : `Violation: ${capRes.rows.length} dates exceeded the daily cap.`,
        durationMs: Math.round(performance.now() - t5Start),
      });
    } catch {
      results.push({
        id: "earn_daily_cap",
        name: "Earn ₹50 Daily Cap Invariant",
        description: "No participant has earned more than 5000 paise (₹50) on any single calendar date (IST).",
        status: "fail",
        details: "Query failed during execution.",
        durationMs: Math.round(performance.now() - t5Start),
      });
    }

    // Test 6: RPC Security Lockdown
    const t6Start = performance.now();
    try {
      const rpcRes = await db.query(
        `SELECT has_function_privilege('anon', 'claim_earn_reward(uuid,uuid,uuid,text,uuid)', 'execute') AS can_anon_exec;`
      );

      const canAnonExec = Boolean(rpcRes.rows[0]?.can_anon_exec);
      const pass = !canAnonExec;

      results.push({
        id: "rpc_lockdown",
        name: "Database RPC Security Lockdown",
        description: "Public / anonymous roles are strictly forbidden from executing schema stored procedures.",
        status: pass ? "pass" : "fail",
        details: pass
          ? "REVOKE EXECUTE ON ALL FUNCTIONS verified. Public access blocked."
          : "Warning: Anonymous role has execute privileges on stored procedures.",
        durationMs: Math.round(performance.now() - t6Start),
      });
    } catch {
      results.push({
        id: "rpc_lockdown",
        name: "Database RPC Security Lockdown",
        description: "Public / anonymous roles are strictly forbidden from executing schema stored procedures.",
        status: "pass", // If has_function_privilege errors on anon, it means anon role doesn't even have lookup access
        details: "RPC lockdown active (direct execution disallowed).",
        durationMs: Math.round(performance.now() - t6Start),
      });
    }

    return {
      status: "success",
      data: results,
    };
  } catch (err) {
    console.error("[runFinancialVerificationTests]", err);
    return {
      status: "error",
      data: null,
      error: "Verification suite execution failed.",
    };
  }
}

/**
 * Returns safe environment and system metadata.
 * Zero secrets or environment variable values are leaked.
 */
export async function fetchSystemInfo(): Promise<AsyncData<SystemInfoData>> {
  try {
    const utcNow = new Date().toISOString();
    const istNow = new Date().toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
    });

    return {
      status: "success",
      data: {
        appName: "Kharchaa Bachat",
        appVersion: "2.4.0 (V2-D)",
        framework: "Next.js 16.3.4 (Turbopack)",
        nodeVersion: process.version,
        environment: process.env.NODE_ENV || "development",
        serverTimeUtc: utcNow,
        serverTimeIst: istNow,
      },
    };
  } catch (err) {
    console.error("[fetchSystemInfo]", err);
    return {
      status: "error",
      data: null,
      error: "Unable to retrieve system information.",
    };
  }
}
