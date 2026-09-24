# Archive completed months, and add expenses by hand: design

Status: **draft, waiting for review.** Date: 2026-09-24.

This spec covers two features that both write into the money notes:

1. [Archive completed months](#goal), below.
2. [Add expenses by hand](#feature-2-add-expenses-by-hand), at the end.

## TL;DR

- Add a command, **Archive completed months**, that moves every completed month's rows out of the inbox into that month's note, the same way the author's external archive script does.
- A preview window shows what will happen. Nothing is written until the user presses **Archive**.
- The plugin writes only the table between the `txns` markers and the `money:` frontmatter block. Everything else in the month note is kept.
- The inbox is backed up first, and archived rows leave the inbox only after every month note is written.
- A second command, **Add expense**, opens a form and appends one row to the inbox.

## Goal

A user without the external script (for example on a phone, or without Raycast) can close a month from inside Obsidian and get the same result the script gives.

Success means:

1. After archiving, the dashboard shows each completed month from its month note, with the same totals it showed from the inbox.
2. Running the command twice changes nothing the second time.
3. A failure at any step leaves the inbox complete.
4. Text the user wrote in a month note, outside the markers, survives.

## Decisions

| Item | Decision | Source |
| --- | --- | --- |
| How archiving starts | A command, and an **Archive** button on the "unarchived" banner. Both open the preview. | User |
| Where a new month note goes | A **Month notes folder** setting, with a **One subfolder per year** toggle. An existing note with the right name is used wherever it is. | User |
| Blank category in a completed month | Blocks archiving, as in the script. | User (approved design) |
| Automatic archiving | Not in this version. | User |
| Periodic Notes integration | Not in this version. | User |

## Behaviour

### Which rows are archived

The inbox is read with `parseInbox`. With `now` as the current time:

| Row | What happens |
| --- | --- |
| Month before the current month | Archived |
| Current month | Stays in the inbox |
| Month after the current month | Stays, and the preview lists it as "dated in the future" |
| Date the parser cannot read | Stays, because `parseInbox` skips it. The preview counts these lines. |

### The preview

The preview is a modal with one section per completed month.

| Field | Meaning |
| --- | --- |
| Note | The path it will write, and whether the note is new or existing |
| Rows moved | Rows from the inbox |
| Total after merge | Existing rows plus moved rows, minus duplicates |
| Duplicates dropped | Rows removed by the duplicate check |
| Spellings unified | Merchant cells changed by merchant folding |
| Spend, refunds, net, income | From the merged rows |

The **Archive** button is disabled, and the preview says why, when:

- any row in a completed month has a blank `Category`. The preview lists each one by `When`, `Merchant` and `Amount`.
- for any month, `by_category`, `by_card` or `by_type` does not add up to net spend within 0.01.
- there is nothing to archive.

### Archiving, in order

1. **Back up the inbox** to `<inbox folder>/.archive-backups/Expenses-YYYYMMDD-HHmmss.md` through the vault adapter. Obsidian does not index a dot-folder, so the backup can never be found as the inbox.
2. **Plan again** from a fresh read of the inbox and the month notes, so rows the Shortcut appended while the preview was open are included in the check. If the fresh plan is blocked, stop and show why.
3. **For each month**, find the note by basename `YYYY - MM-MMMM` anywhere in the vault, or create it at `<Month notes folder>/[YYYY/]YYYY - MM-MMMM.md`.
   - Merge the existing rows (from `parseMonthTxns`) with the moved rows.
   - Drop duplicates. The key is `Ref` when a row has one, otherwise date, amount and merchant. The first row seen wins, and existing rows come first.
   - Fold merchant spellings across the whole merged month with `applyCanonicalMerchants`.
   - Sort by date, then merchant.
   - Replace the text between `%% money:txns:start %%` and `%% money:txns:end %%` with the new table. If the note has no markers, append a `## Money` section holding them.
   - Set the `money:` frontmatter block with `processFrontMatter`. Other frontmatter keys are left alone.
4. **Remove the archived rows from the inbox** in one `vault.process` call, by exact trimmed line text, and only when every month note was written.
5. **Show a notice** with the months archived, the rows moved, and the rows left in the inbox.

If a step fails, archiving stops, shows the error, and names the backup file.

### Month note table

```markdown
| Date | Merchant | Description | Category | Card | Type | Amount | Ref | Location | Raw |
| --- | --- | --- | --- | --- | --- | ---: | --- | --- | --- |
```

This matches the table the external script writes. `Amount` is signed and has two decimals: positive is money out.

Inbox columns map to month columns like this:

| Inbox | Month note |
| --- | --- |
| `When` (full timestamp) | `Date` |
| `Merchant` | `Merchant` |
| `Description` | `Description` |
| `Category` | `Category` |
| `Account` | `Card` |
| `Method` | `Type` |
| `Amount` with `Direction` | `Amount`, negative for a credit |
| `Ref` | `Ref` |
| `Location` | `Location` |
| `Raw` | `Raw` |

Every cell is written through `cleanFreeText`, so a stray `|` cannot add a column.

### `money:` frontmatter

```yaml
money:
  status: archived
  updated: YYYY-MM-DD
  sources:
    - "inbox, archived YYYY-MM-DD"
  income: 0.00
  invested: 0.00
  spend: 0.00
  refunds: 0.00
  net_spend: 0.00
  txn_count: 0
  by_category: { ... }
  by_card: { ... }
  by_type: { ... }
```

The figures come from `summarise`, so the note, the dashboard and the drift check all agree.

## Settings

| Setting | Default |
| --- | --- |
| Month notes folder | `Money/Months` |
| One subfolder per year | On |

## Code layout

| File | Job |
| --- | --- |
| `src/archive/plan.ts` | Pure. Groups rows by month, runs the checks, merges, drops duplicates, folds merchants, builds the table text and the `money:` object. No Obsidian imports apart from `moment`. |
| `src/archive/note.ts` | Pure. Puts a new table between the markers of an existing note's text, or appends the section. |
| `src/archive/run.ts` | The vault steps, in the order above. |
| `src/archive/modal.ts` | The preview. |

## Also in this change

- `parseMonthTxns` reads `Ref` as well as `Notes`, so searching an archived month finds its bank reference.

## Testing

| What | How |
| --- | --- |
| Row selection, blank-category block, future rows | vitest on `plan.ts` |
| Duplicate removal by Ref and by date, amount and merchant | vitest |
| Reconcile check | vitest, with a hand-built plan that does not reconcile |
| Replacing the table keeps text above and below the markers | vitest on `note.ts` |
| Round trip: a written table read back with `parseMonthTxns` gives the same `summarise` result | vitest |
| Running twice changes nothing | vitest: a second plan over the archived result is empty |
| The whole flow against a fake vault, including the inbox rows being removed last | jsdom test with the fake app |

## Out of scope

- Automatic archiving.
- Reading the Periodic Notes plugin's settings.
- Undo. The backup file is the way back.

---

## Feature 2: Add expenses by hand

### Goal

A user can record a cash payment, or any transaction the Shortcut missed, without editing the inbox table by hand.

Success means:

1. A saved row is read back by `parseInbox` with every field the user entered.
2. The row lands in the inbox's own column order, whatever that order is.
3. A row the Shortcut appends at the same moment is never lost.

### Decisions

| Item | Decision | Source |
| --- | --- | --- |
| Where a row goes | Always the inbox, whatever its date | User |
| Row in an already-archived month | Goes to the inbox. The form warns that it counts only after the next archive run, which merges it in. | User |
| `Ref` when left empty | `MANUAL-YYYYMMDDHHmmss`, so two genuine identical purchases are never merged as duplicates | User |

### Opening the form

- The command **Money Dashboard: Add expense**.
- A **＋** button in the Money Dashboard header, next to the month switcher.

### Fields

| Field | Input | Default |
| --- | --- | --- |
| When | Date and time | Now |
| Amount | Number, more than 0 | none |
| Direction | `debit` or `credit` | `debit` |
| Merchant | Text, suggesting merchants already used | none |
| Category | Dropdown from the category setting, or empty | empty |
| Account | Dropdown from the accounts config; free text when there is no config | The account used last |
| Method | `upi`, `credit_card`, `debit_card`, `neft`, `imps`, `netbanking`, `atm`, `fastag`, `cash` | The method used last |
| Description | Text | empty |
| Ref | Text | `MANUAL-YYYYMMDDHHmmss` of the save time, when left empty |
| Location | Text | empty |

"Used last" is kept in the plugin settings, so it survives a restart.

### Checks before saving

| Check | Result |
| --- | --- |
| `When` is a valid date | Required |
| `Amount` is a number more than 0 | Required |
| `Merchant` is not empty | Required |
| No inbox found | Refuse, and point to the setup command |
| The month already has a month note | Warn: "This month is archived. The row will count after you archive again." |
| The date is after now | Warn: "This date is in the future." |

A warning does not block saving.

### Saving

1. Find the inbox with `findInbox`.
2. Read the header row under the inbox marker. Build the row with one cell per header column, in the header's order. A column the form does not fill is left empty. A form field with no column in the header is dropped. With no header, use the legacy order `When, Amount, Direction, Merchant, Category, Account, Method, Ref, Raw`.
3. Write `When` as `YYYY-MM-DD HH:mm` and `Amount` as a plain number with two decimals. Put `manual entry` in `Raw` when the header has it. Pass every cell through `cleanFreeText`.
4. Append the row in one `vault.process` call, adding a line break first when the file does not end with one.
5. Show a notice. Open dashboards redraw through their normal file watch.

### Code layout

| File | Job |
| --- | --- |
| `src/entry/row.ts` | Pure. Validates the fields, and builds the row text from the header and the fields. |
| `src/entry/modal.ts` | The form. |

### Testing

| What | How |
| --- | --- |
| Row built in header order, including a reordered header and a legacy header-less table | vitest on `row.ts` |
| A built row read back by `parseInbox` gives the same fields | vitest |
| Validation messages | vitest |
| Generated Ref when empty | vitest |
| Append keeps a row added in the meantime, and adds a missing final line break | vitest on the append function |

### Also in this change

- The dashboard banner for leftover inbox rows in an archived month gets the **Archive** button too, because a manual row in an archived month produces that banner.
