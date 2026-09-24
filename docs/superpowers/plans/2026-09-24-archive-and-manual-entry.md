# Archive completed months, and add expenses by hand: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an archive command with a preview, and a manual expense form, to the Money Dashboard plugin.

**Architecture:** Pure planning and row-building code in `src/archive/plan.ts`, `src/archive/note.ts` and `src/entry/row.ts`, tested with vitest. Thin vault code in `src/archive/run.ts` and `src/entry/save.ts`, tested against a fake app. Two Obsidian modals, and wiring in `main.ts`, the settings and the dashboard.

**Tech Stack:** TypeScript, the `obsidian` API (`Modal`, `Setting`, `vault.process`, `fileManager.processFrontMatter`, `vault.adapter`), vitest, jsdom.

**Spec:** `docs/superpowers/specs/2026-09-24-archive-completed-months-design.md`

## Global Constraints

- Month note table header, exactly: `| Date | Merchant | Description | Category | Card | Type | Amount | Ref | Location | Raw |`, separator `| --- | --- | --- | --- | --- | --- | ---: | --- | --- | --- |`.
- `money:` keys: `status: archived`, `updated`, `sources`, `income`, `invested`, `spend`, `refunds`, `net_spend`, `txn_count`, `by_category`, `by_card`, `by_type`.
- Only the text between the `txns` markers and the `money` frontmatter key are changed in an existing month note.
- Backup path: `<inbox folder>/.archive-backups/Expenses-YYYYMMDD-HHmmss.md`.
- Archived rows leave the inbox only after every month note is written.
- Manual `Ref` default: `MANUAL-YYYYMMDDHHmmss`.
- Every written cell goes through `cleanFreeText`.
- No em-dash character in any file. No personal data.

## Review Focus

1. **The Shortcut appends a row while the preview is open.** Archiving re-plans from a fresh read, so the new row is archived or kept correctly, never lost. Pinned in Task 3.
2. **A month note with the user's own text above and below the markers, and other frontmatter.** All of it survives. Pinned in Task 2 and Task 3.
3. **A Periodic Notes monthly note with no money section yet.** The section is appended to it, not a second note created. Pinned in Task 3.
4. **Archiving twice.** The second run finds nothing to archive and writes nothing. Pinned in Task 3.
5. **A manual row for an inbox whose header is reordered, or whose file has no final line break.** The row lands in header order on its own line. Pinned in Task 4.

---

### Task 1: Read Ref in month notes

**Files:** Modify `src/parse/month.ts`. Test `tests/month.test.ts`.

- [ ] Step 1: Add a failing test: a month table with a `Ref` column gives `note` equal to the Ref value.
- [ ] Step 2: Run `npx vitest run tests/month.test.ts`. Expected: FAIL.
- [ ] Step 3: `note: get("notes") || get("ref")`.
- [ ] Step 4: Run again. Expected: PASS. Commit `fix: read Ref in month notes`.

### Task 2: Archive planning (pure)

**Files:** Create `src/archive/plan.ts`, `src/archive/note.ts`. Test `tests/archive-plan.test.ts`, `tests/archive-note.test.ts`.

**Interfaces:**
- Produces:
  - `interface MonthNoteIn { path: string; text: string }`
  - `interface MonthPlan { key: string; label: string; path: string; isNew: boolean; moved: InboxRow[]; merged: Txn[]; dropped: number; renamed: number; summary: Summary; reconciled: boolean; table: string; money: Record<string, unknown> }`
  - `interface ArchivePlan { months: MonthPlan[]; blank: InboxRow[]; future: InboxRow[]; currentCount: number; unreadable: number; blocked: string[] }`
  - `planArchive(a: { inboxText: string; notes: Map<string, MonthNoteIn>; now: Moment; cats: Categories; monthFolder: string; byYear: boolean }): ArchivePlan`
  - `monthNotePath(key: string, folder: string, byYear: boolean): string`
  - `dedupeTxns(txns: Txn[]): { kept: Txn[]; dropped: number }`
  - `buildTable(txns: Txn[]): string`
  - `replaceTable(noteText: string, table: string): string`
  - `newMonthNote(label: string, table: string): string`
  - `removeLines(text: string, lines: Set<string>): string`

- [ ] Step 1: Write failing tests covering: past rows chosen, current kept, future listed; a blank category blocks with the row listed; nothing to archive blocks; dedupe by Ref and by date+amount+merchant with existing rows first; merchant folding counted; totals reconcile; `buildTable` round trip through `parseMonthTxns` and `summarise` gives the same net; `replaceTable` keeps text above and below; `replaceTable` appends a section when there are no markers; `removeLines` removes only the named lines; `monthNotePath("2026-08","Money/Months",true)` is `Money/Months/2026/2026 - 08-August.md`.
- [ ] Step 2: Run. Expected: FAIL.
- [ ] Step 3: Implement.
- [ ] Step 4: Run. Expected: PASS. Commit `feat: plan an archive run`.

### Task 3: Archive run (vault)

**Files:** Create `src/archive/run.ts`, `tests/fakeApp.ts`. Modify `tests/render.test.ts` to use the shared fake app. Test `tests/archive-run.test.ts`.

**Interfaces:**
- Consumes: Task 2.
- Produces:
  - `collectMonthNotes(app: App): Promise<Map<string, MonthNoteIn & { file: TFile }>>` reading every note whose basename is a month, choosing one per month (the one with markers, then the shorter path).
  - `previewArchive(app, settings, cats): Promise<{ plan: ArchivePlan; inboxPath: string | null }>`
  - `runArchive(app, settings, cats): Promise<{ ok: true; months: string[]; moved: number; left: number; backup: string } | { ok: false; why: string; backup?: string }>`

- [ ] Step 1: Write failing tests with the fake app: archives last month into an existing note keeping its text and other frontmatter; creates a note in the folder when none exists; appends the section to a note with no markers; removes archived rows and keeps current rows; writes a backup; a row appended to the inbox after the preview is kept or archived by the fresh plan; a second run returns `ok: false` with "Nothing to archive" and writes nothing; after archiving, `loadMonths` gives the same net for that month as before.
- [ ] Step 2: Run. Expected: FAIL.
- [ ] Step 3: Implement.
- [ ] Step 4: Run. Expected: PASS. Commit `feat: run an archive`.

### Task 4: Manual entry (pure and save)

**Files:** Create `src/entry/row.ts`, `src/entry/save.ts`. Test `tests/entry.test.ts`.

**Interfaces:**
- Produces:
  - `interface EntryFields { when: string; amount: string; direction: "debit" | "credit"; merchant: string; category: string; account: string; method: string; description: string; ref: string; location: string }`
  - `validateEntry(f: EntryFields, now: Moment, archivedKeys: Set<string>): { errors: string[]; warnings: string[] }`
  - `inboxHeader(text: string): string[] | null`
  - `buildRow(header: string[] | null, f: EntryFields, now: Moment): string`
  - `appendRow(text: string, row: string): string`
  - `saveEntry(app: App, f: EntryFields): Promise<{ ok: true; path: string } | { ok: false; why: string }>`

- [ ] Step 1: Write failing tests: validation errors and warnings; row in a reordered header's order; legacy order without a header; `parseInbox` reads the built row back; generated Ref; `appendRow` adds a missing final line break; `saveEntry` keeps a row appended in the meantime.
- [ ] Step 2: Run. Expected: FAIL.
- [ ] Step 3: Implement.
- [ ] Step 4: Run. Expected: PASS. Commit `feat: build and save a manual row`.

### Task 5: Modals, settings, wiring, docs

**Files:** Create `src/archive/modal.ts`, `src/entry/modal.ts`. Modify `src/settings.ts`, `src/main.ts`, `src/render/common.ts`, `src/render/dashboard.ts`, `tests/obsidian-stub.ts`, `tests/render.test.ts`, `README.md`, `docs/data-format.md`.

**Interfaces:**
- `RenderCtx` gains `openArchive(): void` and `openEntry(): void`.
- Settings gain `monthFolder` (default `Money/Months`), `monthByYear` (default `true`), `lastAccount`, `lastMethod`.

- [ ] Step 1: Write failing render tests: the dashboard header has a ＋ button that calls `openEntry`; the "unarchived" banner has an Archive button that calls `openArchive`.
- [ ] Step 2: Run. Expected: FAIL.
- [ ] Step 3: Implement the modals, settings, commands and buttons. Document both features in the README and the data format.
- [ ] Step 4: Run all tests and `npm run build`. Expected: PASS. Commit `feat: archive and add-expense commands`.
