/**
 * Curated collection of private, affectionate messages for Srujan & Disha.
 * In-memory static collection only — no database storage, no AI, no external dependencies.
 */

export const SECRET_MESSAGES: string[] = [
  "Hey cutu ❤️\n\nJust a reminder:\nYou're worth way more than ₹50/day.",
  "I'd split my last ₹50 with you.",
  "₹50/day, unlimited love.",
  "My favourite investment is you.",
  "No expense category exists for how much I love you.",
  "You are my favourite person, obviously.",
  "Current balance: high.\nAmount of love: infinite.",
  "Kharchaa is temporary, Bachat is discipline, but you are forever.",
  "Even if our balance hits ₹0, you're still my greatest asset.",
  "100% of my discretionary love is allocated to you.",
  "No shortfall coverage needed when you have my whole heart.",
  "A little kharchaa, a little bachat, a whole lot of us.",
  "Coffee expenses: ₹150.\nSnack runs: ₹200.\nBeing with you: priceless.",
  "My favourite line item on the ledger is every moment spent together.",
  "You + Me = The only math that always adds up.",
];

/**
 * Returns a message deterministically based on date and optional offset index.
 */
export function getSecretMessage(offset: number = 0): string {
  // Use today's IST date string to seed the index
  const todayStr = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata",
  });

  let hash = 0;
  for (let i = 0; i < todayStr.length; i++) {
    hash = (hash << 5) - hash + todayStr.charCodeAt(i);
    hash |= 0;
  }

  const baseIndex = Math.abs(hash) % SECRET_MESSAGES.length;
  const targetIndex = (baseIndex + offset) % SECRET_MESSAGES.length;

  return SECRET_MESSAGES[targetIndex];
}
