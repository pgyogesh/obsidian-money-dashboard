# Money Dashboard plugin: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the three `dataviewjs` money pages in the author's vault into one free Obsidian community plugin, `money-dashboard`.

**Architecture:** Pure parsing and maths live in `src/parse/` with no Obsidian dependency apart from `moment`, and vitest tests them. `src/vault/` finds and reads notes through a small `VaultLike` interface, so a fake vault can test it. `src/render/` draws each page into the element that a code block processor hands it. `main.ts` wires these together with settings and one setup command.

**Tech Stack:** TypeScript 5, esbuild, the `obsidian` API, vitest, `moment` (Obsidian's own copy at runtime; the npm copy only in tests).

**Spec:** `docs/superpowers/specs/2026-09-24-money-dashboard-plugin-design.md`

## Global Constraints

- Plugin `id` is `money-dashboard` and `name` is `Money Dashboard`. Neither contains "Obsidian".
- `isDesktopOnly` is `false`.
- Licence is MIT. The plugin is free.
- The data format does not change: markers `%% money:inbox:start %%`, `%% money:txns:start %%`, `%% money:txns:end %%`, `%% money:accounts:start %%`, `%% money:accounts:end %%`; month notes named `YYYY - MM-MMMM`; positive is money out, negative is money in.
- Columns are read by header name, never by position, except for the documented legacy fallback when a header is missing.
- Files are found by marker and filename, never by path.
- File writes use `app.vault.process`.
- No `innerHTML`. Dynamic values go through CSS custom properties or classes, not `el.style.x =`.
- The README lists Dataview as required and holds the placeholder `APPLE_SHORTCUT_LINK`.
- No personal data in the repo. `tests/privacy.test.ts` enforces this with a git-ignored deny-list.
- No em-dash character in any file.

## Review Focus

1. **A header that is missing or reordered.** A table with `Location` inserted before `Raw` must still read `Raw` correctly. Pinned in Task 3.
2. **Two byte-identical inbox rows, and one gets edited.** The write must refuse rather than edit the wrong one, unless the remembered line index still matches. Pinned in Task 5.
3. **Statement day 31 in February.** The cycle must end on 28 or 29 February, not roll into March. Pinned in Task 4.
4. **One month in both the inbox and an archived note.** It must never be counted twice. Current month: inbox wins. Past month: archive wins. Pinned in Task 6.
5. **The setup command run twice.** It must never overwrite an existing note. Pinned in Task 7.

---

### Task 1: Scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `esbuild.config.mjs`, `vitest.config.ts`, `manifest.json`, `versions.json`, `.gitignore`, `LICENSE`, `tests/obsidian-stub.ts`, `src/main.ts` (empty plugin class)

**Interfaces:**
- Produces: `npm run build` writes `main.js`; `npm test` runs vitest; the module name `obsidian` resolves to `tests/obsidian-stub.ts` in tests, which re-exports npm `moment`.

- [ ] Step 1: `git init`, write the files above. `manifest.json`: `{"id":"money-dashboard","name":"Money Dashboard","version":"0.1.0","minAppVersion":"1.4.0","description":"Spend, billing-cycle and map dashboards from a markdown transaction inbox.","author":"Yogesh Jadhav","isDesktopOnly":false}`.
- [ ] Step 2: `npm install`, then `npm run build`. Expected: `main.js` exists, no type errors.
- [ ] Step 3: Commit `chore: scaffold plugin`.

### Task 2: Amounts and formatting

**Files:**
- Create: `src/parse/amount.ts`, `src/parse/format.ts`
- Test: `tests/amount.test.ts`, `tests/format.test.ts`

**Interfaces:**
- Produces:
  - `num(v: unknown): number` (port of `Money Dashboard.md:87-97`)
  - `interface MoneyFormat { currency: string; style: "indian" | "international" }`
  - `makeFormat(f: MoneyFormat): { whole(n): string; exact(n): string; short(n): string; pct(part, whole): string }`

- [ ] Step 1: Write failing tests:

```ts
expect(num("1,234.50")).toBe(1234.5);
expect(num("₹40.00")).toBe(40);
expect(num("(1,234)")).toBe(-1234);
expect(num("500 CR")).toBe(-500);
expect(num("500 Dr")).toBe(500);
expect(num("abc")).toBe(0);
expect(num(NaN)).toBe(0);
const f = makeFormat({ currency: "₹", style: "indian" });
expect(f.whole(156729)).toBe("₹1,56,729");
expect(f.exact(-40)).toBe("-₹40.00");
expect(f.short(156729)).toBe("₹1.57L");
expect(f.short(25000000)).toBe("₹2.50Cr");
expect(f.short(1500)).toBe("₹1.5k");
expect(f.pct(1, 0)).toBe("n/a");
const g = makeFormat({ currency: "$", style: "international" });
expect(g.whole(156729)).toBe("$156,729");
expect(g.short(2500000)).toBe("$2.50M");
```

- [ ] Step 2: Run `npx vitest run tests/amount.test.ts tests/format.test.ts`. Expected: FAIL, module not found.
- [ ] Step 3: Implement. Indian style uses `en-IN` grouping and L/Cr; international uses `en-US` grouping and k/M/B.
- [ ] Step 4: Run again. Expected: PASS.
- [ ] Step 5: Commit `feat: amount parsing and money formatting`.

### Task 3: Tables, inbox, month notes, summaries, merchants, locations

**Files:**
- Create: `src/parse/table.ts`, `src/parse/inbox.ts`, `src/parse/month.ts`, `src/parse/summary.ts`, `src/parse/merchant.ts`, `src/parse/location.ts`, `src/parse/types.ts`, `src/parse/markers.ts`
- Test: `tests/inbox.test.ts`, `tests/month.test.ts`, `tests/summary.test.ts`, `tests/merchant.test.ts`, `tests/location.test.ts`

**Interfaces:**
- Produces:
  - `markers.ts`: `INBOX_MARK`, `TXN_START`, `TXN_END`, `ACCT_START`, `ACCT_END`, `MONTH_FMT`, `DATE_FMTS`
  - `splitCells(line: string): string[]`, `isSeparator(cell: string): boolean`
  - `hasInboxTable(text: string): boolean`
  - `interface InboxRow { when; date; key; amount; direction; merchant; category; account; method; ref; raw; location; description; srcLine; srcIndex; catCol?; descCol?; merCol? }`
  - `parseInbox(text: string): InboxRow[]` (port of `Money Dashboard.md:317-361`)
  - `interface Txn { date; desc; merchant; category; description; card; type; amount; note; location; src?: InboxRow }`
  - `inboxToTxn(r: InboxRow): Txn` (port of `:413-427`)
  - `parseMonthTxns(text: string): Txn[] | null` (port of `:204-244`)
  - `interface Categories { income: string; transfer: string; investments: string }`
  - `summarise(txns: Txn[], c: Categories): Summary` (port of `:252-285`)
  - `fromFrontmatter(money: Record<string, unknown>): Summary` (port of `:288-306`)
  - `applyCanonicalMerchants(items: { merchant: string }[]): Map<string,string>` (port of `:163-194`)
  - `locParts(cell): { label; url } | null`, `parseLoc(cell): { lat: number|null; lng: number|null; label } | null`

- [ ] Step 1: Write failing tests, including:

```ts
const inbox = [
  "# Expenses", INBOX_MARK, "",
  "| When | Amount | Direction | Merchant | Category | Account | Method | Ref | Location | Raw |",
  "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  "| 2026-08-15 14:32 | 40.00 | debit | CORNER PHARMACY | Health & Medical | Card A | credit_card | 111 | [, Pune, MH](https://maps.apple.com/?ll=18.5,73.8) | Rs 40 debited |",
  "| 2026-08-16 | 500.00 | credit | ACME | Income | Bank A | neft | 222 | | salary |",
  "| not a date | 1 | debit | X | | Bank A | upi | 333 | | x |",
].join("\n");
const rows = parseInbox(inbox);
expect(rows).toHaveLength(2);
expect(rows[0].raw).toBe("Rs 40 debited");            // Review Focus 1: Location before Raw
expect(rows[0].srcIndex).toBe(5);
expect(inboxToTxn(rows[1]).amount).toBe(-500);
expect(hasInboxTable(`const x = "${INBOX_MARK}";`)).toBe(false);
```

```ts
// header-less inbox falls back to the legacy nine columns
const legacy = `${INBOX_MARK}\n| 2026-08-15 | 10 | debit | M | Groceries | A | upi | 1 | raw |`;
expect(parseInbox(legacy)[0].raw).toBe("raw");
```

```ts
const s = summarise([
  t({ category: "Groceries", amount: 100 }), t({ category: "Groceries", amount: -20 }),
  t({ category: "Income", amount: -1000 }), t({ category: "Transfer", amount: 300 }),
  t({ category: "Investments", amount: 200 }),
], CATS);
expect(s.net).toBe(80); expect(s.spend).toBe(100); expect(s.refunds).toBe(20);
expect(s.income).toBe(1000); expect(s.transfers).toBe(300); expect(s.invested).toBe(200);
```

```ts
const items = [{ merchant: "ZOMATO" }, { merchant: "zomato" }, { merchant: "Zomato" }, { merchant: "zomato" }];
applyCanonicalMerchants(items);
expect(items.map((i) => i.merchant)).toEqual(["Zomato", "Zomato", "Zomato", "Zomato"]);
expect(parseLoc("[Sample Place](https://maps.apple.com/?ll=12.97,77.59)")).toEqual({ lat: 12.97, lng: 77.59, label: "Sample Place" });
expect(locParts("[, Pune, MH](https://x)")).toEqual({ label: "Pune, MH", url: "https://x" });
```

- [ ] Step 2: Run the tests. Expected: FAIL.
- [ ] Step 3: Port the functions. Replace `window.moment` with `moment` imported from `obsidian`.
- [ ] Step 4: Run the tests. Expected: PASS.
- [ ] Step 5: Commit `feat: parse inbox, month notes and summaries`.

### Task 4: Accounts and billing cycles

**Files:**
- Create: `src/parse/accounts.ts`
- Test: `tests/accounts.test.ts`

**Interfaces:**
- Produces:
  - `interface Account { name; statementDay: number|null; dueDay: number|null; limit: number|null; note }`
  - `parseAccounts(text: string): Account[]` (port of `Money Accounts.md:164-178`)
  - `interface Cycle { start: Moment; end: Moment; statement: Moment; label: string; calendar: boolean }`
  - `cycleFor(acct: Account, offset: number, now: Moment): Cycle` (port of `:320-333`, with `now` passed in)
  - `dueFor(acct: Account, cycle: Cycle): Moment | null`
  - `inCycle(t: { moment: Moment }, c: Cycle): boolean`

- [ ] Step 1: Write failing tests:

```ts
const a = { name: "Card", statementDay: 18, dueDay: 7, limit: null, note: "" };
const c = cycleFor(a, 0, moment("2026-08-20"));
expect(c.start.format("YYYY-MM-DD")).toBe("2026-08-19");
expect(c.end.format("YYYY-MM-DD")).toBe("2026-09-18");
expect(dueFor(a, c)!.format("YYYY-MM-DD")).toBe("2026-10-07");
// Review Focus 3: day 31 in February
const feb = cycleFor({ ...a, statementDay: 31 }, 0, moment("2026-02-10"));
expect(feb.end.format("YYYY-MM-DD")).toBe("2026-02-28");
// no statement day: calendar month
const cal = cycleFor({ ...a, statementDay: null }, -1, moment("2026-03-05"));
expect(cal.label).toBe("February 2026");
expect(parseAccounts(`${ACCT_START}\n| Account | Statement day | Due day | Credit limit | Notes |\n| --- | --- | --- | --- | --- |\n| Card | 18 | 7 | 100000 | |\n${ACCT_END}`)[0].limit).toBe(100000);
```

- [ ] Step 2: Run. Expected: FAIL.
- [ ] Step 3: Implement the port.
- [ ] Step 4: Run. Expected: PASS.
- [ ] Step 5: Commit `feat: billing cycles`.

### Task 5: Cell edit

**Files:**
- Create: `src/write/cell.ts`
- Test: `tests/cell.test.ts`

**Interfaces:**
- Produces:
  - `type EditResult = { ok: true; text: string } | { ok: false; why: string }`
  - `replaceCell(text: string, row: { srcLine: string; srcIndex: number }, cellIndex: number, value: string): EditResult` (pure port of `Money Dashboard.md:366-401`)
  - `cleanFreeText(v: string): string` replaces `|` with `/` and trims

- [ ] Step 1: Write failing tests:

```ts
const text = "x\n| a | b    | c |\n| a | b    | c |";
// Review Focus 2: duplicate rows, remembered index still valid
const r1 = replaceCell(text, { srcLine: "| a | b    | c |", srcIndex: 2 }, 1, "Z");
expect(r1).toEqual({ ok: true, text: "x\n| a | b    | c |\n| a | Z    | c |" });
// Row moved and the text is no longer unique: refuse
const r2 = replaceCell(text, { srcLine: "| a | b    | c |", srcIndex: 0 }, 1, "Z");
expect(r2.ok).toBe(false);
// Row gone: refuse
expect(replaceCell(text, { srcLine: "| q |", srcIndex: 1 }, 0, "Z").ok).toBe(false);
// Longer value grows the cell
expect((replaceCell("| a | b |", { srcLine: "| a | b |", srcIndex: 0 }, 1, "long") as any).text).toBe("| a | long |");
expect(cleanFreeText(" a|b ")).toBe("a/b");
```

- [ ] Step 2: Run. Expected: FAIL.
- [ ] Step 3: Implement.
- [ ] Step 4: Run. Expected: PASS.
- [ ] Step 5: Commit `feat: pure inbox cell edit`.

### Task 6: Vault loading and the transaction pool

**Files:**
- Create: `src/vault/types.ts`, `src/vault/load.ts`
- Test: `tests/load.test.ts`

**Interfaces:**
- Consumes: Task 3 and Task 4 functions.
- Produces:
  - `interface FileLike { path: string; basename: string }`
  - `interface VaultLike { files(): FileLike[]; read(f: FileLike): Promise<string>; frontmatter(f: FileLike): Record<string, unknown> | null }`
  - `findInbox(v: VaultLike): Promise<{ file: FileLike; text: string } | null>`
  - `findAccounts(v: VaultLike): Promise<{ file: FileLike; accounts: Account[] } | null>`
  - `interface MonthData extends Summary { key; label; short; moment; file: FileLike|null; status; sources: string[]; updated; drift; fromInbox?: boolean; rows?: InboxRow[]; tableless?: boolean }`
  - `loadMonths(v: VaultLike, c: Categories, now: Moment): Promise<{ months: MonthData[]; overlaps: Overlap[]; inbox: FileLike|null }>` (port of `Money Dashboard.md:429-537`)
  - `loadPool(v: VaultLike, now: Moment): Promise<PoolTxn[]>` (port of `Money Accounts.md:271-304`)

- [ ] Step 1: Write failing tests with a fake vault whose paths differ from the author's vault (`a/b/Expenses.md`, `z/2026 - 07-July.md`, `z/2026 - 08-August.md`):

```ts
// Review Focus 4: August in both. now = 2026-08-20, so the inbox wins for August.
const res = await loadMonths(fake, CATS, moment("2026-08-20"));
expect(res.months.map((m) => m.key)).toEqual(["2026-07", "2026-08"]);
expect(res.months[1].fromInbox).toBe(true);
expect(res.overlaps).toEqual([{ key: "2026-08", label: "August 2026", winner: "inbox" }]);
// now = 2026-09-02: August is past, so the archive wins and the inbox rows are ignored.
const later = await loadMonths(fake, CATS, moment("2026-09-02"));
expect(later.months.find((m) => m.key === "2026-08")!.fromInbox).toBeFalsy();
```

- [ ] Step 2: Run. Expected: FAIL.
- [ ] Step 3: Implement.
- [ ] Step 4: Run. Expected: PASS.
- [ ] Step 5: Commit `feat: load months and the account pool`.

### Task 7: Settings, plugin wiring, setup command

**Files:**
- Create: `src/settings.ts`, `src/setup.ts`, `src/vault/obsidian.ts` (the real `VaultLike` over `App`)
- Modify: `src/main.ts`
- Test: `tests/setup.test.ts`

**Interfaces:**
- Produces:
  - `interface MoneySettings { currency: string; numberStyle: "indian"|"international"; categories: string[]; incomeCategory: string; transferCategory: string; investmentsCategory: string; pageSize: number; trendMonths: number; mapTiles: boolean; tileUrl: string }`
  - `DEFAULT_SETTINGS: MoneySettings`
  - `planSetup(folder: string, existing: Set<string>, now: Moment): { path: string; content: string }[]` returns only files that do not exist yet.
  - `main.ts` registers `money-dashboard`, `money-accounts`, `money-map` processors, the settings tab, the command `set-up-money-notes`, and a one-time notice when `dataview` is not enabled.

- [ ] Step 1: Write failing tests:

```ts
const all = planSetup("Money", new Set(), moment("2026-08-20"));
expect(all.map((f) => f.path)).toContain("Money/Expenses.md");
// Review Focus 5: never overwrite
const again = planSetup("Money", new Set(all.map((f) => f.path)), moment("2026-08-20"));
expect(again).toEqual([]);
expect(parseInbox(all.find((f) => f.path.endsWith("Expenses.md"))!.content).length).toBeGreaterThan(0);
```

- [ ] Step 2: Run. Expected: FAIL.
- [ ] Step 3: Implement.
- [ ] Step 4: Run tests and `npm run build`. Expected: PASS, build succeeds.
- [ ] Step 5: Commit `feat: settings, setup command and wiring`.

### Task 8: Renderers and styles

**Files:**
- Create: `src/render/common.ts`, `src/render/dashboard.ts`, `src/render/accounts.ts`, `src/render/map.ts`, `styles.css`

**Interfaces:**
- Consumes: everything above.
- Produces: `renderDashboard(ctx: RenderCtx, el: HTMLElement): Promise<void>`, `renderAccounts(...)`, `renderMap(...)` where `RenderCtx = { app: App; settings: MoneySettings; component: Component }`.

- [ ] Step 1: Port the render sections of the three notes (`Money Dashboard.md:541-1098`, `Money Accounts.md:306-564`, `Money Map.md:164-711`). Replace `dv.container` with `el`, `app.vault.modify` with `app.vault.process`, `el.style.x = ...` with `el.style.setProperty("--md-...")` or a class. Register the map's `ResizeObserver` and listeners for clean-up on `component.register`.
- [ ] Step 2: Build `styles.css` from `money-dashboard.css` plus the stat-card rules from Plainpage REGION 19. Replace `--nt-*` with `--md-*` tokens defined on `.money-dashboard` that fall back to `--nt-*`, then to core Obsidian variables.
- [ ] Step 3: `npm run build`. Expected: success. Then load it in a test vault with the sample notes from Task 7 and check all three pages on desktop.
- [ ] Step 4: Commit `feat: render the three pages`.

### Task 9: Docs, privacy test, release workflow

**Files:**
- Create: `README.md`, `docs/data-format.md`, `docs/shortcut-prompt.md`, `tests/privacy.test.ts`, `.github/workflows/release.yml`

- [ ] Step 1: Write `tests/privacy.test.ts`. It reads `privacy-denylist.txt` when present (git-ignored), and fails on any case-insensitive match in tracked source, docs and tests. It always checks for the em-dash character.
- [ ] Step 2: Write the README with the sections in the spec, including `## Requirements` naming Dataview and `[Get the Apple Shortcut](APPLE_SHORTCUT_LINK)`.
- [ ] Step 3: Run `npm test`. Expected: PASS.
- [ ] Step 4: Commit `docs: readme, data format, shortcut prompt and release workflow`.
