# Data format

Money Dashboard reads two kinds of table and one config table. Every note is found by its marker or its name, never by its folder.

## The inbox

The inbox is the note that has this line followed by a table:

```text
%% money:inbox:start %%
```

The table runs from the marker to the end of the file. There is no closing marker, because a plain "append to file" action cannot write above one. Nothing but table rows may go below the marker.

```markdown
| When | Amount | Direction | Merchant | Category | Account | Method | Ref | Location | Description | Raw |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-08-15 14:32 | 40.00 | debit | Corner Pharmacy | Health & Medical | Travel Card | credit_card | 519123456789 | | | Rs 40.00 debited from card xx0000 |
```

| Column | Rule |
| --- | --- |
| `When` | `YYYY-MM-DD HH:mm`, or `YYYY-MM-DD` when there is no time. A row without a valid date is skipped. |
| `Amount` | A plain positive number. No currency symbol and no commas. |
| `Direction` | `debit` for money out, `credit` for money in. |
| `Merchant` | The other party. |
| `Category` | One of the categories in the settings, or empty. An empty category still counts, as `Uncategorised`, and the dashboard lists it for you to fill in. |
| `Account` | A name from the accounts config. |
| `Method` | `upi`, `credit_card`, `debit_card`, `neft`, `imps`, `netbanking`, `atm`, `fastag` or `cash`. |
| `Ref` | The bank reference. It tells a repeat payment from a duplicate. |
| `Location` | Optional. A Maps link such as `[Place](https://maps.apple.com/?ll=12.97,77.60)`, or bare `lat, lng`. Money Map needs the coordinates. |
| `Description` | Optional. What the money was for, in your own words. `-` means "nothing worth noting". |
| `Raw` | Optional. The original message, with every `\|` replaced by `/`. |

Columns are read by header name, so the order does not matter and extra columns are ignored. A table with no header row is read in the legacy order `When, Amount, Direction, Merchant, Category, Account, Method, Ref, Raw`.

## Month notes

An earlier month lives in a note named in the Periodic Notes monthly format, `YYYY - MM-MMMM`, for example `2026 - 07-July`. Its table sits between two markers:

```markdown
%% money:txns:start %%

| Date | Merchant | Description | Category | Card | Type | Amount | Ref | Location | Raw |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-02 10:00 | City Cafe | lunch | Dining & Delivery | Travel Card | credit_card | 420.00 | 519123456789 | | |

%% money:txns:end %%
```

The **Archive completed months** command writes exactly this layout, with the `Ref` column holding the bank reference. An older table may have a `Notes` column and no `Ref`. `Notes` is free text: it is shown with the description, and it is never used to find duplicates.

In a month note, `Amount` is signed: **positive is money out, negative is money in**. `Card` is the account and `Type` is the method.

### Frontmatter

A month note may carry a `money` block:

```yaml
money:
  status: final      # final, sample, or anything else you want shown as a badge
  spend: 12345.00    # checked against the table
  sources: [statement.pdf]
  updated: 2026-08-02
```

Every figure is computed from the table. When `spend` differs from the table by more than 1, the dashboard shows a "stale rollup" warning. A month with frontmatter totals but no table is shown from the totals (`spend`, `refunds`, `net_spend`, `income`, `invested`, `txn_count`, `by_category`, `by_card`, `by_type`), without merchants or a transaction list.

## Which source wins

| Case | Shown |
| --- | --- |
| Current month in the inbox and in a month note | The inbox |
| Past month in the inbox and in a month note | The month note. The inbox rows are leftovers |
| Past month only in the inbox | The inbox, marked **unarchived** |

The two are never added together.

## Accounts config

Money Accounts reads the note with a table between these markers:

```markdown
%% money:accounts:start %%

| Account | Statement day | Due day | Credit limit | Notes |
| --- | --- | --- | --- | --- |
| Everyday Bank | | | | savings, calendar month |
| Travel Card | 18 | 7 | 150000 | |

%% money:accounts:end %%
```

| Column | Rule |
| --- | --- |
| `Account` | Must match the `Account` value in the inbox exactly. |
| `Statement day` | Day of month the bill is generated, 1 to 31. Blank means the calendar month. A day past the end of a short month means the last day, so `31` is 28 or 29 in February. |
| `Due day` | Optional. |
| `Credit limit` | Optional. A plain number. It shows a usage bar. |
| `Notes` | Optional. `savings`, `wallet` or `calendar` stops the "no statement day" warning. |

A statement generated on day `D` covers the day after the previous statement through day `D`, inclusive.
