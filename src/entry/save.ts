import { App, moment, TFile } from "obsidian";
import type { Moment } from "moment";
import { findInbox } from "../vault/load";
import { obsidianVault } from "../vault/obsidian";
import { appendRow, buildRow, inboxHeader, validateEntry, type EntryFields } from "./row";

/**
 * Append one manual row to the inbox. `vault.process` hands over the file as
 * it is on disk now, so a row the Shortcut appended a moment ago is kept.
 */
export const saveEntry = async (app: App, f: EntryFields, now: Moment = moment()):
  Promise<{ ok: true; path: string } | { ok: false; why: string }> => {
  const { errors } = validateEntry(f, now, new Set());
  if (errors.length) return { ok: false, why: errors.join(" ") };
  const found = await findInbox(obsidianVault(app));
  if (!found) return { ok: false, why: "No inbox found. Run \"Set up money notes\" first." };
  const file = app.vault.getAbstractFileByPath(found.file.path);
  if (!(file instanceof TFile)) return { ok: false, why: "The inbox file is not available." };
  await app.vault.process(file, (text) => appendRow(text, buildRow(inboxHeader(text), f, now)));
  return { ok: true, path: file.path };
};
