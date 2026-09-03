import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { CURRENCY } from "./constants";

/** Merge Tailwind classes without conflicts */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format a number as Indian currency (₹1,234) */
export function formatCurrency(amount: number): string {
  return `${CURRENCY.symbol}${amount.toLocaleString(CURRENCY.locale)}`;
}

/**
 * Split a currency string into symbol and value for independent styling.
 * e.g. formatCurrencyParts(1500) → { symbol: "₹", value: "1,500" }
 */
export function formatCurrencyParts(amount: number) {
  return {
    symbol: CURRENCY.symbol,
    value: amount.toLocaleString(CURRENCY.locale),
  };
}
