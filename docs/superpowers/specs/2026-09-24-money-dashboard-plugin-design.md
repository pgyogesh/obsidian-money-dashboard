# Money Dashboard plugin: design

Status: **draft, waiting for review.** Date: 2026-09-24.

## TL;DR

- Turn the three `dataviewjs` pages in the author's vault (Money Dashboard, Money Accounts, Money Map) into one Obsidian community plugin.
- The plugin draws each page from a code block: `money-dashboard`, `money-accounts`, `money-map`.
- The data format in the vault does not change, so the existing vault keeps working.
- The README lists Dataview as a requirement and has a placeholder link for the Apple Shortcut.
- No personal data goes into the repository. A test enforces this.

## Goal

Publish the Money Dashboard as a free community plugin that another Obsidian user can install, point at their own inbox, and use without the author's vault, theme or scripts.

Success means:

1. The plugin renders the same three pages from the same notes that the `dataviewjs` blocks read today.
2. A new user can run one command, get working sample notes, and see a filled dashboard.
3. The repository passes the Obsidian community plugin review.
4. A search of the repository finds none of the author's personal data.

## What the user asked for, and what is assumed

| Item | Source |
| --- | --- |
| A real Obsidian plugin | Asked |
| Dataview listed as a requirement | Asked |
| A placeholder link for the Apple Shortcut | Asked |
| Code blocks as the way to show a page | Assumed (recommended option, no answer received) |
| Free community plugin, MIT licence | Assumed |
| All three pages in v1 | Assumed |
| Archiving stays outside the plugin in v1 | Assumed |

## Current state

| Piece | Location in the author's vault | Size |
| --- | --- | --- |
| Money Dashboard | `Money Dashboard.md` | 1099 lines |
| Money Map | `Money Map.md` | 719 lines |
| Money Accounts | `Money Accounts.md` | 565 lines |
| Styles | `.obsidian/snippets/money-dashboard.css` | 1240 lines |
| Format contract | `Money Dashboard Spec.md` | 912 lines |
| Archiving | an external Raycast script | outside the vault |
| SMS capture | Apple Shortcut, reading `ExpensePrompt.md` | outside the vault |

The three blocks call Dataview only once each, for `dv.container`. Everything else uses the Obsidian API: `app.vault`, `app.metadataCache` and `app.workspace`.

## Design

### Plugin identity

| Field | Value |
| --- | --- |
| `id` | `money-dashboard` |
| `name` | Money Dashboard |
| `isDesktopOnly` | `false` (the pages already work on a phone) |
| `minAppVersion` | `1.4.0` (to confirm when the scaffold is built) |

Neither field contains the word "Obsidian", which the review does not allow.

### How a page is shown

The plugin registers three code block processors with `registerMarkdownCodeBlockProcessor`:

````markdown
```money-dashboard
```
````

The same pattern works for `money-accounts` and `money-map`. The block body is empty in v1. Each processor receives a container element, which replaces `dv.container`.

The existing notes keep their `cssclasses` (`money-dashboard`, `money-accounts`, `money-map`), so the layout rules that depend on them still apply.

### Dataview

As asked, the README lists Dataview as **required**. On load, the plugin checks that the `dataview` plugin is enabled. If it is not, the plugin shows a notice once.

Open point: after the port, the plugin does not call Dataview. The only Dataview code left in the user's notes is the category palette block in `Expenses.md`. See [Open questions](#open-questions).

### Data format

Unchanged from `Money Dashboard Spec.md`. The plugin finds every file by its marker or its filename, never by a path.

| What | How the plugin finds it |
| --- | --- |
| Current month (inbox) | The note that has `%% money:inbox:start %%` followed by a table |
| Earlier months | Notes named `YYYY - MM-MMMM`, table between `%% money:txns:start %%` and `%% money:txns:end %%` |
| Account billing cycles | The note with a table between `%% money:accounts:start %%` and `%% money:accounts:end %%` |

The sign convention stays the same: positive is money out and negative is money in. The inbox keeps its nine columns: `When`, `Amount`, `Direction`, `Merchant`, `Category`, `Account`, `Method`, `Ref`, `Raw`. Columns are read by name, not by position.

### Settings

These replace constants that are hard-coded today.

| Setting | Replaces | Default |
| --- | --- | --- |
| Currency symbol | `CUR` | `₹` |
| Number format | `inr`, `shortInr` | Indian (lakh, crore). The other option is international (k, M). |
| Categories | `CATEGORIES` | The 24 categories in use today |
| Income category | `INCOME_CAT` | `Income` |
| Transfer category | `XFER_CAT` | `Transfer` |
| Investments category | `INVEST_CAT` | `Investments` |
| Rows before "Show all" | `PAGE_SIZE` | `40` |
| Months on the trend | `TREND_LEN` | `12` |
| Map tiles | the tile URL in Money Map | On, `https://tile.openstreetmap.org/{z}/{x}/{y}.png` |

Accounts are not a setting. They stay in the accounts config note, because the user edits that note today and a second copy would drift.

### Code layout

```
src/
  main.ts            plugin class, code block registration, settings, command
  settings.ts        settings tab and defaults
  parse/             pure functions, no Obsidian imports
    amount.ts        num(), sign rules, CR/DR, brackets
    table.ts         markdown table to rows, by column name
    inbox.ts         inbox rows to transactions
    month.ts         month note rows and frontmatter rollups
    accounts.ts      accounts config and billing cycle windows
    merchant.ts      canonical merchant names
    format.ts        currency and number formatting
  vault/
    locate.ts        find inbox, months and config by marker and filename
    load.ts          read files, build one transaction pool
  write/
    cell.ts          replace one cell in the inbox with vault.process
  render/
    dashboard.ts
    accounts.ts
    map.ts
styles.css
tests/
  fixtures/          sample vault, fake data only
```

Each file under `parse/` has one job and no Obsidian dependency, so vitest can test it directly.

### Editing cells

The dashboard edits `Category`, `Merchant` and `Description` in the inbox today. The plugin keeps the current rules from `Money Dashboard Spec.md`:

- Re-read the file just before writing.
- Find the row by line number, check that the line still matches, and fall back to an exact-text search. Refuse when that search is ambiguous.
- Replace one cell and keep the column padding.
- Replace a typed `|` with `/`.
- Seed the input from the file value, not the display value.
- Archived rows stay read-only.

The one change: `app.vault.modify` becomes `app.vault.process`, which the plugin guidelines prefer because it reads and writes in one step.

### Styles

`styles.css` comes from `money-dashboard.css`. Two changes:

1. Every `--nt-*` token gets a fallback to a core Obsidian variable, so the plugin works under any theme. This closes the TODO at the top of the snippet.
2. The 22 inline `.style.x =` assignments in the three blocks become classes.

### Setup command

**Money Dashboard: Set up money notes** creates, in a folder the user picks:

- `Expenses.md` with the inbox marker and the header row
- `Money Accounts Config.md` with the accounts marker and one example row
- `Money Dashboard.md`, `Money Accounts.md` and `Money Map.md`, each holding its code block

It never overwrites an existing file. It can also create a small sample month, so the user sees a filled dashboard immediately.

### README

The README must have these sections:

1. What it does, with screenshots made from sample data.
2. **Requirements:** Dataview (required, as asked).
3. Setup: the command above.
4. Data format: a short version of the contract, with a link to `docs/data-format.md`.
5. **Capture from SMS on iPhone:** `[Get the Apple Shortcut](APPLE_SHORTCUT_LINK)`, a placeholder for the author to replace, plus a link to `docs/shortcut-prompt.md`.
6. Archiving a month: explains that v1 does not archive, and describes the month note format so a user can archive by hand or with a script.
7. **Network use:** Money Map loads map tiles from OpenStreetMap, and a setting turns this off. OpenStreetMap attribution is shown on the map.
8. Licence.

`docs/shortcut-prompt.md` is a cleaned copy of `ExpensePrompt.md`. It has no name, account numbers, card digits or places.

### Privacy

The `money-pack-build` README records what the 2026-08-23 build found in the spec: the author's full name, an account number fragment, GPS coordinates and a home town, a private person's name, named toll plazas, and real banks, merchants and figures.

So:

- Fixtures and screenshots use invented data only.
- `tests/privacy.test.ts` scans every tracked file for a deny-list, and fails on any match. The deny-list lives in a local file, `privacy-denylist.txt`, which is git-ignored so the terms themselves are never committed.

### Out of scope for v1

- Archiving a month. The Raycast script keeps doing this.
- Budgets per category.
- A dedicated view or ribbon icon.
- Any change to the data format.

### Testing

| Layer | How |
| --- | --- |
| `parse/` | vitest unit tests, including the tricky cases from the spec (CR/DR, brackets, `₹`, commas, missing time, blank category) |
| `vault/locate` | vitest with a fake file list whose layout differs from the author's vault, which proves that the code does not depend on paths (the job `layout.js` did before) |
| `write/cell` | vitest on the pure string edit: padding, pipe replacement, moved row, ambiguous row |
| Render | manual check in a test vault, on desktop and on a phone |
| Privacy | `tests/privacy.test.ts` |

### Build and release

- Built from the official sample plugin template: TypeScript and esbuild.
- `npm run build` writes `main.js`.
- A GitHub Action attaches `main.js`, `manifest.json` and `styles.css` to each tagged release.
- Submission is a pull request to `obsidianmd/obsidian-releases`. Check the current review rules at that time, because this spec lists them from memory.

## Open questions

1. **Dataview.** It is listed as required, as asked, but the plugin does not call it. Options: keep it required, change it to recommended, or skip the port and ship the `dataviewjs` blocks. The review may question a hard requirement that the code never uses.
2. **Free or paid.** `money-pack-build` was built to sell a pack. A community plugin is public MIT code. Confirm the licence before the first release.
3. **Plugin form.** Code blocks are assumed. Dedicated views could be added later.
