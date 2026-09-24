import moment from "moment";
import { describe, expect, it } from "vitest";
import { ACCT_END, ACCT_START, INBOX_MARK, TXN_END, TXN_START } from "../src/parse/markers";
import { findAccounts, findInbox, loadMonths, loadPool } from "../src/vault/load";
import { fakeVault } from "./fakeVault";
import { CATS } from "./helpers";

const HEAD = "| When | Amount | Direction | Merchant | Category | Account | Method | Ref | Raw |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- |";
const inbox = [
  "# Inbox", INBOX_MARK, HEAD,
  "| 2026-08-03 10:00 | 100.00 | debit | ZOMATO | Dining & Delivery | Card A | credit_card | r1 | sms |",
  "| 2026-08-04 | 50.00 | debit | Shop | | Card A | credit_card | r2 | sms |",
  "| 2026-07-30 | 999.00 | debit | Leftover | Other | Card A | upi | r3 | sms |",
].join("\n");
const month = (rows: string[]) => [
  "---", "money:", "  spend: 1", "---", TXN_START,
  "| Date | Merchant | Category | Card | Type | Amount | Notes |",
  "| --- | --- | --- | --- | --- | --- | --- |",
  ...rows, TXN_END,
].join("\n");
const files = {
  "deep/folder/Money inbox expenses.md": inbox,
  "notes/Spec.md": `The marker is ${INBOX_MARK} and ${ACCT_START} in prose.`,
  "z/2026 - 07-July.md": month(["| 2026-07-10 | Zomato | Dining & Delivery | Card A | credit_card | 200 | |"]),
  "z/2026 - 08-August.md": month(["| 2026-08-10 | Old | Other | Card A | upi | 70 | |"]),
  "z/2026 - 06-June.md": "an ordinary monthly note",
  "cfg/Card setup.md": `${ACCT_START}\n| Account | Statement day | Due day | Credit limit | Notes |\n| --- | --- | --- | --- | --- |\n| Card A | 18 | 7 | | |\n${ACCT_END}`,
};
const fm = {
  "z/2026 - 07-July.md": { money: { spend: 200 } },
  "z/2026 - 08-August.md": { money: { spend: 999 } },
};

describe("findInbox", () => {
  it("finds the inbox by its table, not by the quoted marker", async () => {
    const r = await findInbox(fakeVault(files));
    expect(r?.file.path).toBe("deep/folder/Money inbox expenses.md");
  });
  it("falls back to a full scan when no name matches", async () => {
    const r = await findInbox(fakeVault({ "a/Ledger.md": inbox, "b/x.md": "x" }));
    expect(r?.file.path).toBe("a/Ledger.md");
  });
  it("returns null when there is no inbox", async () => {
    expect(await findInbox(fakeVault({ "a.md": "x" }))).toBeNull();
  });
});

describe("findAccounts", () => {
  it("skips notes that only quote the marker", async () => {
    const r = await findAccounts(fakeVault(files));
    expect(r?.file.path).toBe("cfg/Card setup.md");
    expect(r?.accounts[0].statementDay).toBe(18);
  });
});

describe("loadMonths", () => {
  it("lets the inbox win the current month and never sums the two", async () => {
    const res = await loadMonths(fakeVault(files, fm), CATS, moment("2026-08-20"));
    expect(res.months.map((m) => m.key)).toEqual(["2026-07", "2026-08"]);
    const aug = res.months[1];
    expect(aug.fromInbox).toBe(true);
    expect(aug.status).toBe("live");
    expect(aug.net).toBe(150);
    expect(res.overlaps).toEqual([
      { key: "2026-07", label: "July 2026", winner: "archive" },
      { key: "2026-08", label: "August 2026", winner: "inbox" },
    ]);
    // July leftover row in the inbox is ignored: the archive wins a past month.
    expect(res.months[0].net).toBe(200);
    expect(res.months[0].fromInbox).toBeFalsy();
  });
  it("lets the archive win once the month has ended", async () => {
    const res = await loadMonths(fakeVault(files, fm), CATS, moment("2026-09-02"));
    const aug = res.months.find((m) => m.key === "2026-08")!;
    expect(aug.fromInbox).toBeFalsy();
    expect(aug.net).toBe(70);
  });
  it("flags a stale rollup", async () => {
    const res = await loadMonths(fakeVault(files, fm), CATS, moment("2026-09-02"));
    expect(res.months.find((m) => m.key === "2026-08")!.drift).toEqual({ stored: 999, computed: 70 });
    expect(res.months.find((m) => m.key === "2026-07")!.drift).toBeNull();
  });
  it("unifies merchant spellings across the inbox and the archive", async () => {
    const res = await loadMonths(fakeVault(files, fm), CATS, moment("2026-08-20"));
    expect(res.months[1].txns[0].merchant).toBe("Zomato");
  });
  it("leaves the inbox row with the file's own spelling, for editing", async () => {
    const res = await loadMonths(fakeVault(files, fm), CATS, moment("2026-08-20"));
    expect(res.months[1].rows![0].merchant).toBe("ZOMATO");
    expect(res.months[1].txns[0].src!.merchant).toBe("ZOMATO");
  });
  it("marks an ended month still in the inbox as unarchived", async () => {
    const res = await loadMonths(fakeVault({ "Expenses.md": inbox }), CATS, moment("2026-09-02"));
    expect(res.months.map((m) => [m.key, m.status])).toEqual([["2026-07", "unarchived"], ["2026-08", "unarchived"]]);
  });
});

describe("loadPool", () => {
  it("applies the same precedence and parses each date once", async () => {
    const pool = await loadPool(fakeVault(files, fm), moment("2026-08-20"));
    expect(pool.map((t) => t.amount).sort((a, b) => a - b)).toEqual([50, 100, 200]);
    expect(pool.every((t) => t.moment.isValid())).toBe(true);
  });
});
