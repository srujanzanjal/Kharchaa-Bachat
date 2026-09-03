"use client";

import { useEffect, useState, useTransition } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { fetchMonthlyRecap } from "@/lib/data/recap";
import { formatPaise } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { DataStatus, MonthlyRecapData } from "@/types";

export default function MonthlyRecapPage() {
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth() + 1; // 1-12

  const [year, setYear] = useState<number>(currentYear);
  const [month, setMonth] = useState<number>(currentMonth);
  const [status, setStatus] = useState<DataStatus>("loading");
  const [recap, setRecap] = useState<MonthlyRecapData | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isNavigating, startTransition] = useTransition();

  // Load recap for selected year and month
  useEffect(() => {
    let isMounted = true;

    async function loadRecap() {
      setStatus("loading");
      setErrorMessage(null);

      try {
        const res = await fetchMonthlyRecap(year, month);
        if (!isMounted) return;

        if (res.status === "error" || !res.data) {
          setStatus("error");
          setErrorMessage(res.error || "We can’t reach your data right now.");
        } else {
          setRecap(res.data);
          setStatus("success");
        }
      } catch {
        if (isMounted) {
          setStatus("error");
          setErrorMessage("We can’t reach your data right now.");
        }
      }
    }

    loadRecap();

    return () => {
      isMounted = false;
    };
  }, [year, month]);

  // Handle month navigation
  const handlePrevMonth = () => {
    startTransition(() => {
      if (month === 1) {
        setYear((prev) => prev - 1);
        setMonth(12);
      } else {
        setMonth((prev) => prev - 1);
      }
    });
  };

  const handleNextMonth = () => {
    // Prevent navigating into future months
    if (isCurrentMonthOrFuture) return;

    startTransition(() => {
      if (month === 12) {
        setYear((prev) => prev + 1);
        setMonth(1);
      } else {
        setMonth((prev) => prev + 1);
      }
    });
  };

  const isCurrentMonthOrFuture =
    year > currentYear || (year === currentYear && month >= currentMonth);

  return (
    <div className="mx-auto w-full max-w-2xl px-5 md:px-6 pt-8 md:pt-12 pb-24">
      <PageHeader
        title="Monthly Recap"
        subtitle="Where did the money go this month?"
      />

      {/* ── Month Selector ─────────────────────────────────── */}
      <section className="mt-8 flex items-center justify-between border-y border-border py-3.5">
        <button
          type="button"
          onClick={handlePrevMonth}
          disabled={isNavigating}
          className="flex items-center gap-1.5 text-[0.8125rem] font-medium text-text-secondary hover:text-text-primary transition-colors focus-visible:outline-none touch-manipulation min-h-[40px] px-2.5 rounded-md hover:bg-bg-secondary"
          aria-label="Previous month"
        >
          <span aria-hidden="true">←</span>
          <span>Previous</span>
        </button>

        <div className="text-center">
          <p className="type-body font-semibold text-text-primary">
            {recap?.month_name || "..."} {year}
          </p>
          <span className="text-[0.6875rem] uppercase tracking-wider text-text-tertiary">
            {year === currentYear && month === currentMonth
              ? "Current month"
              : "Historical recap"}
          </span>
        </div>

        <button
          type="button"
          onClick={handleNextMonth}
          disabled={isCurrentMonthOrFuture || isNavigating}
          className={cn(
            "flex items-center gap-1.5 text-[0.8125rem] font-medium transition-colors focus-visible:outline-none touch-manipulation min-h-[40px] px-2.5 rounded-md",
            isCurrentMonthOrFuture
              ? "opacity-30 cursor-not-allowed text-text-tertiary"
              : "text-text-secondary hover:text-text-primary hover:bg-bg-secondary"
          )}
          aria-label="Next month"
        >
          <span>Next</span>
          <span aria-hidden="true">→</span>
        </button>
      </section>

      {/* ── Loading State ───────────────────────────────────── */}
      {status === "loading" && (
        <div className="pt-10">
          <LoadingState lines={5} />
        </div>
      )}

      {/* ── Error State ─────────────────────────────────────── */}
      {status === "error" && (
        <div className="pt-10">
          <ErrorState
            message={errorMessage || "We can’t reach your data right now."}
            onRetry={() => {
              setStatus("loading");
              fetchMonthlyRecap(year, month).then((res) => {
                if (res.status === "success" && res.data) {
                  setRecap(res.data);
                  setStatus("success");
                } else {
                  setStatus("error");
                }
              });
            }}
          />
        </div>
      )}

      {/* ── Loaded State ────────────────────────────────────── */}
      {status === "success" && recap && (
        <div className="mt-8 space-y-12">
          {/* ── Total Spent & Personality Headline ────────────── */}
          <section className="space-y-4">
            <div>
              <span className="type-caption text-text-tertiary block">
                Total spent in {recap.month_name}
              </span>
              <p className="type-display text-text-primary mt-1">
                {formatPaise(recap.total_spent_paise)}
              </p>
            </div>

            <div className="rounded-lg border border-border bg-bg-secondary/70 p-4 space-y-1">
              <p className="type-title-sm text-text-primary font-medium">
                {recap.headline}
              </p>
              <p className="type-body-sm text-text-secondary">
                {recap.subheadline}
              </p>
            </div>

            {/* Quick Metrics Grid */}
            {recap.expense_count > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                <div className="rounded-md border border-border/60 bg-bg-secondary/40 p-3">
                  <span className="type-caption text-text-tertiary block">
                    Expenses
                  </span>
                  <p className="type-mono text-text-primary text-[1.0625rem] mt-0.5 font-semibold">
                    {recap.expense_count}
                  </p>
                </div>
                <div className="rounded-md border border-border/60 bg-bg-secondary/40 p-3">
                  <span className="type-caption text-text-tertiary block">
                    Average
                  </span>
                  <p className="type-mono text-text-primary text-[1.0625rem] mt-0.5 font-semibold">
                    {formatPaise(recap.average_expense_paise)}
                  </p>
                </div>
                <div className="rounded-md border border-border/60 bg-bg-secondary/40 p-3">
                  <span className="type-caption text-text-tertiary block">
                    Srujan paid
                  </span>
                  <p className="type-mono text-text-primary text-[1.0625rem] mt-0.5 font-semibold">
                    {formatPaise(recap.srujan_total_paise)}
                  </p>
                </div>
                <div className="rounded-md border border-border/60 bg-bg-secondary/40 p-3">
                  <span className="type-caption text-text-tertiary block">
                    Disha paid
                  </span>
                  <p className="type-mono text-text-primary text-[1.0625rem] mt-0.5 font-semibold">
                    {formatPaise(recap.disha_total_paise)}
                  </p>
                </div>
              </div>
            )}
          </section>

          {/* ── Empty Month Handling ──────────────────────────── */}
          {recap.expense_count === 0 ? (
            <div className="rounded-xl border border-border/60 bg-bg-secondary/30 p-8 text-center space-y-2">
              <p className="type-title-sm text-text-primary">Nothing spent yet</p>
              <p className="type-body-sm text-text-tertiary max-w-sm mx-auto">
                No food or coffee expenses were logged for {recap.month_name}{" "}
                {recap.year}. Once you add expenses, your monthly breakdown and
                awards will show up here.
              </p>
            </div>
          ) : (
            <>
              {/* ── WHERE DID THE MONEY GO? ───────────────────── */}
              <section aria-labelledby="category-breakdown-heading">
                <div className="flex items-center justify-between mb-4">
                  <h2
                    id="category-breakdown-heading"
                    className="type-caption text-text-tertiary uppercase tracking-wider font-semibold"
                  >
                    Where did the money go?
                  </h2>
                  <span className="text-[0.75rem] text-text-tertiary">
                    {recap.categories.length} active categor
                    {recap.categories.length === 1 ? "y" : "ies"}
                  </span>
                </div>

                <div className="space-y-4">
                  {recap.categories.map((cat, idx) => {
                    const isTop = idx === 0;

                    return (
                      <div
                        key={cat.category}
                        className="rounded-lg border border-border/70 bg-bg-secondary/50 p-3.5 space-y-2.5 transition-colors"
                      >
                        <div className="flex items-baseline justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                "type-body font-medium",
                                isTop ? "text-text-primary" : "text-text-secondary"
                              )}
                            >
                              {cat.label}
                            </span>
                            <span className="text-[0.6875rem] text-text-tertiary">
                              {cat.percentage}% · {cat.expense_count} expense
                              {cat.expense_count === 1 ? "" : "s"}
                            </span>
                          </div>
                          <span className="type-mono font-medium text-text-primary">
                            {formatPaise(cat.total_paise)}
                          </span>
                        </div>

                        {/* Horizontal Bar Indicator */}
                        <div className="h-1.5 w-full rounded-full bg-bg-tertiary overflow-hidden">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all duration-500",
                              isTop ? "bg-accent" : "bg-text-secondary/50"
                            )}
                            style={{
                              width: `${Math.max(4, Math.min(100, cat.percentage))}%`,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* ── Largest Single Expense ─────────────────────── */}
              {recap.largest_expense && (
                <section aria-label="Largest single expense">
                  <span className="type-caption text-text-tertiary uppercase tracking-wider block mb-2 font-semibold">
                    Largest Single Expense
                  </span>
                  <div className="rounded-lg border border-border bg-bg-secondary p-4 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="type-body font-semibold text-text-primary truncate">
                        {recap.largest_expense.note || "Expense"}
                      </p>
                      <p className="text-[0.75rem] text-text-tertiary mt-0.5">
                        {recap.largest_expense.owner === "both"
                          ? "Shared 50/50"
                          : `Paid by ${
                              recap.largest_expense.owner === "srujan"
                                ? "Srujan"
                                : "Disha"
                            }`}
                        {" · "}
                        {new Date(recap.largest_expense.created_at).toLocaleDateString(
                          "en-IN",
                          { month: "short", day: "numeric" }
                        )}
                      </p>
                    </div>
                    <span className="type-mono text-[1.125rem] font-semibold text-text-primary whitespace-nowrap">
                      {formatPaise(recap.largest_expense.total_amount_paise)}
                    </span>
                  </div>
                </section>
              )}

              {/* ── MONTHLY AWARDS ────────────────────────────── */}
              {recap.awards.length > 0 && (
                <section aria-labelledby="monthly-awards-heading">
                  <div className="mb-4">
                    <h2
                      id="monthly-awards-heading"
                      className="type-caption text-text-tertiary uppercase tracking-wider font-semibold"
                    >
                      Monthly Awards
                    </h2>
                    <p className="type-body-sm text-text-secondary mt-0.5">
                      Deterministic distinctions earned from your spending this
                      month
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    {recap.awards.map((award) => (
                      <div
                        key={award.id}
                        className="rounded-lg border border-border bg-bg-secondary p-4 space-y-2 relative overflow-hidden"
                      >
                        <div className="flex items-center gap-2.5">
                          <span
                            className="text-xl leading-none select-none"
                            aria-hidden="true"
                          >
                            {award.icon}
                          </span>
                          <div>
                            <p className="text-[0.875rem] font-semibold text-text-primary leading-tight">
                              {award.title}
                            </p>
                            <p className="text-[0.75rem] text-accent font-medium leading-tight mt-0.5">
                              {award.recipient}
                            </p>
                          </div>
                        </div>
                        <p className="text-[0.8125rem] text-text-secondary leading-relaxed pt-1 border-t border-border/40">
                          {award.detail}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
