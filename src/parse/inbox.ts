import { moment } from "obsidian";
import { num } from "./amount";
import { INBOX_MARK } from "./markers";
import { getter, headerColumns, isSeparator, legacyColumns, splitCells, type Columns } from "./table";
import type { InboxRow, Txn } from "./types";

// Only a last resort, for a table whose header went missing.
const LEGACY = ["when", "amount", "direction", "merchant", "category",
  "account", "method", "ref", "raw"];

/**
 * A note merely CONTAINING the marker is not the inbox: code and docs quote
 * it. The real inbox has a table after it, so that is what is matched on.
 */
export const hasInboxTable = (text: string): boolean => {
  const at = text.indexOf(INBOX_MARK);
  if (at < 0) return false;
  return text.slice(at + INBOX_MARK.length).split("\n").some((l) => l.trim().startsWith("|"));
};

/**
 * Read the inbox. The table runs from the marker to the end of the file,
 * because a plain "append to file" action cannot write above a closing marker.
 * Columns are read by header name, never by position.
 */
export const parseInbox = (text: string): InboxRow[] => {
  const at = text.indexOf(INBOX_MARK);
  if (at < 0) return [];
  const out: InboxRow[] = [];
  // Index against the WHOLE file, so a write can address the exact line even
  // when several rows are byte-identical.
  const before = text.slice(0, at + INBOX_MARK.length).split("\n").length - 1;
  const body = text.slice(at + INBOX_MARK.length).split("\n");
  let col: Columns | null = null;

  for (let i = 0; i < body.length; i++) {
    const line = body[i].trim();
    if (!line.startsWith("|")) continue;
    const c = splitCells(line);
    if (isSeparator(c[0])) continue;
    if (/^when$/i.test(c[0])) { col = headerColumns(c); continue; }
    if (c.length < 7) continue;
    if (!col) col = legacyColumns(LEGACY);
    const get = getter(col, c);
    const m = moment(get("when").slice(0, 10), "YYYY-MM-DD", true);
    if (!m.isValid()) continue; // a row with no usable date cannot be placed
    out.push({
      when: get("when"), date: m.format("YYYY-MM-DD"), key: m.format("YYYY-MM"),
      amount: num(get("amount")), direction: get("direction").toLowerCase(),
      merchant: get("merchant"), category: get("category"),
      account: get("account"), method: get("method"),
      ref: get("ref"), raw: get("raw"), location: get("location"),
      description: get("description"),
      srcLine: line, srcIndex: before + i,
      catCol: col.category, descCol: col.description, merCol: col.merchant,
    });
  }
  return out;
};


/**
 * An inbox row becomes a transaction: Direction carries the sign, and a blank
 * category shows as Uncategorised rather than being dropped. The money is
 * real even when its label is not decided yet.
 */
export const inboxToTxn = (r: InboxRow): Txn => ({
  date: r.when,
  desc: r.raw || r.merchant,
  merchant: r.merchant || "Unknown",
  category: r.category || "Uncategorised",
  description: r.description ?? "",
  card: r.account || "Unknown",
  type: r.method || "unknown",
  amount: r.direction === "credit" ? -Math.abs(r.amount) : Math.abs(r.amount),
  note: r.ref ?? "",
  location: r.location ?? "",
  src: r,
});

/**
 * Which cell of a row holds `kind`, taken from the header the row was parsed
 * with, or from the legacy layout when the table has no header. Null when
 * the table has no such column: guessing a position could overwrite Raw.
 */
export const cellIndexFor = (r: InboxRow, kind: "category" | "merchant" | "description"): number | null => {
  const at = kind === "category" ? r.catCol : kind === "merchant" ? r.merCol : r.descCol;
  return at ?? null;
};
