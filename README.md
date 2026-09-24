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
- Obsidian 1.4.0 or later, on desktop or mobile.

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

While a month is still in the inbox, you can set **Category** from a dropdown, and click **Merchant** or **Description** to edit it. The change is written straight into the inbox row. The write reads the file again first, so a row added in the meantime is never lost. Rows of archived months are read-only on the page.

## Capture from SMS on iPhone

An Apple Shortcut can add a row to the inbox for every bank SMS, using a language model to turn the message into a row.

**[Get the Apple Shortcut](APPLE_SHORTCUT_LINK)**

The prompt the Shortcut uses is in [docs/shortcut-prompt.md](docs/shortcut-prompt.md). Copy it into a note in your vault, replace the placeholders with your own accounts, and point the Shortcut's **Get file** action at that note.

Settings in the Shortcut that matter:

| Setting | Value | Why |
| --- | --- | --- |
| Append to file, **Make New Line** | On | Off lets two rows join onto one line, and both are lost |
| The `If` condition | `Response` **is** `Yes` | A bare `If Response` also passes a `No` |
| Format Date | `yyyy-MM-dd HH:mm` | This is the `When` value |

## Archiving a month

This version does not archive for you. When a month ends:

1. Create a note named for the month, such as `2026 - 08-August`.
2. Move that month's rows from the inbox into it, between `%% money:txns:start %%` and `%% money:txns:end %%`, using the month table columns in [docs/data-format.md](docs/data-format.md).
3. Delete the moved rows from the inbox.

Until you do, the dashboard shows the month from the inbox and marks it **unarchived**.

## Network use

The Money Map page downloads map tiles from `tile.openstreetmap.org`. Only tile numbers are sent (zoom level and tile position), never your transactions. You can turn tiles off, or point them at another tile server, in the plugin settings. Map data © OpenStreetMap contributors. Please respect the [OpenStreetMap tile usage policy](https://operations.osmfoundation.org/policies/tiles/).

The plugin makes no other network requests and collects no telemetry.

## Settings

| Setting | Default |
| --- | --- |
| Currency symbol | `₹` |
| Number format | Indian (1,56,729; L and Cr). International is 156,729; k, M and B |
| Category list | 24 categories, one per line |
| Income, Transfer and Investments categories | `Income`, `Transfer`, `Investments` |
| Rows before "Show all" | 40 |
| Months on the trend chart | 12 |
| Load map tiles | On |
| Tile URL | `https://tile.openstreetmap.org/{z}/{x}/{y}.png` |
| Folder for new notes | `Money` |

## Development

```bash
npm install
npm test        # vitest
npm run build   # writes main.js
```

To try it in a vault, copy `main.js`, `manifest.json` and `styles.css` into `<vault>/.obsidian/plugins/money-dashboard/` and enable the plugin.

## Licence

MIT. See [LICENSE](LICENSE).
