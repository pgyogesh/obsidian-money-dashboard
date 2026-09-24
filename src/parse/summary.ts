import { num } from "./amount";
import type { Categories, Ranked, Summary, Txn } from "./types";

export const categoryKind = (category: string, c: Categories) => {
  const k = String(category).trim().toLowerCase();
  if (k === c.income.toLowerCase()) return "income";
  if (k === c.transfer.toLowerCase()) return "transfer";
  if (k === c.investments.toLowerCase()) return "investments";
  return "spend";
};

/**
 * Roll a transaction list up into every number a page shows. Refunds stay
 * inside their own category, so the category bars always sum to net spend.
 * Income, transfers between own accounts, and investments are not spend.
 */
export const summarise = (txns: Txn[], c: Categories): Summary => {
  const kind = (t: Txn) => categoryKind(t.category, c);
  const spendT = txns.filter((t) => kind(t) === "spend");
  const roll = (key: "category" | "card" | "type"): Ranked => {
    const m = new Map<string, number>();
    for (const t of spendT) m.set(t[key], (m.get(t[key]) ?? 0) + t.amount);
    return [...m.entries()].filter(([, v]) => v !== 0).sort((x, y) => y[1] - x[1]);
  };
  const merch = new Map<string, { total: number; count: number }>();
  for (const t of spendT) {
    const e = merch.get(t.merchant) ?? { total: 0, count: 0 };
    e.total += t.amount; e.count += 1;
    merch.set(t.merchant, e);
  }
  const of = (k: string) => txns.filter((t) => kind(t) === k);
  return {
    txns, spendT,
    income: of("income").reduce((a, t) => a - t.amount, 0),
    invested: of("investments").reduce((a, t) => a + Math.abs(t.amount), 0),
    spend: spendT.filter((t) => t.amount > 0).reduce((a, t) => a + t.amount, 0),
    refunds: spendT.filter((t) => t.amount < 0).reduce((a, t) => a - t.amount, 0),
    net: spendT.reduce((a, t) => a + t.amount, 0),
    count: spendT.length,
    refundCount: spendT.filter((t) => t.amount < 0).length,
    transfers: of("transfer").reduce((a, t) => a + Math.abs(t.amount), 0),
    transferCount: of("transfer").length,
    byCategory: roll("category"),
    byCard: roll("card"),
    byType: roll("type"),
    byMerchant: [...merch.entries()].filter(([, v]) => v.total > 0)
      .sort((x, y) => y[1].total - x[1].total),
  };
};

/** A month may carry rollups in frontmatter without a table. */
export const fromFrontmatter = (money: Record<string, unknown>): Summary => {
  const obj = (o: unknown): Ranked => (o && typeof o === "object"
    ? Object.entries(o as Record<string, unknown>).map(([k, v]): [string, number] => [k, num(v)])
      .filter(([, v]) => v !== 0).sort((x, y) => y[1] - x[1])
    : []);
  return {
    txns: [], spendT: [],
    income: num(money.income),
    invested: num(money.invested),
    spend: num(money.spend),
    refunds: num(money.refunds),
    net: money.net_spend != null ? num(money.net_spend) : num(money.spend) - num(money.refunds),
    count: num(money.txn_count),
    refundCount: 0,
    transfers: 0,
    transferCount: 0,
    byCategory: obj(money.by_category),
    byCard: obj(money.by_card),
    byType: obj(money.by_type),
    byMerchant: [],
    tableless: true,
  };
};
