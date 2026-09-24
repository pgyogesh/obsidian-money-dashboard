import moment from "moment";
import { describe, expect, it } from "vitest";
import { cycleFor, dueFor, inCycle, parseAccounts } from "../src/parse/accounts";
import { ACCT_END, ACCT_START } from "../src/parse/markers";

const a = { name: "Card", statementDay: 18, dueDay: 7, limit: null, note: "" };
const ymd = (m: moment.Moment) => m.format("YYYY-MM-DD");

describe("cycleFor", () => {
  it("runs from the day after the last statement to the next statement day", () => {
    const c = cycleFor(a, 0, moment("2026-08-20"));
    expect(ymd(c.start)).toBe("2026-08-19");
    expect(ymd(c.end)).toBe("2026-09-18");
    expect(c.calendar).toBe(false);
    expect(c.label).toBe("19 Aug to 18 Sep");
  });
  it("puts a transaction on the statement day in that bill", () => {
    const c = cycleFor(a, 0, moment("2026-08-18"));
    expect(ymd(c.end)).toBe("2026-08-18");
    expect(inCycle({ moment: moment("2026-08-18 23:10") }, c)).toBe(true);
    expect(inCycle({ moment: moment("2026-08-19 00:01") }, c)).toBe(false);
  });
  it("steps back one cycle", () => {
    const c = cycleFor(a, -1, moment("2026-08-20"));
    expect(ymd(c.start)).toBe("2026-07-19");
    expect(ymd(c.end)).toBe("2026-08-18");
  });
  it("clamps day 31 to the end of February", () => {
    const feb = cycleFor({ ...a, statementDay: 31 }, 0, moment("2026-02-10"));
    expect(ymd(feb.end)).toBe("2026-02-28");
    expect(ymd(feb.start)).toBe("2026-02-01");
    const mar = cycleFor({ ...a, statementDay: 31 }, 0, moment("2026-03-05"));
    expect(ymd(mar.start)).toBe("2026-03-01");
    expect(ymd(mar.end)).toBe("2026-03-31");
  });
  it("uses the calendar month without a statement day", () => {
    const cal = cycleFor({ ...a, statementDay: null }, -1, moment("2026-03-05"));
    expect(cal.calendar).toBe(true);
    expect(cal.label).toBe("February 2026");
    expect(ymd(cal.end)).toBe("2026-02-28");
  });
});

describe("dueFor", () => {
  it("falls in the month after the statement when the due day is earlier", () => {
    expect(ymd(dueFor(a, cycleFor(a, 0, moment("2026-08-20")))!)).toBe("2026-10-07");
  });
  it("falls in the same month when the due day is later", () => {
    const b = { ...a, statementDay: 1, dueDay: 21 };
    expect(ymd(dueFor(b, cycleFor(b, -1, moment("2026-08-10")))!)).toBe("2026-08-21");
  });
  it("is null without a due day or on a calendar cycle", () => {
    expect(dueFor({ ...a, dueDay: null }, cycleFor(a, 0, moment("2026-08-20")))).toBeNull();
    const cal = { ...a, statementDay: null };
    expect(dueFor(cal, cycleFor(cal, 0, moment("2026-08-20")))).toBeNull();
  });
});

describe("parseAccounts", () => {
  it("reads the config table between the markers", () => {
    const text = [
      "prose", ACCT_START,
      "| Account | Statement day | Due day | Credit limit | Notes |",
      "| --- | --- | --- | --- | --- |",
      "| Card | 18 | 7 | 100000 | |",
      "| Bank |  |  |  | savings |",
      "| Bad | 45 | x | -5 | |",
      ACCT_END,
    ].join("\n");
    expect(parseAccounts(text)).toEqual([
      { name: "Card", statementDay: 18, dueDay: 7, limit: 100000, note: "" },
      { name: "Bank", statementDay: null, dueDay: null, limit: null, note: "savings" },
      { name: "Bad", statementDay: null, dueDay: null, limit: null, note: "" },
    ]);
  });
  it("returns nothing when the markers are only quoted", () => {
    expect(parseAccounts(`const s = "${ACCT_START}";`)).toEqual([]);
  });
});
