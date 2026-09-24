import { moment } from "obsidian";
import type { Moment } from "../time";
import { parseAccounts, type Account } from "../parse/accounts";
import { str } from "../parse/str";
import { num } from "../parse/amount";
import { hasInboxTable, inboxToTxn, parseInbox } from "../parse/inbox";
import { DATE_FMTS, MONTH_FMT } from "../parse/markers";
import { applyCanonicalMerchants } from "../parse/merchant";
import { parseMonthTxns } from "../parse/month";
import { fromFrontmatter, summarise } from "../parse/summary";
import type { Categories, InboxRow, Summary, Txn } from "../parse/types";
import type { FileLike, VaultLike } from "./types";

// Every file is found by its marker or its filename, never by a path, so the
// plugin works with any folder layout.

/** Try likely names first, so the common case reads one file, not the vault. */
const ranked = (files: FileLike[], likely: RegExp) => [
  ...files.filter((f) => likely.test(f.basename)).sort((a, b) => a.path.length - b.path.length),
  ...files.filter((f) => !likely.test(f.basename)),
];

export const findInbox = async (v: VaultLike): Promise<{ file: FileLike; text: string } | null> => {
  for (const f of ranked(v.files(), /expenses|inbox/i)) {
    const text = await v.read(f);
    if (hasInboxTable(text)) return { file: f, text };
  }
  return null;
};

/** The config note must yield real rows: code and docs also quote the marker. */
export const findAccounts = async (v: VaultLike): Promise<{ file: FileLike; accounts: Account[] } | null> => {
  for (const f of ranked(v.files(), /account/i)) {
    const accounts = parseAccounts(await v.read(f));
    if (accounts.length) return { file: f, accounts };
  }
  return null;
};

const groupByKey = <T>(items: T[], key: (t: T) => string) => {
  const m = new Map<string, T[]>();
  for (const it of items) {
    const k = key(it);
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(it);
  }
  return m;
};

interface Archived {
  file: FileLike;
  m: Moment;
  money: Record<string, unknown> | null;
  txns: Txn[] | null;
}

export interface Duplicate {
  key: string;
  paths: string[];
  used: string;
}

/**
 * Month notes are named "YYYY - MM-MMMM" and carry money frontmatter or a
 * table. Two notes with the same name in different folders would count the
 * month twice, so only one is used: the one with a table, then the shorter
 * path. The others are reported.
 */
const findArchived = async (v: VaultLike, inbox: FileLike | null): Promise<{ archived: Archived[]; duplicates: Duplicate[] }> => {
  const all: Archived[] = [];
  for (const file of v.files()) {
    if (inbox && file.path === inbox.path) continue;
    const m = moment(file.basename, MONTH_FMT, true);
    if (!m.isValid()) continue;
    const fm = v.frontmatter(file);
    const money = fm && typeof fm.money === "object" && fm.money ? fm.money as Record<string, unknown> : null;
    const txns = parseMonthTxns(await v.read(file));
    if (!money && !txns) continue; // an ordinary monthly note
    all.push({ file, m, money, txns });
  }
  const byKey = groupByKey(all, (a) => a.m.format("YYYY-MM"));
  const archived: Archived[] = [];
  const duplicates: Duplicate[] = [];
  for (const [key, group] of byKey) {
    const ranked = group.slice().sort((a, b) =>
      Number(!!b.txns?.length) - Number(!!a.txns?.length)
      || a.file.path.length - b.file.path.length
      || a.file.path.localeCompare(b.file.path));
    archived.push(ranked[0]);
    if (group.length > 1) {
      duplicates.push({ key, paths: group.map((g) => g.file.path).sort(), used: ranked[0].file.path });
    }
  }
  duplicates.sort((a, b) => a.key.localeCompare(b.key));
  return { archived, duplicates };
};

export interface Overlap {
  key: string;
  label: string;
  winner: "inbox" | "archive";
}

export interface MonthData extends Summary {
  key: string;
  short: string;
  label: string;
  moment: Moment;
  file: FileLike | null;
  status: string;
  sources: string[];
  updated: string | null;
  drift: { stored: number; computed: number } | null;
  fromInbox?: boolean;
  rows?: InboxRow[];
}

export interface LoadedMonths {
  months: MonthData[];
  overlaps: Overlap[];
  duplicates: Duplicate[];
  inbox: FileLike | null;
}

/**
 * Every month, from both sources, with this precedence:
 *   current month: the inbox wins. An archive of a running month is stale.
 *   past month:    the archive wins. Archiving deletes rows from the inbox, so
 *                  anything left there is a leftover, not the record.
 * The loser is dropped, never summed, because summing would double every
 * transaction. Each overlap is reported.
 */
export const loadMonths = async (v: VaultLike, cats: Categories, now: Moment): Promise<LoadedMonths> => {
  const found = await findInbox(v);
  const inbox = found ? parseInbox(found.text) : [];
  const { archived, duplicates } = await findArchived(v, found?.file ?? null);
  // Unify merchant spellings across every source before anything is grouped.
  // Only the transactions are relabelled. The inbox rows keep the file's own
  // spelling, because an edit box is seeded from them, and seeding it from the
  // display would rewrite "ZOMATO" to "Zomato" on a mere click.
  const liveTxns = inbox.map(inboxToTxn);
  applyCanonicalMerchants([...liveTxns, ...archived.flatMap((x) => x.txns ?? [])]);

  const noteMonths: MonthData[] = [];
  for (const { file, m, money, txns } of archived) {
    const s = txns && txns.length ? summarise(txns, cats) : (money ? fromFrontmatter(money) : null);
    if (!s) continue;
    const drift = money && txns && txns.length && money.spend != null && Math.abs(num(money.spend) - s.spend) > 1
      ? { stored: num(money.spend), computed: s.spend } : null;
    const src = money?.sources;
    noteMonths.push({
      ...s, file, moment: m,
      key: m.format("YYYY-MM"), short: m.format("MMM"), label: m.format("MMMM YYYY"),
      status: (str(money?.status) || "final").toLowerCase(),
      sources: Array.isArray(src) ? src.map(str).filter(Boolean) : (str(src) ? [str(src)] : []),
      updated: str(money?.updated) || null,
      drift,
    });
  }

  const NOW_KEY = now.format("YYYY-MM");
  const archivedKeys = new Set(noteMonths.map((m) => m.key));
  const live = groupByKey(liveTxns, (t) => t.src!.key);
  const merged: MonthData[] = [];
  const overlaps: Overlap[] = [];
  for (const [key, txns] of live) {
    const m = moment(key, "YYYY-MM", true);
    const isCurrent = key === NOW_KEY;
    if (archivedKeys.has(key)) overlaps.push({ key, label: m.format("MMMM YYYY"), winner: isCurrent ? "inbox" : "archive" });
    if (!isCurrent && archivedKeys.has(key)) continue;
    merged.push({
      ...summarise(txns, cats),
      file: found?.file ?? null, moment: m,
      key, short: m.format("MMM"), label: m.format("MMMM YYYY"),
      status: isCurrent ? "live" : "unarchived",
      sources: [`inbox, read live from ${found?.file.path}`],
      updated: null, drift: null, fromInbox: true, rows: txns.map((t) => t.src!),
    });
  }
  for (const m of noteMonths) {
    if (m.key === NOW_KEY && live.has(m.key)) continue;
    merged.push(m);
  }
  merged.sort((a, b) => a.key.localeCompare(b.key));
  overlaps.sort((a, b) => a.key.localeCompare(b.key));
  return { months: merged, overlaps, duplicates, inbox: found?.file ?? null };
};

export type PoolTxn = Txn & { moment: Moment };

/**
 * One flat pool of transactions across all months, with the same precedence
 * as loadMonths. A billing cycle spans a month boundary, so it needs the live
 * inbox and the archive at once.
 */
export const loadPool = async (v: VaultLike, now: Moment): Promise<PoolTxn[]> => {
  const found = await findInbox(v);
  const inbox = found ? parseInbox(found.text) : [];
  const { archived } = await findArchived(v, found?.file ?? null);
  const NOW_KEY = now.format("YYYY-MM");
  // Same rule as loadMonths: any archived month, with or without a table,
  // makes that past month's inbox rows leftovers.
  const archivedKeys = new Set(archived.map((a) => a.m.format("YYYY-MM")));
  const liveKeys = new Set(inbox.map((r) => r.key));

  const pool: Txn[] = [];
  for (const r of inbox) {
    if (r.key !== NOW_KEY && archivedKeys.has(r.key)) continue;
    pool.push(inboxToTxn(r));
  }
  for (const a of archived) {
    const key = a.m.format("YYYY-MM");
    if (key === NOW_KEY && liveKeys.has(key)) continue;
    pool.push(...(a.txns ?? []));
  }
  applyCanonicalMerchants(pool);
  // Parse each date once: a cycle test runs per account per cycle.
  return pool.map((t) => {
    const full = moment(t.date, DATE_FMTS, true);
    return { ...t, moment: full.isValid() ? full : moment(String(t.date).slice(0, 10), "YYYY-MM-DD", true) };
  });
};
