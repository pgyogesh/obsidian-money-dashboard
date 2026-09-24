import { describe, expect, it } from "vitest";
import { hasInboxTable, inboxToTxn, parseInbox } from "../src/parse/inbox";
import { INBOX_MARK } from "../src/parse/markers";

const inbox = [
  "# Expenses", INBOX_MARK, "",
  "| When | Amount | Direction | Merchant | Category | Account | Method | Ref | Location | Raw |",
  "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  "| 2026-08-15 14:32 | 40.00 | debit | CORNER PHARMACY | Health & Medical | Card A | credit_card | 111 | [, Pune, MH](https://maps.apple.com/?ll=18.5,73.8) | Rs 40 debited |",
  "| 2026-08-16 | 500.00 | credit | ACME | Income | Bank A | neft | 222 | | salary |",
  "| not a date | 1 | debit | X | | Bank A | upi | 333 | | x |",
].join("\n");

describe("parseInbox", () => {
  const rows = parseInbox(inbox);
  it("skips rows without a usable date", () => {
    expect(rows).toHaveLength(2);
  });
  it("reads columns by header name, even with Location before Raw", () => {
    expect(rows[0].raw).toBe("Rs 40 debited");
    expect(rows[0].location).toContain("Pune");
    expect(rows[0].merchant).toBe("CORNER PHARMACY");
    expect(rows[0].key).toBe("2026-08");
  });
  it("remembers the line index in the whole file and the column indexes", () => {
    expect(rows[0].srcIndex).toBe(5);
    expect(inbox.split("\n")[rows[0].srcIndex].trim()).toBe(rows[0].srcLine);
    expect(rows[0].catCol).toBe(4);
    expect(rows[0].merCol).toBe(3);
    expect(rows[0].descCol).toBeUndefined();
  });
  it("falls back to the legacy nine columns without a header", () => {
    const legacy = `${INBOX_MARK}\n| 2026-08-15 | 10 | debit | M | Groceries | A | upi | 1 | raw |`;
    const r = parseInbox(legacy);
    expect(r[0].raw).toBe("raw");
    expect(r[0].category).toBe("Groceries");
  });
  it("returns nothing without the marker", () => {
    expect(parseInbox("| When |\n| 2026-08-15 | 1 |")).toEqual([]);
  });
});

describe("inboxToTxn", () => {
  const rows = parseInbox(inbox);
  it("uses Direction for the sign", () => {
    expect(inboxToTxn(rows[0]).amount).toBe(40);
    expect(inboxToTxn(rows[1]).amount).toBe(-500);
  });
  it("labels a blank category Uncategorised and keeps the source row", () => {
    const r = { ...rows[0], category: "" };
    const x = inboxToTxn(r);
    expect(x.category).toBe("Uncategorised");
    expect(x.src).toBe(r);
    expect(x.card).toBe("Card A");
    expect(x.type).toBe("credit_card");
    expect(x.date).toBe("2026-08-15 14:32");
  });
});

describe("hasInboxTable", () => {
  it("ignores a note that only quotes the marker", () => {
    expect(hasInboxTable(`const x = "${INBOX_MARK}";`)).toBe(false);
    expect(hasInboxTable(inbox)).toBe(true);
  });
});
