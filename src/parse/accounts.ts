import type { Moment } from "moment";
import { num } from "./amount";
import { ACCT_END, ACCT_START } from "./markers";
import { isSeparator, splitCells } from "./table";

export interface Account {
  name: string;
  /** Day of month the statement is generated, or null for a calendar month. */
  statementDay: number | null;
  dueDay: number | null;
  limit: number | null;
  note: string;
}

export interface Cycle {
  start: Moment;
  end: Moment;
  statement: Moment;
  label: string;
  calendar: boolean;
}

const day = (v: string): number | null => {
  const n = parseInt(String(v).replace(/[^0-9]/g, ""), 10);
  return n >= 1 && n <= 31 ? n : null;
};

/** The billing-cycle config table between the accounts markers. */
export const parseAccounts = (text: string): Account[] => {
  const a = text.indexOf(ACCT_START), b = text.indexOf(ACCT_END);
  if (a < 0 || b < 0 || b < a) return [];
  const out: Account[] = [];
  for (const raw of text.slice(a + ACCT_START.length, b).split("\n")) {
    const line = raw.trim();
    if (!line.startsWith("|")) continue;
    const c = splitCells(line);
    if (c.length < 4 || isSeparator(c[0]) || /^account$/i.test(c[0]) || !c[0]) continue;
    out.push({
      name: c[0], statementDay: day(c[1]), dueDay: day(c[2]),
      limit: num(c[3]) > 0 ? num(c[3]) : null, note: c[4] ?? "",
    });
  }
  return out;
};

// A statement day past the end of a short month is clamped, so "31" means the
// 28th in February rather than rolling into March.
const stmtOn = (m: Moment, d: number) => m.clone().date(Math.min(d, m.daysInMonth()));

/**
 * The billing cycle `offset` cycles from the one running on `now` (0 is the
 * current one, -1 the one before). A statement generated on day D covers the
 * day after the previous statement through day D inclusive. An account with
 * no statement day falls back to the calendar month.
 */
export const cycleFor = (acct: Account, offset: number, now: Moment): Cycle => {
  if (!acct.statementDay) {
    const m = now.clone().add(offset, "month");
    return {
      start: m.clone().startOf("month"), end: m.clone().endOf("month"),
      label: m.format("MMMM YYYY"), calendar: true, statement: m.clone().endOf("month"),
    };
  }
  const D = acct.statementDay;
  let base = now.clone();
  if (now.date() > Math.min(D, now.daysInMonth())) base = now.clone().add(1, "month");
  const end = stmtOn(base.add(offset, "month"), D).endOf("day");
  const start = stmtOn(end.clone().subtract(1, "month"), D).add(1, "day").startOf("day");
  return {
    start, end, statement: end.clone().startOf("day"),
    label: `${start.format("D MMM")} to ${end.format("D MMM")}`, calendar: false,
  };
};

/** When the bill for `cycle` is due, or null when there is no due day. */
export const dueFor = (acct: Account, cycle: Cycle): Moment | null => {
  if (!acct.dueDay || cycle.calendar || !acct.statementDay) return null;
  let m = cycle.statement.clone();
  if (acct.dueDay <= Math.min(acct.statementDay, m.daysInMonth())) m = m.add(1, "month");
  return stmtOn(m, acct.dueDay).endOf("day");
};

export const inCycle = (t: { moment: Moment }, c: Cycle): boolean =>
  t.moment.isValid() && !t.moment.isBefore(c.start) && !t.moment.isAfter(c.end);
