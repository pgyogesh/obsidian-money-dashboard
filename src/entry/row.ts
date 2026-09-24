import { moment } from "obsidian";
import type { Moment } from "moment";
import { num } from "../parse/amount";
import { DATE_FMTS, INBOX_MARK } from "../parse/markers";
import { isSeparator, splitCells } from "../parse/table";
import { cleanFreeText } from "../write/cell";

export interface EntryFields {
  /** YYYY-MM-DD HH:mm, or YYYY-MM-DD */
  when: string;
  amount: string;
  direction: "debit" | "credit";
  merchant: string;
  category: string;
  account: string;
  method: string;
  description: string;
  ref: string;
  location: string;
}

export const METHODS = ["upi", "credit_card", "debit_card", "neft", "imps", "netbanking", "atm", "fastag", "cash"];

// The order a header-less inbox is read in.
const LEGACY = ["When", "Amount", "Direction", "Merchant", "Category", "Account", "Method", "Ref", "Raw"];

const parseWhen = (when: string) => moment(String(when).trim(), DATE_FMTS, true);

/** Errors block saving. Warnings are shown but do not. */
export const validateEntry = (f: EntryFields, now: Moment, archivedKeys: Set<string>): { errors: string[]; warnings: string[] } => {
  const errors: string[] = [];
  const warnings: string[] = [];
  const m = parseWhen(f.when);
  if (!m.isValid()) errors.push("Enter a date and time.");
  if (!(num(f.amount) > 0) || /-/.test(f.amount)) errors.push("Enter an amount more than 0.");
  if (!f.merchant.trim()) errors.push("Enter a merchant.");
  if (m.isValid()) {
    if (archivedKeys.has(m.format("YYYY-MM"))) warnings.push("This month is archived. The row will count after you archive again.");
    if (m.isAfter(now)) warnings.push("This date is in the future.");
  }
  return { errors, warnings };
};

/** Down to the millisecond, so two saves in one second never share a Ref. */
export const defaultRef = (now: Moment) => `MANUAL-${now.format("YYYYMMDDHHmmssSSS")}`;

/** Wrap an async action so a second call while the first runs does nothing. */
export const singleFlight = (fn: () => Promise<void>): (() => Promise<void>) => {
  let running = false;
  return async () => {
    if (running) return;
    running = true;
    try { await fn(); } finally { running = false; }
  };
};

/** The header row under the inbox marker, or null when the table has none. */
export const inboxHeader = (text: string): string[] | null => {
  const at = text.indexOf(INBOX_MARK);
  if (at < 0) return null;
  for (const raw of text.slice(at + INBOX_MARK.length).split("\n")) {
    const line = raw.trim();
    if (!line.startsWith("|")) continue;
    const c = splitCells(line);
    if (isSeparator(c[0])) continue;
    return /^when$/i.test(c[0]) ? c : null;
  }
  return null;
};

/** One inbox row, with a cell per header column in the header's own order. */
export const buildRow = (header: string[] | null, f: EntryFields, now: Moment): string => {
  const m = parseWhen(f.when);
  const hasTime = /\d{2}:\d{2}/.test(f.when);
  const values: Record<string, string> = {
    when: m.isValid() ? m.format(hasTime ? "YYYY-MM-DD HH:mm" : "YYYY-MM-DD") : f.when,
    amount: Math.abs(num(f.amount)).toFixed(2),
    direction: f.direction,
    merchant: f.merchant,
    category: f.category,
    account: f.account,
    method: f.method,
    ref: f.ref.trim() || defaultRef(now),
    location: f.location,
    description: f.description,
    raw: "manual entry",
  };
  const cells = (header ?? LEGACY).map((name) => cleanFreeText(values[name.trim().toLowerCase()] ?? ""));
  return `| ${cells.join(" | ")} |`;
};

/** Append a row at the end of the file, on its own line. */
export const appendRow = (text: string, row: string): string =>
  `${text.endsWith("\n") || text === "" ? text : `${text}\n`}${row}\n`;
