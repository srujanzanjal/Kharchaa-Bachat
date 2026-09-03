import { cn, formatCurrency } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { formatPaise } from "@/lib/money";
import { EXPENSE_CATEGORY_LABELS, type ExpenseCategory, type ExpenseOwner } from "@/types";

interface ExpenseRowProps {
  amount?: number;
  amountPaise?: number;
  owner: ExpenseOwner | string;
  category?: ExpenseCategory | string | null;
  note?: string | null;
  splitDetail?: string | null;
  timestamp: string;
  className?: string;
}

export function ExpenseRow({
  amount,
  amountPaise,
  owner,
  category,
  note,
  splitDetail,
  timestamp,
  className,
}: ExpenseRowProps) {
  const normalizedOwner = owner.toLowerCase();
  const displayOwner =
    normalizedOwner === "srujan"
      ? "Srujan"
      : normalizedOwner === "disha"
      ? "Disha"
      : "Both";

  const categoryLabel = category
    ? (EXPENSE_CATEGORY_LABELS[category as ExpenseCategory] || category)
    : null;

  const formattedAmount =
    amountPaise !== undefined
      ? formatPaise(amountPaise)
      : `−${formatCurrency(amount ?? 0)}`;

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
          {(categoryLabel || note) && (
            <span className="type-body-sm text-text-secondary truncate">
              {categoryLabel ? (
                <>
                  <span>{categoryLabel}</span>
                  {note && <span className="text-text-tertiary"> · {note}</span>}
                </>
              ) : (
                note
              )}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[0.6875rem] leading-tight text-text-tertiary">
            {timestamp}
          </span>
          {splitDetail && (
            <>
              <span className="text-[0.6875rem] text-text-tertiary">•</span>
              <span className="text-[0.6875rem] text-text-tertiary">
                {splitDetail}
              </span>
            </>
          )}
        </div>
      </div>
      <span className="type-mono text-text-primary whitespace-nowrap font-medium">
        {formattedAmount}
      </span>
    </div>
  );
}
