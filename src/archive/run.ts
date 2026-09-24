import { App, moment, TFile } from "obsidian";
import type { Moment } from "../time";
import { MONTH_FMT, TXN_END, TXN_START } from "../parse/markers";
import { parseInbox } from "../parse/inbox";
import type { Categories } from "../parse/types";
import { findInbox } from "../vault/load";
import { obsidianVault } from "../vault/obsidian";
import { newMonthNote, removeInboxLines, replaceTable } from "./note";
import { planArchive, type ArchivePlan, type MonthNoteIn } from "./plan";

export interface ArchiveOptions {
  monthFolder: string;
  byYear: boolean;
}

export type ArchiveResult =
  | { ok: true; months: string[]; moved: number; left: number; backup: string }
  | { ok: false; why: string; backup?: string };

type MonthNote = MonthNoteIn & { file: TFile };

/**
 * Every note named like a month, one per month. A Periodic Notes monthly note
 * with no money section counts too, so archiving writes into it rather than
 * creating a second note. Where two share a name, the one with the markers
 * wins, then the shorter path.
 */
export const collectMonthNotes = async (app: App, inboxPath: string | null): Promise<Map<string, MonthNote>> => {
  const out = new Map<string, MonthNote>();
  for (const file of app.vault.getMarkdownFiles()) {
    if (file.path === inboxPath) continue;
    const m = moment(file.basename, MONTH_FMT, true);
    if (!m.isValid()) continue;
    const key = m.format("YYYY-MM");
    const text = await app.vault.read(file);
    const cand: MonthNote = { file, path: file.path, text };
    const cur = out.get(key);
    const marked = (n: MonthNote) => n.text.includes(TXN_START) && n.text.includes(TXN_END);
    if (!cur || (marked(cand) && !marked(cur))
      || (marked(cand) === marked(cur) && cand.path.length < cur.path.length)) out.set(key, cand);
  }
  return out;
};

const plan = async (app: App, o: ArchiveOptions, cats: Categories, now: Moment) => {
  const found = await findInbox(obsidianVault(app));
  if (!found) return { found: null, notes: new Map<string, MonthNote>(), plan: null };
  const file = app.vault.getAbstractFileByPath(found.file.path);
  if (!(file instanceof TFile)) return { found: null, notes: new Map<string, MonthNote>(), plan: null };
  const inboxText = await app.vault.read(file); // not the cache: this plan decides a write
  const notes = await collectMonthNotes(app, found.file.path);
  return {
    found: { file, text: inboxText }, notes,
    plan: planArchive({ inboxText, notes, now, cats, monthFolder: o.monthFolder, byYear: o.byYear }),
  };
};

/** What Archive would do right now. Nothing is written. */
export const previewArchive = async (app: App, o: ArchiveOptions, cats: Categories, now: Moment = moment()):
  Promise<{ plan: ArchivePlan | null; inboxPath: string | null }> => {
  const p = await plan(app, o, cats, now);
  return { plan: p.plan, inboxPath: p.found?.file.path ?? null };
};

const parentOf = (path: string) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");

const ensureFolder = async (app: App, folder: string) => {
  let at = "";
  for (const part of folder.split("/").filter(Boolean)) {
    at = at ? `${at}/${part}` : part;
    if (!app.vault.getAbstractFileByPath(at)) {
      try { await app.vault.createFolder(at); } catch { /* created meanwhile */ }
    }
  }
};

/**
 * Archive every completed month. The order is what keeps the inbox safe:
 * back it up, plan from a fresh read, write every month note, and only then
 * remove the archived rows from the inbox.
 */
export const runArchive = async (app: App, o: ArchiveOptions, cats: Categories, now: Moment = moment()): Promise<ArchiveResult> => {
  const p = await plan(app, o, cats, now);
  if (!p.found || !p.plan) return { ok: false, why: "No inbox found. Run \"Set up money notes\" first." };
  if (p.plan.blocked.length) return { ok: false, why: p.plan.blocked.join(" ") };

  const inbox = p.found.file;
  const dir = parentOf(inbox.path);
  const backupDir = dir ? `${dir}/.archive-backups` : ".archive-backups";
  const backup = `${backupDir}/${inbox.basename}-${now.format("YYYYMMDD-HHmmss")}.md`;
  try {
    if (!(await app.vault.adapter.exists(backupDir))) await app.vault.adapter.mkdir(backupDir);
    await app.vault.adapter.write(backup, p.found.text);
  } catch (e) {
    return { ok: false, why: `Could not back up the inbox, so nothing was changed: ${(e as Error).message}` };
  }

  const written: string[] = [];
  try {
    for (const m of p.plan.months) {
      let file: TFile;
      const existing = p.notes.get(m.key);
      if (existing) {
        file = existing.file;
        await app.vault.process(file, (text) => replaceTable(text, m.table));
      } else {
        await ensureFolder(app, parentOf(m.path));
        file = await app.vault.create(m.path, newMonthNote(m.label, m.table));
      }
      // Merge, so the user's own keys under money: (currency, statement
      // links, notes) survive. The plugin's figures replace their old values.
      await app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
        const cur = fm.money;
        const own = cur && typeof cur === "object" && !Array.isArray(cur) ? cur as Record<string, unknown> : {};
        fm.money = { ...own, ...m.money };
      });
      written.push(m.label);
    }
    const lines = new Set(p.plan.months.flatMap((m) => m.moved.map((r) => r.srcLine)));
    const after = await app.vault.process(inbox, (text) => removeInboxLines(text, lines));
    return {
      ok: true, backup,
      months: p.plan.months.map((m) => m.label),
      moved: lines.size,
      left: parseInbox(after).length,
    };
  } catch (e) {
    const done = written.length
      ? ` ${written.join(", ")} ${written.length === 1 ? "was" : "were"} already written to ${written.length === 1 ? "its month note" : "their month notes"}. Archiving again merges without duplicating.`
      : " No month note was changed.";
    return { ok: false, backup, why: `Archiving stopped: ${(e as Error).message}.${done} The inbox still holds every row. A backup is at ${backup}.` };
  }
};
