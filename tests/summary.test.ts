import { describe, expect, it } from "vitest";
import { fromFrontmatter, summarise } from "../src/parse/summary";
import { CATS, t } from "./helpers";

describe("summarise", () => {
  const s = summarise([
    t({ category: "Groceries", amount: 100, merchant: "A", card: "C1", type: "upi" }),
    t({ category: "Groceries", amount: -20, merchant: "A", card: "C1", type: "upi" }),
    t({ category: "Shopping", amount: 50, merchant: "B", card: "C2", type: "credit_card" }),
    t({ category: "Income", amount: -1000 }),
    t({ category: "transfer", amount: 300 }),
    t({ category: "Investments", amount: 200 }),
  ], CATS);
  it("keeps income, transfers and investments out of spend", () => {
    expect(s.net).toBe(130);
    expect(s.spend).toBe(150);
    expect(s.refunds).toBe(20);
    expect(s.count).toBe(3);
    expect(s.refundCount).toBe(1);
    expect(s.income).toBe(1000);
    expect(s.transfers).toBe(300);
    expect(s.transferCount).toBe(1);
    expect(s.invested).toBe(200);
  });
  it("nets refunds inside their category and sorts biggest first", () => {
    expect(s.byCategory).toEqual([["Groceries", 80], ["Shopping", 50]]);
    expect(s.byCard).toEqual([["C1", 80], ["C2", 50]]);
    expect(s.byMerchant[0]).toEqual(["A", { total: 80, count: 2 }]);
  });
});

describe("fromFrontmatter", () => {
  it("builds a table-less summary", () => {
    const s = fromFrontmatter({ spend: 1000, refunds: "100", by_category: { Groceries: 600, Other: 0 } });
    expect(s.net).toBe(900);
    expect(s.tableless).toBe(true);
    expect(s.byCategory).toEqual([["Groceries", 600]]);
  });
});
