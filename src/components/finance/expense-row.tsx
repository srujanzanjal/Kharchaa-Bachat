import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { formatPaise } from "@/lib/money";
import {
  EXPENSE_CATEGORY_ICONS,
  EXPENSE_CATEGORY_LABELS,
  type ExpenseCategory,
  type ExpenseOwner,
  type FlowType,
} from "@/types";

export interface ExpenseRowProps {
  amount?: number;
  amountPaise?: number;
  flowType?: FlowType;
  owner: ExpenseOwner | string;
  category?: ExpenseCategory | string | null;
  icon?: string | null;
  title?: string | null;
  note?: string | null;
  splitDetail?: string | null;
  timestamp: string;
  className?: string;
}

export function ExpenseRow({
  amount,
  amountPaise,
  flowType = "debit",
  owner,
  category,
  icon,
  title,
  note,
  splitDetail,
  timestamp,
  className,
}: ExpenseRowProps) {
  const isCredit = flowType === "credit";
  const normalizedOwner = (owner || "").toLowerCase();
  const displayOwner =
    normalizedOwner === "srujan"
      ? "Srujan"
      : normalizedOwner === "disha"
      ? "Disha"
      : "Both";

  const resolvedIcon =
    icon ||
    (isCredit
      ? "💰"
      : category
      ? EXPENSE_CATEGORY_ICONS[category as ExpenseCategory] || "📝"
      : null);

  const resolvedTitle =
    title ||
    (isCredit
      ? "Credit"
      : category
      ? EXPENSE_CATEGORY_LABELS[category as ExpenseCategory] || category
      : "Expense");

  const rawAmountPaise =
    amountPaise !== undefined
      ? amountPaise
      : Math.round((amount ?? 0) * 100);

  const formattedAmount = isCredit
    ? `+${formatPaise(rawAmountPaise)}`
    : `−${formatPaise(rawAmountPaise)}`;

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 py-3",
        className
      )}
    >
      <div className="flex flex-col gap-0.5 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <Badge variant="neutral">{displayOwner}</Badge>
          <span className="type-body-sm text-text-secondary truncate flex items-center gap-1.5">
            {resolvedIcon && (
              <span className="text-sm shrink-0" aria-hidden="true">
                {resolvedIcon}
              </span>
            )}
            <span className="font-medium text-text-primary">
              {resolvedTitle}
            </span>
            {note && (
              <span className="text-text-tertiary truncate"> · {note}</span>
            )}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[0.6875rem] leading-tight text-text-tertiary">
            {timestamp}
          </span>
          {splitDetail && (
            <>
              <span className="text-[0.6875rem] text-text-tertiary">•</span>
              <span className="text-[0.6875rem] text-text-tertiary truncate">
                {splitDetail}
              </span>
            </>
          )}
        </div>
      </div>
      <span
        className={cn(
          "type-mono whitespace-nowrap font-medium text-sm md:text-base shrink-0",
          isCredit ? "text-positive" : "text-destructive"
        )}
      >
        {formattedAmount}
      </span>
    </div>
  );
}
