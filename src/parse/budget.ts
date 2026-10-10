/** Monthly spending limits, keyed by the category name. Missing means no limit. */
export type CategoryBudgets = Record<string, number>;

/** Older settings have no budgets. Ignore malformed values loaded from disk. */
export const normaliseBudgets = (value: unknown): CategoryBudgets => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([name, amount]) =>
    name.trim() && typeof amount === "number" && Number.isFinite(amount) && amount >= 0));
};

/** Blank clears a limit; invalid input must leave the saved limit alone. */
export const parseBudget = (value: string): number | null | undefined => {
  const text = value.trim();
  if (!text) return null;
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) return undefined;
  const amount = Number(text);
  return Number.isFinite(amount) ? amount : undefined;
};
