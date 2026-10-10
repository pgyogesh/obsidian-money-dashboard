# Money Dashboard

Money Dashboard turns a plain markdown table of transactions into three pages inside Obsidian:

| Page | Code block | What it shows |
| --- | --- | --- |
| Money Dashboard | `money-dashboard` | Net spend for a month, a trend, spend by category, card and method, top merchants, and a filterable transaction table |
| Money Accounts | `money-accounts` | Spend per card on the card's own billing cycle, with the statement date, due date and credit limit used |
| Money Map | `money-map` | A heatmap of where the money went, weighted by amount |

Everything is read from notes in your vault. Nothing is sent anywhere, except map tile requests on the Money Map page (see [Network use](#network-use)).

## Requirements

- **[Dataview](https://github.com/blacksmithgu/obsidian-dataview) is required.** Install and enable it from **Settings → Community plugins** before you use Money Dashboard. Money Dashboard shows a notice once if Dataview is not enabled.
- Obsidian 1.4.4 or later, on desktop or mobile.

## Set up

1. Install and enable Money Dashboard and Dataview.
2. Open the command palette and run **Money Dashboard: Set up money notes with sample data**.
3. The command creates these notes in the `Money` folder (you can change the folder in the plugin settings), then opens Money Dashboard:

| Note | Purpose |
| --- | --- |
| `Expenses.md` | The inbox: one row per transaction for the current month |
| `Money Accounts Config.md` | Billing cycle settings, one row per account |
| `Money Dashboard.md`, `Money Accounts.md`, `Money Map.md` | The three pages |
| `YYYY - MM-MMMM.md` | A sample archived month (sample data only) |

The command never overwrites a note that already exists. To start without sample rows, run **Money Dashboard: Set up money notes** instead.

You can also put any of the three code blocks in a note of your own:

````markdown
```money-dashboard
```
````

## How the data works

The short version is below. The full format is in [docs/data-format.md](docs/data-format.md).

- **The inbox holds the current month.** It is the note with `%% money:inbox:start %%` followed by a table. New rows go at the end of the file.
- **Each earlier month has its own note**, named like `2026 - 07-July`, with its table between `%% money:txns:start %%` and `%% money:txns:end %%`. Any folder works: notes are found by marker and by name, never by path.
- **Positive is money out, negative is money in.** In the inbox, the `Direction` column (`debit` or `credit`) carries the sign.
- **Income, Transfer and Investments are not spend.** Their names are set in the plugin settings.
- **Columns are read by header name**, so you can add or reorder columns.

When a month is in both the inbox and a month note, it is never counted twice. The inbox wins for the current month, and the month note wins for a past month. The page tells you when this happens.

### Editing from the dashboard

While a month is still in the inbox, you can set **Category** from a dropdown, and click **Merchant** or **Description** to edit it. The change is written straight into the inbox row. The write reads the file again first, so a row added in the meantime is never lost. To delete a row, press 🗑 at the end of it and confirm. The row is removed from the inbox and kept in `.archive-backups/Deleted rows.md` next to the inbox, so it can be pasted back under the inbox marker. Rows of archived months are read-only on the page, and have no delete button.

## Capture from SMS on iPhone

Two Apple Shortcuts turn a bank SMS into an inbox row. A language model reads the message and writes the row, so you do not type anything.

| Shortcut | What it does | Link |
| --- | --- | --- |
| Log Transaction | Runs from an automation when a bank SMS arrives | [Get Log Transaction](https://www.icloud.com/shortcuts/79baf4ed0a5743e7b50a9dbcae2be478) |
| Log Transaction from Share Sheet | Share an SMS to it by hand, for a message the automation missed | [Get Log Transaction from Share Sheet](https://www.icloud.com/shortcuts/24aa567d6f2b43e5a9a9e18415486e7f) |

### What you need

- An iPhone with Apple Intelligence. **Log Transaction** uses the Apple Intelligence model.
- **Log Transaction from Share Sheet** uses the ChatGPT extension of Apple Intelligence. Turn it on in **Settings → Apple Intelligence & Siri → ChatGPT**, or change the model in the shortcut's **Use Model** action.
- Your vault in iCloud Drive, so the phone can write to the inbox.

### Set up the shortcuts

1. Open each link and add the shortcut.
2. Copy the prompt from [docs/shortcut-prompt.md](docs/shortcut-prompt.md) into a note in your vault, for example `ExpensePrompt.md`. Replace every `<...>` placeholder with your own name, accounts and merchant spellings.
3. In each shortcut, point the two file actions at your own files:
   - **Get File**: your prompt note, `ExpensePrompt.md`.
   - **Append to Text File**: your inbox, `Expenses.md`.

   The shared shortcuts still point at the author's folder, so this step is needed.
4. In **Append to Text File**, check that **Make New Line** is **on**. When it is off, two rows can join onto one line and both are lost.
5. In **Log Transaction**, the first **Use Model** action asks whether the message is a transaction. It also names a mobile operator whose messages should be ignored. Change that name to your own operator, or remove it.

### Create the automations

**Log Transaction** runs from Personal Automations in the Shortcuts app. Create one automation for each word your bank uses in its SMS:

1. Open **Shortcuts → Automation**, and tap **+**.
2. Choose **Message**. Under **Message Contains**, enter the word, for example `debited`.
3. Choose **Run Immediately**, so the shortcut runs without asking.
4. Tap **Next**, and choose **Log Transaction**.

Repeat for each word:

| Message contains | Catches |
| --- | --- |
| `debited` | Money out |
| `credited` | Money in, and card refunds |
| `deposited` | Money in, from banks that say "deposited" |

Add a word for any other phrase your bank uses, for example `spent` or `withdrawn`.

When an automation misses a message, open the SMS, share it, and choose **Log Transaction from Share Sheet**.

### Settings in the shortcut that matter

| Setting | Value | Why |
| --- | --- | --- |
| Append to Text File, **Make New Line** | On | Off lets two rows join onto one line, and both are lost |
| The `If` condition | `Response` **is** `Yes` | A bare `If Response` also passes a `No` |
| Format Date | `yyyy-MM-dd HH:mm` | This is the `When` value |

## Adding an expense by hand

Run **Money Dashboard: Add expense**, or press **＋** in the Money Dashboard header. Fill in the form and press **Add** (or Cmd/Ctrl+Enter).

- The row goes at the end of the inbox, in the column order of the inbox's own header.
- **When** starts at now. **Account** and **Method** start at what you used last.
- Leave **Ref** empty and the plugin fills in `MANUAL-YYYYMMDDHHmmssSSS`, so two real purchases that look alike are never merged as duplicates.
- If the date falls in a month that is already archived, the form warns you: the row counts after you archive again.

## Archiving completed months

The inbox holds the current month. When a month ends, move it into its own note:

1. Run **Money Dashboard: Archive completed months**, or press **Archive…** on the dashboard's "has ended but is still in the inbox" banner.
2. Read the preview. For each month it shows the note it will write, the rows it moves, the duplicates it drops, and the totals.
3. Press **Archive**.

What archiving does, in this order:

1. Backs up the inbox to `.archive-backups/` next to it. Obsidian does not index that folder.
2. Reads the inbox again, so a row added while the preview was open is included.
3. For each completed month, merges the rows into its month note. A note named like `2026 - 08-August` is used wherever it is. If there is none, one is created in the **Month notes folder** from the settings. Duplicates are dropped (by `Ref`, or by date, amount and merchant), merchant spellings are unified, and the `money:` frontmatter totals are written.
4. Only then removes the archived rows from the inbox.

Only the table between the `txns` markers and the plugin's own keys under `money:` change. Anything else you wrote in a month note, its other frontmatter, and your own keys under `money:` (such as `currency`) are kept. A monthly note with no money section yet gets one appended.

Archiving refuses, and changes nothing, while a row in a completed month has no category. The preview lists those rows. Rows from the current month, and rows dated in the future, stay in the inbox.

## Network use

The Money Map page downloads map tiles from `tile.openstreetmap.org`. Your transactions are never sent, but each tile request names a zoom level and a map square, so the tile server can see which areas you look at, and those are the areas where you spend. You can turn tiles off, or point them at another tile server, in the plugin settings. Map data © OpenStreetMap contributors. Please respect the [OpenStreetMap tile usage policy](https://operations.osmfoundation.org/policies/tiles/).

The plugin makes no other network requests and collects no telemetry.

## Settings

| Setting | Default |
| --- | --- |
| Currency symbol | `₹` |
| Number format | Indian (1,56,729; L and Cr). International is 156,729; k, M and B |
| Category list | 24 categories, one per line |
| Income, Transfer and Investments categories | `Income`, `Transfer`, `Investments` |
| Monthly spending budgets | No limits configured |
| Rows before "Show all" | 40 |
| Months on the trend chart | 12 |
| Load map tiles | On |
| Tile URL | `https://tile.openstreetmap.org/{z}/{x}/{y}.png` |
| Folder for new notes | `Money` |
| Month notes folder | `Money/Months` |
| One subfolder per year | On |

Set a recurring monthly limit for each spending category under **Settings → Money Dashboard → Monthly spending budgets**. Enter an amount in your configured currency, without currency symbols or separators. Leave it blank to remove the limit; `0` means no spending is budgeted. Income, transfers and investments are excluded.

The dashboard compares each budget with the selected month's net category spending (after refunds) in a horizontal bar graph. Spending and budget bars share one amount scale; overspending is highlighted and the amount left or over budget is labelled. Refunds exceeding spending draw to the left of zero, and categories with no spending show zero. The current limits apply to every month you view; changing a limit also changes comparisons for past months. Budgets use category names, and a saved category stays in the budget settings if you remove it from the category picker, so you can still edit or clear its limit.

## Development

```bash
npm install
npm test        # vitest
npm run lint    # the rules the Obsidian plugin review runs
npm run build   # writes main.js
```

To try it in a vault, copy `main.js`, `manifest.json` and `styles.css` into `<vault>/.obsidian/plugins/money-dashboard/` and enable the plugin.

## Licence

MIT. See [LICENSE](LICENSE).
