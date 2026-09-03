"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { ExpenseRow } from "@/components/finance/expense-row";
import { Divider } from "@/components/ui/divider";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { fetchRecentExpenses } from "@/lib/data/finance";
import { formatPaise } from "@/lib/money";
import type { DataStatus, ExpenseRecord } from "@/types";

export default function HistoryPage() {
  const [status, setStatus] = useState<DataStatus>("loading");
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [retryTrigger, setRetryTrigger] = useState(0);

  useEffect(() => {
    let isMounted = true;

    async function loadHistory() {
      try {
        const res = await fetchRecentExpenses(100);
        if (!isMounted) return;

        if (res.status === "error") {
          setStatus("error");
        } else {
          setExpenses(res.data || []);
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

  return (
    <div className="mx-auto w-full max-w-2xl px-5 md:px-6 pt-8 md:pt-12 pb-16">
      <PageHeader title="History" subtitle="Everything you’ve spent" />

      <div className="mt-8">
        {status === "loading" && <LoadingState lines={4} />}

        {status === "error" && (
          <ErrorState
            message="We can’t reach your data right now."
            onRetry={handleRetry}
          />
        )}

        {status === "success" && expenses.length === 0 && (
          <EmptyState
            message="No expenses yet"
            detail="Your spending history will show up here"
          />
        )}

        {status === "success" && expenses.length > 0 && (
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
      </div>
    </div>
  );
}
