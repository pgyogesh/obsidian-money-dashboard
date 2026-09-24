import moment from "moment";
import { describe, expect, it } from "vitest";
import { appendRow, buildRow, inboxHeader, validateEntry, type EntryFields } from "../src/entry/row";
import { saveEntry } from "../src/entry/save";
import { parseInbox } from "../src/parse/inbox";
import { INBOX_MARK } from "../src/parse/markers";
import { fakeApp } from "./fakeApp";

const NOW = moment("2026-09-10 12:34:56");
const f = (over: Partial<EntryFields> = {}): EntryFields => ({
  when: "2026-09-10 12:30", amount: "250", direction: "debit", merchant: "Corner Shop",
  category: "Groceries", account: "Everyday Bank", method: "upi", description: "milk | bread",
  ref: "", location: "", ...over,
});

describe("validateEntry", () => {
  it("needs a date, a positive amount and a merchant", () => {
    const r = validateEntry(f({ when: "tomorrow", amount: "-3", merchant: " " }), NOW, new Set());
    expect(r.errors).toEqual(["Enter a date and time.", "Enter an amount more than 0.", "Enter a merchant."]);
  });
  it("warns about an archived month and a future date, without blocking", () => {
    expect(validateEntry(f({ when: "2026-08-02 10:00" }), NOW, new Set(["2026-08"])).warnings)
      .toEqual(["This month is archived. The row will count after you archive again."]);
    expect(validateEntry(f({ when: "2026-09-11 09:00" }), NOW, new Set()).warnings).toEqual(["This date is in the future."]);
    expect(validateEntry(f(), NOW, new Set()).errors).toEqual([]);
  });
});

describe("buildRow", () => {
  it("follows a reordered header, fills a generated Ref and cleans pipes", () => {
    const header = ["Amount", "When", "Merchant", "Direction", "Category", "Account", "Method", "Ref", "Raw", "Description", "Notes"];
    expect(buildRow(header, f(), NOW)).toBe("| 250.00 | 2026-09-10 12:30 | Corner Shop | debit | Groceries | Everyday Bank | upi | MANUAL-20260910123456 | manual entry | milk / bread |  |");
  });
  it("keeps a Ref the user typed", () => {
    expect(buildRow(["When", "Ref"], f({ ref: "UTR9" }), NOW)).toBe("| 2026-09-10 12:30 | UTR9 |");
  });
  it("uses the legacy order when there is no header", () => {
    expect(buildRow(null, f(), NOW)).toBe("| 2026-09-10 12:30 | 250.00 | debit | Corner Shop | Groceries | Everyday Bank | upi | MANUAL-20260910123456 | manual entry |");
  });
  it("is read back by the inbox parser", () => {
    const head = "| When | Amount | Direction | Merchant | Category | Account | Method | Ref | Location | Description | Raw |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |";
    const text = `${INBOX_MARK}\n${head}\n`;
    const row = buildRow(inboxHeader(text), f({ direction: "credit", location: "[P](https://maps.apple.com/?ll=1.5,2.5)" }), NOW);
    const r = parseInbox(appendRow(text, row))[0];
    expect(r).toMatchObject({ when: "2026-09-10 12:30", amount: 250, direction: "credit", merchant: "Corner Shop", category: "Groceries", account: "Everyday Bank", method: "upi", ref: "MANUAL-20260910123456", description: "milk / bread", raw: "manual entry", location: "[P](https://maps.apple.com/?ll=1.5,2.5)" });
  });
});

describe("inboxHeader", () => {
  it("reads the header under the marker, not a table above it", () => {
    expect(inboxHeader(`| Other |\n| --- |\n${INBOX_MARK}\n| When | Amount |\n| --- | --- |`)).toEqual(["When", "Amount"]);
    expect(inboxHeader(`${INBOX_MARK}\n| 2026-08-01 | 1 |`)).toBeNull();
  });
});

describe("appendRow", () => {
  it("adds a missing final line break first", () => {
    expect(appendRow("a\n| x |", "| y |")).toBe("a\n| x |\n| y |\n");
    expect(appendRow("a\n| x |\n", "| y |")).toBe("a\n| x |\n| y |\n");
  });
});

describe("saveEntry", () => {
  const head = "| When | Amount | Direction | Merchant | Category | Account | Method | Ref | Raw |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- |";
  it("appends to the file as it is on disk", async () => {
    const a = fakeApp({ "Money/Expenses.md": `${INBOX_MARK}\n${head}\n| 2026-09-01 | 1.00 | debit | Old | Other | B | upi | o1 | x |` });
    const res = await saveEntry(a.app as never, f(), NOW);
    expect(res).toEqual({ ok: true, path: "Money/Expenses.md" });
    expect(parseInbox(a.store["Money/Expenses.md"]).map((r) => r.merchant)).toEqual(["Old", "Corner Shop"]);
  });
  it("refuses without an inbox", async () => {
    const a = fakeApp({ "a.md": "x" });
    expect(await saveEntry(a.app as never, f(), NOW)).toMatchObject({ ok: false, why: expect.stringMatching(/No inbox/) });
  });
  it("refuses invalid fields and writes nothing", async () => {
    const a = fakeApp({ "Money/Expenses.md": `${INBOX_MARK}\n${head}\n` });
    const before = a.store["Money/Expenses.md"];
    expect((await saveEntry(a.app as never, f({ amount: "0" }), NOW)).ok).toBe(false);
    expect(a.store["Money/Expenses.md"]).toBe(before);
  });
});
