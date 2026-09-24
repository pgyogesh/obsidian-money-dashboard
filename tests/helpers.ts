import type { Txn } from "../src/parse/types";

export const CATS = { income: "Income", transfer: "Transfer", investments: "Investments" };

export const t = (over: Partial<Txn>): Txn => ({
  date: "2026-08-01", desc: "", merchant: "M", category: "Other", description: "",
  card: "Card A", type: "upi", amount: 0, note: "", location: "", ...over,
});
