"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { BalanceDisplay } from "@/components/finance/balance-display";
import { ExpenseRow } from "@/components/finance/expense-row";
import { Divider } from "@/components/ui/divider";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import {
  fetchHouseholdSummary,
  fetchRecentExpenses,
  runAllowanceCatchUp,
} from "@/lib/data/finance";
import { fetchEarnStatus } from "@/lib/data/earn";
import { formatPaise, paiseToRupees } from "@/lib/money";
import type { DataStatus, EarnStatus, ExpenseRecord, HouseholdSummary } from "@/types";

export default function DashboardPage() {
  const [status, setStatus] = useState<DataStatus>("loading");
  const [summary, setSummary] = useState<HouseholdSummary | null>(null);
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [earnStatus, setEarnStatus] = useState<EarnStatus | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retryTrigger, setRetryTrigger] = useState(0);
  const [isRefreshing, startRefreshTransition] = useTransition();

  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      try {
        // 1. Run allowance catch-up first so today's allowance is guaranteed
        try {
          await runAllowanceCatchUp();
        } catch {
          // Non-blocking fallback; fetchHouseholdSummary also enforces server-side catch-up
        }

        // 2. Fetch authoritative household summary (balances include today's allowance)
        const summaryRes = await fetchHouseholdSummary();

        if (!isMounted) return;

        if (summaryRes.status === "error" || !summaryRes.data) {
          setStatus("error");
          setErrorMessage(summaryRes.error || "We can\u2019t reach your data right now.");
          return;
        }

        const currentSummary = summaryRes.data;
        setSummary(currentSummary);

        // 3. Fetch recent expenses
        const expensesRes = await fetchRecentExpenses(10);
        if (!isMounted) return;

        if (expensesRes.status === "success" && expensesRes.data) {
          setExpenses(expensesRes.data);
        } else {
          setExpenses([]);
        }

        // 4. Non-blocking earn status fetch (for dashboard card)
        try {
          const earnRes = await fetchEarnStatus("srujan");
          if (earnRes.status === "success" && earnRes.data && isMounted) {
            setEarnStatus(earnRes.data);
          }
        } catch {
          // Earn status is non-critical
        }

        setStatus("success");
      } catch {
        if (isMounted) {
          setStatus("error");
          setErrorMessage("We can\u2019t reach your data right now.");
        }
      }
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, [retryTrigger]);

  const handleManualRefresh = () => {
    startRefreshTransition(async () => {
      try {
        const sumRes = await fetchHouseholdSummary();
        if (sumRes.status === "success" && sumRes.data) {
          setSummary(sumRes.data);
          const expRes = await fetchRecentExpenses(10);
          if (expRes.status === "success" && expRes.data) {
            setExpenses(expRes.data);
          }
        }
      } catch {
        // Non-blocking manual refresh failure
      }
    });
  };

  const handleRetry = () => {
    setStatus("loading");
    setErrorMessage(null);
    setRetryTrigger((prev) => prev + 1);
  };

  // Error state — database unavailable or network failure
  if (status === "error") {
    return (
      <div className="mx-auto w-full max-w-2xl px-5 md:px-6 pt-10">
        <ErrorState
          message={errorMessage || "We can\u2019t reach your data right now."}
          onRetry={handleRetry}
        />
      </div>
    );
  }

  // Loading state
  if (status === "loading" && !summary) {
    return (
      <div className="mx-auto w-full max-w-2xl px-5 md:px-6 pt-10">
        <div className="pb-8 pt-4">
          <BalanceDisplay amountPaise={null} label="Available between you" size="hero" />
        </div>
        <div className="flex gap-10 md:gap-16 pb-10">
          <BalanceDisplay amountPaise={null} label="Srujan" />
          <BalanceDisplay amountPaise={null} label="Disha" />
        </div>
        <LoadingState lines={3} />
      </div>
    );
  }

  const dailyRateRupees = summary ? paiseToRupees(summary.daily_rate_paise) : 50;

  return (
    <div className="mx-auto w-full max-w-2xl px-5 md:px-6">
      {/* ── Combined balance (hero) ────────────────── */}
      <section className="pb-8 pt-10 md:pt-14" aria-label="Combined balance">
        <div className="flex items-start justify-between">
          <BalanceDisplay
            amountPaise={summary?.combined_paise ?? null}
            label="Available between you"
            size="hero"
          />
          <div className="text-right pt-2">
            <span className="type-caption text-text-tertiary block">
              Daily allowance
            </span>
            <span className="text-[0.8125rem] font-medium text-text-secondary">
              ₹{dailyRateRupees} / person
            </span>
          </div>
        </div>
      </section>

      {/* ── Individual balances ────────────────────── */}
      <section
        className="flex gap-10 md:gap-16 pb-10"
        aria-label="Individual balances"
      >
        <BalanceDisplay
          amountPaise={summary?.srujan.balance_paise ?? null}
          label="Srujan"
        />
        <BalanceDisplay
          amountPaise={summary?.disha.balance_paise ?? null}
          label="Disha"
        />
      </section>

      {/* ── Primary action ────────────────────────── */}
      <div className="md:max-w-xs">
        <Link
          href="/add"
          className="flex w-full items-center justify-center rounded-lg bg-accent py-3.5 text-[0.9375rem] font-semibold text-white transition-colors duration-150 hover:bg-accent/90 active:bg-accent/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent min-h-[48px] touch-manipulation"
        >
          Add expense
        </Link>
      </div>

      {/* ── Earn lil Kharchaa card ──────────────── */}
      <section className="mt-8" aria-label="Earn lil Kharchaa">
        <Link
          href="/earn"
          className="block rounded-lg border border-border bg-bg-secondary/60 p-4 transition-all duration-150 hover:border-border-active hover:bg-bg-secondary/90 group"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="type-body font-semibold text-text-primary">
                💰 Earn lil Kharchaa
              </p>
              <p className="text-[0.75rem] text-text-tertiary mt-0.5">
                Solve something. Earn a little.
              </p>
            </div>
            <span className="text-[0.8125rem] text-text-tertiary group-hover:text-text-secondary transition-colors shrink-0 pt-0.5">
              →
            </span>
          </div>
          {earnStatus && (
            <div className="mt-3 space-y-1.5">
              <div className="flex items-baseline justify-between">
                <span className="text-[0.6875rem] text-text-tertiary uppercase tracking-wider">Today&apos;s earning</span>
                <span className="type-mono text-[0.8125rem] text-text-secondary font-medium">
                  {formatPaise(earnStatus.today_earned_paise)} / {formatPaise(earnStatus.daily_limit_paise)}
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-bg-tertiary overflow-hidden">
                <div
                  className="h-full rounded-full bg-positive transition-all duration-500"
                  style={{ width: `${Math.min(100, (earnStatus.today_earned_paise / earnStatus.daily_limit_paise) * 100)}%` }}
                />
              </div>
            </div>
          )}
        </Link>
      </section>

      {/* ── Recent activity ───────────────────────── */}
      <section className="mt-8 pb-16" aria-label="Recent expenses">
        <div className="flex items-center justify-between mb-2">
          <span className="type-caption text-text-tertiary uppercase tracking-wider">
            Recent activity
          </span>
          <button
            type="button"
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            className="text-[0.75rem] text-text-tertiary hover:text-text-secondary transition-colors focus-visible:outline-none"
            title="Refresh latest data"
          >
            {isRefreshing ? "Updating…" : "Refresh"}
          </button>
        </div>
        <Divider className="mb-2" />

        {expenses.length === 0 ? (
          <EmptyState
            message="No expenses yet"
            detail="When you log food or coffee expenses, they’ll show up here"
          />
        ) : (
          <div>
            {expenses.map((expense, idx) => {
              let splitDetail: string | null = null;
              if (expense.owner.toLowerCase() === "both") {
                splitDetail = `Srujan ${formatPaise(expense.srujan_amount_paise)} · Disha ${formatPaise(expense.disha_amount_paise)}`;
                if (expense.coverage_approved) {
                  splitDetail += " (coverage applied)";
                }
              }

              return (
                <div key={expense.id}>
                  <ExpenseRow
                    amountPaise={expense.total_amount_paise}
                    owner={expense.owner}
                    category={expense.category}
                    note={expense.note}
                    splitDetail={splitDetail}
                    timestamp={new Date(expense.created_at).toLocaleDateString("en-IN", {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  />
                  {idx < expenses.length - 1 && <Divider />}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
