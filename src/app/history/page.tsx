"use client";

import { useEffect, useState, useMemo } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { ExpenseRow } from "@/components/finance/expense-row";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { fetchHistoryLedger } from "@/lib/data/finance";
import { formatPaise } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { DataStatus, HistoryLedgerItem } from "@/types";

type FilterTab = "all" | "credit" | "debit";

function getIstDateKey(isoString: string): string {
  const d = new Date(isoString);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function formatIstTime(isoString: string): string {
  const d = new Date(isoString);
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

function getIstDayHeading(dateKey: string): string {
  const now = new Date();
  const todayKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(yesterday);

  if (dateKey === todayKey) {
    return "TODAY";
  }
  if (dateKey === yesterdayKey) {
    return "YESTERDAY";
  }

  const [y, m, d] = dateKey.split("-").map(Number);
  const dateObj = new Date(Date.UTC(y, m - 1, d));
  return dateObj
    .toLocaleDateString("en-IN", {
      timeZone: "UTC",
      month: "short",
      day: "numeric",
      year: "numeric",
    })
    .toUpperCase();
}

export default function HistoryPage() {
  const [status, setStatus] = useState<DataStatus>("loading");
  const [items, setItems] = useState<HistoryLedgerItem[]>([]);
  const [filterTab, setFilterTab] = useState<FilterTab>("all");
  const [retryTrigger, setRetryTrigger] = useState(0);

  useEffect(() => {
    let isMounted = true;

    async function loadHistory() {
      try {
        const res = await fetchHistoryLedger({ limit: 100 });
        if (!isMounted) return;

        if (res.status === "error" || !res.data) {
          setStatus("error");
        } else {
          setItems(res.data);
          setStatus("success");
        }
      } catch {
        if (isMounted) {
          setStatus("error");
        }
      }
    }

    loadHistory();

    return () => {
      isMounted = false;
    };
  }, [retryTrigger]);

  const handleRetry = () => {
    setStatus("loading");
    setRetryTrigger((prev) => prev + 1);
  };

  // Filter items based on active tab
  const filteredItems = useMemo(() => {
    if (filterTab === "all") return items;
    return items.filter((item) => item.flowType === filterTab);
  }, [items, filterTab]);

  // Aggregate totals
  const totalCreditsPaise = useMemo(() => {
    return items
      .filter((i) => i.flowType === "credit")
      .reduce((sum, i) => sum + i.amountPaise, 0);
  }, [items]);

  const totalDebitsPaise = useMemo(() => {
    return items
      .filter((i) => i.flowType === "debit")
      .reduce((sum, i) => sum + i.amountPaise, 0);
  }, [items]);

  // Group items chronologically by authoritative financial date
  const groupedItems = useMemo(() => {
    const groups: { dateKey: string; items: HistoryLedgerItem[] }[] = [];
    const map = new Map<string, HistoryLedgerItem[]>();

    for (const item of filteredItems) {
      // Authoritative financial date: allowanceDate for allowances, or IST created date
      const dateKey =
        item.allowanceDate ||
        getIstDateKey(item.effectiveDate || item.createdAt);
      if (!map.has(dateKey)) {
        const arr: HistoryLedgerItem[] = [];
        map.set(dateKey, arr);
        groups.push({ dateKey, items: arr });
      }
      map.get(dateKey)!.push(item);
    }

    return groups;
  }, [filteredItems]);

  return (
    <div className="mx-auto w-full max-w-2xl px-5 md:px-6 pt-8 md:pt-12 pb-16">
      <PageHeader
        title="History"
        subtitle="Complete credit and debit ledger"
      />

      {/* Summary totals badge bar */}
      {status === "success" && items.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-bg-secondary p-3.5">
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-tertiary">Movement</span>
            <span className="text-xs font-medium text-text-secondary">
              {items.length} records
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-positive">
              <span className="text-[0.6875rem]">IN</span>
              <span className="type-mono">+{formatPaise(totalCreditsPaise)}</span>
            </div>
            <span className="text-xs text-border">•</span>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-destructive">
              <span className="text-[0.6875rem]">OUT</span>
              <span className="type-mono">−{formatPaise(totalDebitsPaise)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Filter Tabs */}
      {status === "success" && items.length > 0 && (
        <div className="mt-4 flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setFilterTab("all")}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              filterTab === "all"
                ? "bg-text-primary text-bg-primary font-semibold"
                : "bg-bg-secondary text-text-secondary hover:text-text-primary"
            )}
          >
            All ({items.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterTab("credit")}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1",
              filterTab === "credit"
                ? "bg-positive text-bg-primary font-semibold"
                : "bg-bg-secondary text-text-secondary hover:text-positive"
            )}
          >
            <span>Credits</span>
            <span className="type-mono text-[0.6875rem]">
              ({items.filter((i) => i.flowType === "credit").length})
            </span>
          </button>
          <button
            type="button"
            onClick={() => setFilterTab("debit")}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1",
              filterTab === "debit"
                ? "bg-destructive text-bg-primary font-semibold"
                : "bg-bg-secondary text-text-secondary hover:text-destructive"
            )}
          >
            <span>Debits</span>
            <span className="type-mono text-[0.6875rem]">
              ({items.filter((i) => i.flowType === "debit").length})
            </span>
          </button>
        </div>
      )}

      <div className="mt-6">
        {status === "loading" && <LoadingState lines={5} />}

        {status === "error" && (
          <ErrorState
            message="We can’t reach your data right now."
            onRetry={handleRetry}
          />
        )}

        {status === "success" && filteredItems.length === 0 && (
          <EmptyState
            message={
              filterTab === "all"
                ? "No transactions yet"
                : filterTab === "credit"
                ? "No credits found"
                : "No debits found"
            }
            detail="Your ledger history will show up here"
          />
        )}

        {status === "success" && filteredItems.length > 0 && (
          <div className="space-y-6">
            {groupedItems.map(({ dateKey, items: dayItems }) => (
              <div key={dateKey}>
                {/* Date Group Heading */}
                <div className="sticky top-0 z-10 -mx-2 px-2 py-1.5 bg-bg-primary/95 backdrop-blur-sm border-b border-border/60">
                  <span className="text-[0.6875rem] font-bold tracking-wider text-text-tertiary">
                    {getIstDayHeading(dateKey)}
                  </span>
                </div>

                <div className="divide-y divide-border/40">
                  {dayItems.map((item) => {
                    const isCatchUp = Boolean(
                      item.allowanceDate &&
                        getIstDateKey(item.createdAt) !== item.allowanceDate
                    );
                    return (
                      <ExpenseRow
                        key={item.id}
                        flowType={item.flowType}
                        amountPaise={item.amountPaise}
                        owner={item.owner}
                        category={item.category}
                        icon={item.icon}
                        title={item.title}
                        note={item.note}
                        splitDetail={item.splitDetail}
                        timestamp={
                          isCatchUp
                            ? "Catch-up credit"
                            : formatIstTime(item.createdAt)
                        }
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
