import { str } from "./str";

// Parse an amount tolerantly. The format says plain signed numbers, but a
// hand-edited or half-cleaned cell may still carry a currency symbol, commas,
// (1,234) or a trailing CR/DR from a statement. Bank convention: CR is money
// in, so it flips the sign. Anything unreadable becomes 0 rather than NaN
// poisoning a whole total.
export const num = (v: unknown): number => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  let s = str(v).trim();
  if (!s) return 0;
  const flip = /^\(.*\)$/.test(s) || /\bcr$/i.test(s);
  s = s.replace(/\b(cr|dr)$/i, "").replace(/[(),\s₹$€£¥]/g, "");
  const n = parseFloat(s);
  if (!Number.isFinite(n)) return 0;
  return flip ? -Math.abs(n) : n;
};
