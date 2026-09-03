import { cn, formatCurrencyParts } from "@/lib/utils";
import { formatPaiseParts } from "@/lib/money";

interface BalanceDisplayProps {
  /** The balance amount in ₹. Pass null when data isn't available yet. */
  amount?: number | null;
  /** The balance amount in integer paise. */
  amountPaise?: number | null;
  /** Label shown below the amount (e.g. "available" or a person's name) */
  label: string;
  /** Visual size: "hero" for the main combined balance, "standard" for individual */
  size?: "hero" | "standard";
  className?: string;
}

export function BalanceDisplay({
  amount,
  amountPaise,
  label,
  size = "standard",
  className,
}: BalanceDisplayProps) {
  let parts: { symbol: string; value: string } | null = null;

  if (amountPaise !== undefined && amountPaise !== null) {
    parts = formatPaiseParts(amountPaise);
  } else if (amount !== undefined && amount !== null) {
    parts = formatCurrencyParts(amount);
  }

  return (
    <div className={cn("flex flex-col", className)}>
      <p
        className={cn(
          size === "hero" ? "type-display" : "type-title-lg",
          "text-text-primary"
        )}
      >
        {parts ? (
          <>
            <span
              className={cn(
                "text-text-tertiary font-normal",
                size === "hero" ? "text-[0.6em]" : "text-[0.7em]"
              )}
            >
              {parts.symbol}
            </span>
            {parts.value}
          </>
        ) : (
          <span className="text-text-tertiary">—</span>
        )}
      </p>
      <span className="type-caption mt-1.5 text-text-secondary">{label}</span>
    </div>
  );
}
