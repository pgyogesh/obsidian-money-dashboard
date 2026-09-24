import { moment } from "obsidian";
import type { Moment } from "moment";
import { inboxToTxn, parseInbox } from "../parse/inbox";
import { INBOX_MARK, MONTH_FMT, TXN_END, TXN_START } from "../parse/markers";
import { applyCanonicalMerchants } from "../parse/merchant";
import { parseMonthTxns } from "../parse/month";
import { summarise } from "../parse/summary";
import { isSeparator, splitCells } from "../parse/table";
import type { Categories, InboxRow, Ranked, Summary, Txn } from "../parse/types";
import { cleanFreeText } from "../write/cell";

export interface MonthNoteIn {
  path: string;
  text: string;
}

export interface MonthPlan {
  key: string;
  label: string;
  path: string;
  isNew: boolean;
  /** Inbox rows this month takes. */
  moved: InboxRow[];
  /** Existing and moved rows, after duplicates and merchant folding, sorted. */
  merged: Txn[];
  dropped: number;
  renamed: number;
  summary: Summary;
  reconciled: boolean;
  table: string;
  money: Record<string, unknown>;
}

export interface ArchivePlan {
  months: MonthPlan[];
  /** Rows in a completed month with no category. They block archiving. */
  blank: InboxRow[];
  future: InboxRow[];
  currentCount: number;
  /** Table lines under the inbox marker that have no readable date. */
  unreadable: number;
  /** Why Archive is disabled. Empty means it may run. */
  blocked: string[];
}

export const monthNotePath = (key: string, folder: string, byYear: boolean): string => {
  const m = moment(key, "YYYY-MM", true);
  const parts = [folder.replace(/^\/+|\/+$/g, ""), byYear ? m.format("YYYY") : "", `${m.format(MONTH_FMT)}.md`];
  return parts.filter(Boolean).join("/");
};

/** Ref is the duplicate key when present, else date, amount and merchant. The first row wins. */
export const dedupeTxns = (txns: Txn[]): { kept: Txn[]; dropped: number } => {
  const seen = new Set<string>();
  const kept: Txn[] = [];
  for (const t of txns) {
    // The merchant is compared loosely: a note may already hold the folded
    // spelling ("Zomato") of an inbox row that still says "ZOMATO".
    const merchant = String(t.merchant ?? "").trim().replace(/\s+/g, " ").toLowerCase();
    const k = t.ref ? `ref:${t.ref}` : `dam:${t.date}|${t.amount.toFixed(2)}|${merchant}`;
    if (seen.has(k)) continue;
    seen.add(k);
    kept.push(t);
  }
  return { kept, dropped: txns.length - kept.length };
};

export const MONTH_HEADER = "| Date | Merchant | Description | Category | Card | Type | Amount | Ref | Location | Raw |";
const MONTH_SEP = "| --- | --- | --- | --- | --- | --- | ---: | --- | --- | --- |";

const byDateThenMerchant = (a: Txn, b: Txn) =>
  String(a.date).localeCompare(String(b.date)) || String(a.merchant).localeCompare(String(b.merchant));

/** The month note table, sorted by date then merchant. */
export const buildTable = (txns: Txn[]): string => {
  const c = (v: unknown) => cleanFreeText(String(v ?? ""));
  const rows = txns.slice().sort(byDateThenMerchant).map((t) =>
    `| ${[t.date, t.merchant, t.description, t.category, t.card, t.type, t.amount.toFixed(2), t.ref ?? "", t.location, t.desc].map(c).join(" | ")} |`);
  return [MONTH_HEADER, MONTH_SEP, ...rows].join("\n");
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const asObject = (r: Ranked) => Object.fromEntries(r.map(([k, v]) => [k, round2(v)]));
const sumOf = (r: Ranked) => r.reduce((a, [, v]) => a + v, 0);

/** Table data lines under the inbox marker, header and separators excluded. */
const inboxDataLines = (text: string): number => {
  const at = text.indexOf(INBOX_MARK);
  if (at < 0) return 0;
  let n = 0;
  for (const raw of text.slice(at + INBOX_MARK.length).split("\n")) {
    const line = raw.trim();
    if (!line.startsWith("|")) continue;
    const c = splitCells(line);
    if (isSeparator(c[0]) || /^when$/i.test(c[0]) || c.length < 7) continue;
    n++;
  }
  return n;
};

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/**
 * What archiving would do, without doing it. Every completed month in the
 * inbox is merged with its month note (existing rows first), duplicates are
 * dropped, merchant spellings are folded across the whole month, and the
 * rollups are computed and checked.
 */
export const planArchive = (a: {
  inboxText: string; notes: Map<string, MonthNoteIn>; now: Moment; cats: Categories;
  monthFolder: string; byYear: boolean;
}): ArchivePlan => {
  const rows = parseInbox(a.inboxText);
  const nowKey = a.now.format("YYYY-MM");
  const past = rows.filter((r) => r.key < nowKey);
  const future = rows.filter((r) => r.key > nowKey);
  const blank = past.filter((r) => !r.category.trim());
  const today = a.now.format("YYYY-MM-DD");
  const stamp = { updated: today, sources: [`inbox, archived ${today}`] };

  const byMonth = new Map<string, InboxRow[]>();
  for (const r of past.slice().sort((x, y) => x.when.localeCompare(y.when))) {
    if (!byMonth.has(r.key)) byMonth.set(r.key, []);
    byMonth.get(r.key)!.push(r);
  }

  const months: MonthPlan[] = [];
  for (const key of [...byMonth.keys()].sort()) {
    const moved = byMonth.get(key)!;
    const note = a.notes.get(key);
    const existing = note ? (parseMonthTxns(note.text) ?? []) : [];
    const incoming = moved.map((r) => { const { src: _src, ...t } = inboxToTxn(r); return t; });
    const { kept, dropped } = dedupeTxns([...existing, ...incoming]);
    const before = kept.map((t) => t.merchant);
    applyCanonicalMerchants(kept);
    const renamed = kept.filter((t, i) => t.merchant !== before[i]).length;
    const merged = kept.slice().sort(byDateThenMerchant);
    const summary = summarise(merged, a.cats);
    const reconciled = [summary.byCategory, summary.byCard, summary.byType]
      .every((r) => Math.abs(sumOf(r) - summary.net) <= 0.01);
    months.push({
      key, label: moment(key, "YYYY-MM").format("MMMM YYYY"),
      path: note?.path ?? monthNotePath(key, a.monthFolder, a.byYear), isNew: !note,
      moved, merged, dropped, renamed, summary, reconciled,
      table: buildTable(merged),
      money: {
        status: "archived", ...stamp,
        income: round2(summary.income), invested: round2(summary.invested),
        spend: round2(summary.spend), refunds: round2(summary.refunds), net_spend: round2(summary.net),
        txn_count: summary.count,
        by_category: asObject(summary.byCategory), by_card: asObject(summary.byCard), by_type: asObject(summary.byType),
      },
    });
  }

  const blocked: string[] = [];
  // A note with one marker, or the two in the wrong order, cannot be merged
  // safely: replacing "between" them could delete the user's own text.
  for (const key of byMonth.keys()) {
    const n = a.notes.get(key);
    if (!n) continue;
    const s = n.text.indexOf(TXN_START), e = n.text.indexOf(TXN_END);
    if ((s < 0) !== (e < 0) || (s >= 0 && e < s)) {
      blocked.push(`${n.path} has a broken money section: it needs both ${TXN_START} and ${TXN_END}, in that order. Fix the note, then archive again.`);
    }
  }
  if (!months.length) blocked.push("Nothing to archive. Every row in the inbox is from the current month or later.");
  if (blank.length) {
    const n = blank.length;
    blocked.push(`${n} ${plural(n, "row", "rows")} in a completed month ${plural(n, "has", "have")} no category. Fill ${plural(n, "it", "them")} in, then archive again.`);
  }
  for (const m of months.filter((x) => !x.reconciled)) {
    blocked.push(`${m.label}: the category, card or method totals do not add up to net spend.`);
  }

  return {
    months, blank, future,
    currentCount: rows.filter((r) => r.key === nowKey).length,
    unreadable: Math.max(0, inboxDataLines(a.inboxText) - rows.length),
    blocked,
  };
};
