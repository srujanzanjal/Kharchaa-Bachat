import { CURRENCY } from "./constants";

/**
 * All monetary amounts in Kharchaa Bachat are calculated and stored
 * strictly as integer paise to completely prevent floating-point inaccuracies.
 */

/** Converts whole or fractional rupees to integer paise (e.g. 50 -> 5000) */
export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

/** Converts integer paise to rupees for display */
export function paiseToRupees(paise: number): number {
  return Math.floor(paise / 100);
}

/**
 * Format integer paise directly as formatted Indian currency.
 * e.g. 5000 paise -> ₹50
 * e.g. 12550 paise -> ₹125.50 (if non-zero paise remainder) or ₹125
 */
export function formatPaise(paise: number): string {
  const isNegative = paise < 0;
  const absPaise = Math.abs(paise);
  const rupees = Math.floor(absPaise / 100);
  const remPaise = absPaise % 100;

  let formattedValue = rupees.toLocaleString(CURRENCY.locale);
  if (remPaise > 0) {
    formattedValue += `.${remPaise.toString().padStart(2, "0")}`;
  }

  return `${isNegative ? "−" : ""}${CURRENCY.symbol}${formattedValue}`;
}

/**
 * Formats paise into separate symbol and value parts for typography-led display.
 */
export function formatPaiseParts(paise: number) {
  const isNegative = paise < 0;
  const absPaise = Math.abs(paise);
  const rupees = Math.floor(absPaise / 100);
  const remPaise = absPaise % 100;

  let formattedValue = rupees.toLocaleString(CURRENCY.locale);
  if (remPaise > 0) {
    formattedValue += `.${remPaise.toString().padStart(2, "0")}`;
  }

  return {
    symbol: `${isNegative ? "−" : ""}${CURRENCY.symbol}`,
    value: formattedValue,
  };
}
