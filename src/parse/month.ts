import { num } from "./amount";
import { TXN_END, TXN_START } from "./markers";
import { getter, headerColumns, isSeparator, legacyColumns, splitCells, type Columns } from "./table";
import type { Txn } from "./types";

const LEGACY = ["date", "description", "merchant", "category", "card", "type", "amount", "notes"];

/** The transaction table of an archived month, or null when it has none. */
export const parseMonthTxns = (text: string): Txn[] | null => {
  const a = text.indexOf(TXN_START);
  const b = text.indexOf(TXN_END);
  if (a < 0 || b < 0 || b < a) return null;
  let col: Columns | null = null;
  const out: Txn[] = [];
  for (const raw of text.slice(a + TXN_START.length, b).split("\n")) {
    const line = raw.trim();
    if (!line.startsWith("|")) continue;
    const c = splitCells(line);
    if (isSeparator(c[0])) continue;
    if (/^date$/i.test(c[0])) { col = headerColumns(c); continue; }
    if (c.length < 7) continue;
    if (!col) col = legacyColumns(LEGACY);
    const get = getter(col, c);
    const hasRaw = col.raw != null;
    // A legacy Notes column is free text, not a reference. Where the table has
    // no Ref column, it is kept with the description instead.
    const notes = col.ref == null ? get("notes") : "";
    const description = [hasRaw ? get("description") : "", notes].filter(Boolean).join("; ");
    out.push({
      date: get("date"),
      // An older note has no Raw column, so its Description IS the raw text.
      desc: get("raw") || (hasRaw ? "" : get("description")),
      description,
      merchant: get("merchant") || get("description"),
      category: get("category") || "Uncategorised",
      card: get("card") || "Unknown",
      type: get("type") || "unknown",
      amount: num(get("amount")),
      note: get("notes") || get("ref"),
      ref: get("ref"),
      location: get("location"),
    });
  }
  return out;
};
