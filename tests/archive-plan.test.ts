import moment from "moment";
import { describe, expect, it } from "vitest";
import { buildTable, dedupeTxns, MONTH_HEADER as MONTH_HEAD, monthNotePath, planArchive } from "../src/archive/plan";
import { INBOX_MARK, TXN_END, TXN_START } from "../src/parse/markers";
import { parseMonthTxns } from "../src/parse/month";
import { summarise } from "../src/parse/summary";
import { CATS, t } from "./helpers";

const NOW = moment("2026-09-10 12:00");
const HEAD = "| When | Amount | Direction | Merchant | Category | Account | Method | Ref | Location | Description | Raw |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |";
const inbox = (rows: string[]) => ["# Inbox", INBOX_MARK, HEAD, ...rows].join("\n");
const R = {
  aug1: "| 2026-08-03 10:00 | 100.00 | debit | ZOMATO | Dining & Delivery | Card A | credit_card | r1 | | | sms |",
  aug2: "| 2026-08-04 09:00 | 20.00 | credit | Shop | Shopping | Card A | credit_card | r2 | | refund | sms |",
  jul: "| 2026-07-30 | 500.00 | debit | Landlord | Rent & Home | Bank | neft | r3 | | | sms |",
  sep: "| 2026-09-02 | 50.00 | debit | Cafe | | Card A | upi | r4 | | | sms |",
  oct: "| 2026-10-01 | 5.00 | debit | Later | Other | Card A | upi | r5 | | | sms |",
  blankAug: "| 2026-08-05 | 7.00 | debit | Person | | Bank | upi | r6 | | | sms |",
};
const base = { now: NOW, cats: CATS, monthFolder: "Money/Months", byYear: true };

describe("planArchive", () => {
  it("archives completed months, keeps the current month, lists future rows", () => {
    const p = planArchive({ ...base, inboxText: inbox([R.aug1, R.aug2, R.jul, R.sep, R.oct]), notes: new Map() });
    expect(p.blocked).toEqual([]);
    expect(p.months.map((m) => m.key)).toEqual(["2026-07", "2026-08"]);
    expect(p.currentCount).toBe(1);
    expect(p.future.map((r) => r.merchant)).toEqual(["Later"]);
    const aug = p.months[1];
    expect(aug.isNew).toBe(true);
    expect(aug.path).toBe("Money/Months/2026/2026 - 08-August.md");
    expect(aug.moved).toHaveLength(2);
    expect(aug.summary.net).toBe(80);
    expect(aug.reconciled).toBe(true);
    expect(aug.money).toMatchObject({ status: "archived", spend: 100, refunds: 20, net_spend: 80, txn_count: 2, by_category: { "Dining & Delivery": 100, Shopping: -20 } });
  });

  it("blocks on a blank category in a completed month and lists the row", () => {
    const p = planArchive({ ...base, inboxText: inbox([R.aug1, R.blankAug, R.sep]), notes: new Map() });
    expect(p.blank.map((r) => r.merchant)).toEqual(["Person"]);
    expect(p.blocked.join(" ")).toMatch(/1 row in a completed month has no category/);
  });

  it("does not block on a blank category in the current month", () => {
    const p = planArchive({ ...base, inboxText: inbox([R.aug1, R.sep]), notes: new Map() });
    expect(p.blocked).toEqual([]);
  });

  it("blocks when there is nothing to archive", () => {
    const p = planArchive({ ...base, inboxText: inbox([R.sep]), notes: new Map() });
    expect(p.months).toEqual([]);
    expect(p.blocked).toEqual(["Nothing to archive. Every row in the inbox is from the current month or later."]);
  });

  it("merges into an existing note, existing rows first, and drops duplicates", () => {
    const existing = [
      "# August", TXN_START,
      "| Date | Merchant | Description | Category | Card | Type | Amount | Ref | Location | Raw |",
      "| --- | --- | --- | --- | --- | --- | ---: | --- | --- | --- |",
      "| 2026-08-03 10:00 | Zomato | | Dining & Delivery | Card A | credit_card | 100.00 | r1 | | sms |",
      "| 2026-08-01 | Kiosk | | Other | Card A | upi | 10.00 | | | x |",
      TXN_END,
    ].join("\n");
    const notes = new Map([["2026-08", { path: "Anywhere/2026 - 08-August.md", text: existing }]]);
    const p = planArchive({ ...base, inboxText: inbox([R.aug1, R.aug2]), notes });
    const aug = p.months[0];
    expect(aug.isNew).toBe(false);
    expect(aug.path).toBe("Anywhere/2026 - 08-August.md");
    expect(aug.dropped).toBe(1);
    expect(aug.merged).toHaveLength(3);
    expect(aug.merged.map((x) => x.merchant)).toEqual(["Kiosk", "Zomato", "Shop"]);
    expect(aug.renamed).toBe(0); // the inbox ZOMATO was the duplicate, dropped
  });

  it("counts unreadable inbox lines", () => {
    const p = planArchive({ ...base, inboxText: inbox([R.aug1, "| someday | 1 | debit | X | Other | A | upi | q | | | s |"]), notes: new Map() });
    expect(p.unreadable).toBe(1);
  });
});

describe("planArchive, review fixes", () => {
  const monthNote = (body: string) => new Map([["2026-08", { path: "M/2026 - 08-August.md", text: body }]]);
  it("blocks a month note with a start marker but no end marker", () => {
    const p = planArchive({ ...base, inboxText: inbox([R.aug1]), notes: monthNote(`# Aug\n${TXN_START}\nmy text`) });
    expect(p.blocked.join(" ")).toMatch(/M\/2026 - 08-August\.md has a broken money section/);
  });
  it("blocks a month note whose end marker comes before its start marker", () => {
    const p = planArchive({ ...base, inboxText: inbox([R.aug1]), notes: monthNote(`${TXN_END}\n${TXN_START}`) });
    expect(p.blocked.join(" ")).toMatch(/broken money section/);
  });
  it("never treats a legacy Notes value as a Ref, and keeps it in Description", () => {
    const legacy = [TXN_START,
      "| Date | Description | Merchant | Category | Card | Type | Amount | Notes |",
      "| --- | --- | --- | --- | --- | --- | --- | --- |",
      "| 2026-08-01 | lunch | Cafe | Other | Card A | upi | 10 | office |",
      "| 2026-08-02 | taxi | Cab | Other | Card A | upi | 20 | office |", TXN_END].join("\n");
    const p = planArchive({ ...base, inboxText: inbox([R.aug1]), notes: monthNote(legacy) });
    const aug = p.months[0];
    expect(aug.dropped).toBe(0);
    expect(aug.merged).toHaveLength(3);
    expect(aug.table).toContain("| 2026-08-02 | Cab | office |");
    expect(aug.table).not.toMatch(/\| office \| \| lunch/);
  });
  it("matches a Ref-less duplicate whatever the merchant's case", () => {
    const note = [TXN_START, MONTH_HEAD, "| --- | --- | --- | --- | --- | --- | ---: | --- | --- | --- |",
      "| 2026-08-06 | Zomato | | Dining & Delivery | Card A | credit_card | 30.00 | | | sms |", TXN_END].join("\n");
    const row = "| 2026-08-06 | 30.00 | debit | ZOMATO  | Dining & Delivery | Card A | credit_card | | | | sms |";
    const p = planArchive({ ...base, inboxText: inbox([row]), notes: monthNote(note) });
    expect(p.months[0].dropped).toBe(1);
    expect(p.months[0].summary.net).toBe(30);
  });
});

describe("dedupeTxns", () => {
  it("uses Ref when present, else date, amount and merchant", () => {
    const r = dedupeTxns([
      t({ ref: "A", amount: 1 }), t({ ref: "A", amount: 2 }),
      t({ date: "2026-08-01", amount: 5, merchant: "M" }), t({ date: "2026-08-01", amount: 5.0, merchant: "M" }),
      t({ date: "2026-08-01", amount: 5, merchant: "M", ref: "B" }),
    ]);
    expect(r.kept).toHaveLength(3);
    expect(r.dropped).toBe(2);
  });
});

describe("buildTable", () => {
  it("round-trips through the month parser with the same totals", () => {
    const txns = [
      t({ date: "2026-08-02 10:00", merchant: "B", category: "Groceries", amount: 40.5, ref: "x1", desc: "a | b" }),
      t({ date: "2026-08-01", merchant: "A", category: "Income", amount: -1000, ref: "x2" }),
    ];
    const table = buildTable(txns);
    expect(table.split("\n")[0]).toBe("| Date | Merchant | Description | Category | Card | Type | Amount | Ref | Location | Raw |");
    const back = parseMonthTxns(`${TXN_START}\n${table}\n${TXN_END}`)!;
    expect(back.map((x) => x.merchant)).toEqual(["A", "B"]);
    expect(back[1].desc).toBe("a / b");
    expect(summarise(back, CATS)).toMatchObject({ net: 40.5, income: 1000 });
  });
});

describe("monthNotePath", () => {
  it("builds the path with and without a year folder", () => {
    expect(monthNotePath("2026-08", "Money/Months", true)).toBe("Money/Months/2026/2026 - 08-August.md");
    expect(monthNotePath("2026-08", "", false)).toBe("2026 - 08-August.md");
    expect(monthNotePath("2026-08", "Money/", false)).toBe("Money/2026 - 08-August.md");
  });
});
