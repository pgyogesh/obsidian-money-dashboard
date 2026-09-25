import { moment } from "obsidian";
import { DATE_FMTS, INBOX_MARK, MONTH_FMT, TXN_START } from "../parse/markers";
import { categoryKind } from "../parse/summary";
import { cellIndexFor } from "../parse/inbox";
import { str } from "../parse/str";
import type { InboxRow, Txn } from "../parse/types";
import { cleanFreeText } from "../write/cell";
import { loadMonths, type MonthData } from "../vault/load";
import { obsidianVault } from "../vault/obsidian";
import {
  bars, colorForCategory, deleteRow, locCell, METHOD_LABEL, noteLink, panel, plural, statCards, writeCell,
  type RenderCtx,
} from "./common";

// Spend, category and card breakdowns, a trend and a filterable transaction
// table. The current month comes from the live inbox; earlier months from
// their archived notes. Every figure is DERIVED FROM THE TRANSACTION TABLE.
// Frontmatter is only a fallback for months with no table, and a cross-check.

export const renderDashboard = async (ctx: RenderCtx, el: HTMLElement): Promise<void> => {
  const { app, settings, fmt, cats } = ctx;
  const now = moment();
  const { months, overlaps, duplicates, inbox } = await loadMonths(obsidianVault(app), cats, now);
  const byKey = new Map(months.map((m) => [m.key, m]));
  ctx.watch(inbox?.path);
  const root = el.createDiv({ cls: "wd-money-root" });

  if (!months.length) {
    const e = root.createDiv({ cls: "wd-money-empty" });
    e.createDiv({ text: "No money data found yet." });
    e.createDiv({
      cls: "wd-money-empty-sub",
      text: `Expected a note holding ${INBOX_MARK} with a table under it, or a month note named "${MONTH_FMT}" with a ${TXN_START} table. Run the command "Money Dashboard: Set up money notes" to create them.`,
    });
    return;
  }

  const inboxPath = inbox?.path ?? null;
  const warn = (text: string) => root.createDiv({ cls: "wd-money-warn", text });
  const warnWithArchive = (text: string) => {
    const w = warn(text);
    const b = w.createEl("button", { cls: "wd-money-warn-action", text: "Archive…" });
    b.onclick = () => ctx.openArchive();
    return w;
  };
  const saved = ctx.state.selKey as string | undefined;
  let sel: MonthData = (saved && byKey.get(saved)) || months[months.length - 1];

  const choose = (m: MonthData) => { sel = m; ctx.state.selKey = m.key; draw(); };

  const draw = () => {
    root.empty();
    const i = months.findIndex((m) => m.key === sel.key);
    const prev = i > 0 ? months[i - 1] : null;

    // --- Header: month title left, prev / picker / next right ---------------
    const top = root.createDiv({ cls: "wd-money-top" });
    const head = top.createDiv({ cls: "wd-money-heading" });
    head.createDiv({ cls: "wd-money-eyebrow", text: "MONEY" });
    const titleRow = head.createDiv({ cls: "wd-money-titlerow" });
    titleRow.createSpan({ cls: "wd-money-title", text: sel.label });
    if (sel.status !== "final") titleRow.createSpan({ cls: `wd-money-badge is-${sel.status}`, text: sel.status });

    const nav = top.createDiv({ cls: "wd-money-nav" });
    const back = nav.createEl("button", { cls: "wd-money-step", text: "‹", attr: { "aria-label": "Previous month" } });
    back.disabled = i <= 0;
    back.onclick = () => choose(months[i - 1]);
    const pick = nav.createEl("select", { cls: "wd-money-pick dropdown" });
    for (const m of months) pick.createEl("option", { value: m.key, text: m.label });
    pick.value = sel.key;
    pick.onchange = () => choose(byKey.get(pick.value)!);
    const fwd = nav.createEl("button", { cls: "wd-money-step", text: "›", attr: { "aria-label": "Next month" } });
    fwd.disabled = i >= months.length - 1;
    fwd.onclick = () => choose(months[i + 1]);
    const add = nav.createEl("button", { cls: "wd-money-step", text: "＋", attr: { "aria-label": "Add an expense" } });
    add.onclick = () => ctx.openEntry();
    if (sel.file) {
      const file = sel.file;
      const open = nav.createEl("button", { cls: "wd-money-step", text: "↗", attr: { "aria-label": "Open the note" } });
      open.onclick = () => app.workspace.openLinkText(file.path, "", false);
    }

    // --- Banners ------------------------------------------------------------
    const noteName = sel.file?.basename ?? "the month note";
    if (sel.status === "sample") {
      warn(`${sel.label} is sample data. Replace the table in ${noteName} with real transactions, then set money.status to final, or delete the note.`);
    }
    if (sel.drift) {
      warn(`Stale rollup: frontmatter says spend ${fmt.exact(sel.drift.stored)} but the transaction table adds up to ${fmt.exact(sel.drift.computed)}. The page shows the table. Update the frontmatter in ${noteName}.`);
    }
    const clash = overlaps.find((o) => o.key === sel.key);
    if (clash) {
      (clash.winner === "inbox" ? warn : warnWithArchive)(clash.winner === "inbox"
        ? `${clash.label} is in both the inbox and an archived note. It is the current month, so the inbox is shown and the archived note is ignored.`
        : `${clash.label} is archived, but rows for it are still in the inbox. The archive is shown. Archive again to merge them in.`);
    }
    const dup = duplicates.find((d) => d.key === sel.key);
    if (dup) {
      warn(`${sel.label} has ${dup.paths.length} month notes: ${dup.paths.join(", ")}. Only ${dup.used} is counted. Merge or delete the others.`);
    }
    if (sel.status === "unarchived") {
      warnWithArchive(`${sel.label} has ended but is still in the inbox. Archive it to move its rows into its month note.`);
    }
    if (sel.tableless) {
      warn(`${sel.label} has frontmatter totals but no ${TXN_START} table, so merchants and the transaction list are not available for this month.`);
    }

    // --- Editing (live month only) ------------------------------------------
    const failed = (what: string, why: string) => warn(`Could not ${what}: ${why}`);
    const write = async (row: InboxRow, kind: "category" | "merchant" | "description", value: string, what: string) => {
      if (!inboxPath) { failed(what, "the inbox file is not available"); return false; }
      const col = cellIndexFor(row, kind);
      if (col == null) { failed(what, `the inbox table has no ${kind[0].toUpperCase()}${kind.slice(1)} column. Add one to its header row.`); return false; }
      const res = await writeCell(app, inboxPath, row, col, cleanFreeText(value));
      if (!res.ok) { failed(what, res.why); return false; }
      await ctx.refresh();
      return true;
    };

    const catPicker = (cell: HTMLElement, row: InboxRow) => {
      const s = cell.createEl("select", { cls: `wd-cat-select dropdown ${row.category ? "is-set" : "is-empty"}` });
      s.createEl("option", { value: "", text: row.category || "Set category…" });
      for (const name of settings.categories) {
        if (name !== row.category) s.createEl("option", { value: name, text: name });
      }
      s.value = "";
      if (row.category) s.setCssProps({ "--bar-color": colorForCategory(row.category) });
      s.onchange = async () => {
        if (!s.value) return;
        s.disabled = true;
        if (!(await write(row, "category", s.value, "set the category"))) { s.disabled = false; s.value = ""; }
      };
    };

    // A description is free text. It commits on blur and Enter; Escape
    // abandons, because a half-typed note saved by a stray click is worse
    // than losing it. A "-" means "deliberately nothing".
    const descEditor = (cell: HTMLElement, row: InboxRow) => {
      const box = cell.createEl("input", {
        cls: `wd-money-desc ${row.description ? "is-set" : "is-empty"}`,
        attr: { type: "text", placeholder: "Add a note" },
      });
      box.value = row.description ?? "";
      let saving = false;
      const commit = async () => {
        const value = cleanFreeText(box.value);
        if (saving || value === (row.description ?? "").trim()) return;
        saving = true;
        box.disabled = true;
        if (!(await write(row, "description", value, "set the description"))) {
          box.disabled = false; saving = false; box.value = row.description ?? "";
        }
      };
      box.onblur = commit;
      box.onkeydown = (ev) => {
        if (ev.key === "Enter") { ev.preventDefault(); box.blur(); }
        if (ev.key === "Escape") { box.value = row.description ?? ""; box.blur(); }
      };
    };

    // One datalist for the page, most-used first, so a shop does not become two.
    const merchantNames = (() => {
      const n = new Map<string, number>();
      for (const x of sel.txns) {
        const k = String(x.merchant ?? "").trim();
        if (k && k !== "Unknown") n.set(k, (n.get(k) ?? 0) + 1);
      }
      return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([k]) => k);
    })();
    const listId = `wd-merchant-names-${Math.random().toString(36).slice(2, 8)}`;
    if (merchantNames.length) {
      const dl = root.createEl("datalist", { attr: { id: listId } });
      for (const name of merchantNames) dl.createEl("option", { value: name });
    }

    // Click-to-edit for the transaction table. It never edits an archived row,
    // and it seeds the input from the FILE value, not the displayed one.
    const editable = (td: HTMLElement, txn: Txn, kind: "merchant" | "description") => {
      const src = txn.src;
      const fileValue = kind === "merchant" ? (src?.merchant ?? "") : (src?.description ?? "");
      const shown = kind === "merchant" ? txn.merchant : (txn.description === "-" ? "" : txn.description);
      if (!src || !sel.fromInbox) {
        td.setText(shown ?? "");
        td.setAttr("title", "Archived rows are read-only here. Edit the month note.");
        return;
      }
      td.addClass("wd-editable");
      const paint = () => {
        td.empty();
        const span = td.createSpan({ cls: `wd-money-edit${shown ? "" : " is-empty"}`, text: shown || "" });
        span.setAttr("title", fileValue && fileValue !== shown ? `In the file: ${fileValue}. Click to edit.` : "Click to edit");
        span.onclick = open;
      };
      const open = () => {
        td.empty();
        const box = td.createEl("input", {
          cls: "wd-money-desc",
          attr: { type: "text", placeholder: kind === "merchant" ? "merchant" : "add a note" },
        });
        box.value = fileValue;
        if (kind === "merchant" && merchantNames.length) box.setAttr("list", listId);
        let done = false;
        const finish = async (save: boolean) => {
          if (done) return;
          done = true;
          const value = cleanFreeText(box.value);
          if (!save || value === String(fileValue).trim()) { paint(); return; }
          box.disabled = true;
          const ok = kind === "merchant"
            ? await write(src, "merchant", value, "save the merchant")
            : await write(src, "description", value, "save the description");
          if (!ok) paint();
        };
        box.onblur = () => { void finish(true); };
        box.onkeydown = (ev) => {
          if (ev.key === "Enter") { ev.preventDefault(); void finish(true); }
          if (ev.key === "Escape") { ev.preventDefault(); void finish(false); }
        };
        box.focus();
      };
      paint();
    };

    // Delete, for rows still in the inbox. Archived rows have no button: their
    // totals are already stored in the month note.
    const deleteCell = (tr: HTMLTableRowElement, row: InboxRow | undefined) => {
      const td = tr.createEl("td", { cls: "wd-money-actions" });
      if (!row || !sel.fromInbox || !inboxPath) return td;
      const path = inboxPath;
      const b = td.createEl("button", { cls: "wd-money-delete clickable-icon", text: "🗑", attr: { "aria-label": "Delete this row" } });
      b.onclick = async () => {
        const ok = await ctx.confirm(`Delete ${row.when}, ${row.merchant || "no merchant"}, ${fmt.exact(row.amount)}? It is kept in the deleted log next to the inbox.`);
        if (!ok) return;
        b.disabled = true;
        const res = await deleteRow(app, path, row);
        if (!res.ok) { failed("delete the row", res.why); b.disabled = false; return; }
        await ctx.refresh();
      };
      return td;
    };

    const amountCell = (tr: HTMLTableRowElement, amount: number, credit: boolean) =>
      tr.createEl("td", { cls: `is-num${credit ? " is-credit" : ""}`, text: fmt.exact(amount) });

    // --- Rows still needing a category --------------------------------------
    // The money is already counted; only the label is missing.
    const newestFirst = (a: InboxRow, b: InboxRow) => String(b.when).localeCompare(String(a.when));
    const needCat = (sel.rows ?? []).filter((r) => !r.category).sort(newestFirst);
    if (needCat.length) {
      const n = needCat.length;
      const ip = panel(root, `${n} ${n === 1 ? "row needs" : "rows need"} a category`,
        "already counted in the figures below, only the label is missing", "is-inbox");
      const tb = ip.createDiv({ cls: "wd-money-tablewrap" }).createEl("table", { cls: "wd-money-table" });
      const hr = tb.createEl("thead").createEl("tr");
      const MINOR = new Set(["Account", "Method", "In / out"]);
      for (const h of ["When", "Merchant", "Location", "Category", "Account", "Method", "In / out", "Amount", ""]) {
        hr.createEl("th", { cls: `${h === "Amount" ? "is-num" : ""}${MINOR.has(h) ? " wd-col-minor" : ""}`.trim(), text: h });
      }
      const body = tb.createEl("tbody");
      for (const r of needCat.slice(0, 25)) {
        const tr = body.createEl("tr");
        tr.createEl("td", { text: r.when });
        tr.createEl("td", { text: r.merchant, attr: { title: r.raw || r.merchant } });
        locCell(tr, r.location);
        catPicker(tr.createEl("td"), r);
        tr.createEl("td", { cls: "wd-col-minor", text: r.account });
        tr.createEl("td", { cls: "wd-col-minor", text: r.method });
        tr.createEl("td", { cls: "wd-col-minor", text: r.direction || "?" });
        amountCell(tr, r.amount, r.direction === "credit");
        deleteCell(tr, r);
      }
      if (n > 25) ip.createDiv({ cls: "wd-money-foot", text: `Showing the first 25 of ${n}.` });
      if (inboxPath) {
        const btn = ip.createEl("button", { cls: "wd-money-more", text: "Open the inbox" });
        btn.onclick = () => app.workspace.openLinkText(inboxPath, "", false);
      }
    }

    // --- Rows still needing a description -----------------------------------
    // Shown only when the inbox has a Description column to write into.
    const hasDescCol = (sel.rows ?? []).some((r) => r.descCol != null);
    const needDesc = hasDescCol ? (sel.rows ?? []).filter((r) => !String(r.description ?? "").trim()).sort(newestFirst) : [];
    if (needDesc.length) {
      const n = needDesc.length;
      const dp = panel(root, `${n} ${n === 1 ? "row needs" : "rows need"} a description`,
        "what was it actually for, in your own words", "is-inbox");
      const dtb = dp.createDiv({ cls: "wd-money-tablewrap" }).createEl("table", { cls: "wd-money-table" });
      const dhr = dtb.createEl("thead").createEl("tr");
      for (const h of ["When", "Merchant", "Location", "Description", "Category", "Amount", ""]) {
        dhr.createEl("th", { cls: h === "Amount" ? "is-num" : "", text: h });
      }
      const dbody = dtb.createEl("tbody");
      for (const r of needDesc.slice(0, 25)) {
        const tr = dbody.createEl("tr");
        tr.createEl("td", { text: r.when });
        tr.createEl("td", { text: r.merchant, attr: { title: r.raw || r.merchant } });
        locCell(tr, r.location);
        descEditor(tr.createEl("td"), r);
        const cat = r.category || "Uncategorised";
        const cc = tr.createEl("td");
        cc.setCssProps({ "--bar-color": colorForCategory(cat) });
        cc.createSpan({ cls: "wd-money-tag", text: cat });
        amountCell(tr, r.amount, r.direction === "credit");
        deleteCell(tr, r);
      }
      if (n > 25) dp.createDiv({ cls: "wd-money-foot", text: `Showing the first 25 of ${n}.` });
      dp.createDiv({ cls: "wd-money-foot", text: "A dash means \"nothing worth noting\", and stops the row appearing here." });
    }

    // --- Stat cards ---------------------------------------------------------
    // For the running month, "per day" counts days so far, so the average is
    // never flattered by days not yet lived.
    const isCurrent = sel.moment.isSame(now, "month");
    const days = isCurrent ? now.date() : sel.moment.daysInMonth();
    const delta = prev && prev.net > 0 ? ((sel.net - prev.net) / prev.net) * 100 : null;
    const cardSpend = sel.byType.filter(([k]) => /credit/i.test(k)).reduce((a, [, v]) => a + v, 0);
    const otherSpend = sel.net - cardSpend;
    statCards(root, [
      {
        cls: "wd-blue", label: "Net spend", value: fmt.whole(sel.net),
        detail: delta == null ? (prev ? "no prior month total" : "first month on record")
          : `${delta >= 0 ? "▲" : "▼"} ${Math.abs(delta).toFixed(1)}% vs ${prev!.short}`,
        detailCls: `wd-money-delta ${delta == null ? "is-flat" : delta >= 0 ? "is-up" : "is-down"}`,
      },
      { cls: "wd-purple", label: "Gross spend", value: fmt.whole(sel.spend), detail: plural(sel.count, "transaction") },
      { cls: "wd-green", label: "Refunds in", value: fmt.whole(sel.refunds), detail: sel.refundCount ? plural(sel.refundCount, "credit") : "none" },
      {
        cls: "wd-cyan", label: "Income", value: fmt.whole(sel.income),
        detail: sel.income > 0 ? `saved ${fmt.whole(sel.income - sel.net)} (${fmt.pct(sel.income - sel.net, sel.income)})` : "not recorded",
      },
      { cls: "wd-amber", label: "Credit cards", value: fmt.whole(cardSpend), detail: `${fmt.pct(cardSpend, sel.net)} of net spend` },
      { cls: "wd-pink", label: "Bank / UPI / cash", value: fmt.whole(otherSpend), detail: `${fmt.pct(otherSpend, sel.net)} of net spend` },
      { cls: "wd-slate", label: "Average per day", value: fmt.whole(sel.net / Math.max(days, 1)), detail: `over ${plural(days, "day")}${isCurrent ? " so far" : ""}` },
    ]);

    // --- Trend --------------------------------------------------------------
    // Anchored on the LATEST month with data, so the window holds still while
    // the selection moves. A selection older than the window moves it.
    const LEN = settings.trendMonths;
    const latest = months[months.length - 1].moment;
    const anchor = latest.diff(sel.moment, "month") >= LEN ? sel.moment : latest;
    const axis = [];
    for (let k = LEN - 1; k >= 0; k--) {
      const m = anchor.clone().subtract(k, "month");
      axis.push({ key: m.format("YYYY-MM"), month: m, data: byKey.get(m.format("YYYY-MM")) ?? null });
    }
    const present = axis.filter((a) => a.data);
    const avg = present.length ? present.reduce((a, b) => a + b.data!.net, 0) / present.length : 0;
    const trend = panel(root, `Net spend, ${axis[0].month.format("MMM ’YY")} to ${anchor.format("MMM ’YY")}`,
      present.length > 1 ? `average ${fmt.short(avg)}/month across ${present.length} months with data` : "one month with data so far");
    const chart = trend.createDiv({ cls: "wd-money-chart" });
    const peak = present.length ? Math.max(...present.map((a) => a.data!.net)) : 0;
    for (const a of axis) {
      const col = chart.createDiv({ cls: `wd-money-col${a.key === sel.key ? " is-selected" : ""}${a.data ? "" : " is-inert"}` });
      const bar = col.createDiv({ cls: `wd-money-colbar${a.data ? "" : " is-empty"}` });
      bar.setCssProps({ "--col-height": a.data && peak > 0 ? `${Math.max((a.data.net / peak) * 100, 2)}%` : "2px" });
      col.setAttr("title", a.data ? `${a.month.format("MMMM YYYY")}: ${fmt.exact(a.data.net)}` : `${a.month.format("MMMM YYYY")}: no data`);
      if (a.data) { const d = a.data; col.onclick = () => choose(d); }
      col.createDiv({ cls: "wd-money-xlabel", text: a.month.month() === 0 ? a.month.format("MMM ’YY") : a.month.format("MMM") });
    }

    // --- Category | card and method ------------------------------------------
    const cols = root.createDiv({ cls: "wd-money-cols" });
    bars(panel(cols, "Where it went", plural(sel.byCategory.length, "category", "categories")),
      sel.byCategory, sel.net, fmt, { colour: colorForCategory });
    const cardP = panel(cols, "By card and method", plural(sel.byCard.length, "account"));
    const acctNote = app.vault.getMarkdownFiles().find((f) => f.basename === "Money Accounts");
    if (acctNote) {
      noteLink(app, cardP.head, "Billing cycles →", acctNote.path)
        .setAttr("title", "Spend per account on its own statement cycle");
    }
    bars(cardP, sel.byCard, sel.net, fmt);
    cardP.createDiv({ cls: "wd-money-panel-head wd-money-subhead" })
      .createSpan({ cls: "wd-money-panel-title", text: "Payment method" });
    bars(cardP, sel.byType, sel.net, fmt, { pretty: (k) => METHOD_LABEL[k] ?? k });

    // --- Top merchants ------------------------------------------------------
    if (sel.byMerchant.length) {
      const topN = sel.byMerchant.slice(0, 10);
      const mp = panel(root, "Top 10 merchants", `${sel.byMerchant.length} distinct merchants`);
      bars(mp, topN.map(([name, v]): [string, number] => [name, v.total]), sel.net, fmt);
      mp.createDiv({ cls: "wd-money-foot", text: `These ${topN.length} are ${fmt.pct(topN.reduce((a, [, v]) => a + v.total, 0), sel.net)} of net spend.` });
    }

    // --- Transactions -------------------------------------------------------
    if (sel.txns.length) drawTransactions(sel, root, { editable, catPicker, deleteCell });

    // --- Provenance ---------------------------------------------------------
    const bits = [];
    if (sel.updated) bits.push(`parsed ${sel.updated}`);
    if (sel.sources.length) bits.push(sel.sources.join("; "));
    root.createDiv({ cls: "wd-money-foot", text: bits.length ? `Source: ${bits.join(" · ")}` : `Source: ${sel.file?.path ?? ""}` });
  };

  const drawTransactions = (
    m: MonthData, parent: HTMLElement,
    ed: {
      editable: (td: HTMLElement, t: Txn, k: "merchant" | "description") => void;
      catPicker: (c: HTMLElement, r: InboxRow) => void;
      deleteCell: (tr: HTMLTableRowElement, r: InboxRow | undefined) => HTMLTableCellElement;
    },
  ) => {
    const tp = panel(parent, "Transactions", `${m.txns.length} rows in ${m.file?.basename ?? "the inbox"}`);
    const filters = tp.createDiv({ cls: "wd-money-filters" });
    const search = filters.createEl("input", { cls: "wd-money-search", attr: { type: "search", placeholder: "Search merchant, description, card…" } });
    const catFilter = filters.createEl("select", { cls: "wd-money-filter dropdown" });
    catFilter.createEl("option", { value: "", text: "All categories" });
    for (const [name] of m.byCategory) catFilter.createEl("option", { value: name, text: name });
    const cardFilter = filters.createEl("select", { cls: "wd-money-filter dropdown" });
    cardFilter.createEl("option", { value: "", text: "All cards" });
    for (const [name] of m.byCard) cardFilter.createEl("option", { value: name, text: name });
    const wrap = tp.createDiv({ cls: "wd-money-tablewrap" });
    const foot = tp.createDiv();

    // `minor` marks a column a phone can do without.
    const COLS: { key: keyof Txn; label: string; num?: boolean; minor?: boolean }[] = [
      { key: "date", label: "Date" },
      { key: "merchant", label: "Merchant" },
      { key: "description", label: "Description", minor: true },
      { key: "location", label: "Location", minor: true },
      { key: "category", label: "Category" },
      { key: "card", label: "Card", minor: true },
      { key: "type", label: "Method", minor: true },
      { key: "amount", label: "Amount", num: true },
    ];
    let sortKey: keyof Txn = "date", sortDir = -1, showAll = false;

    const drawTable = () => {
      wrap.empty(); foot.empty();
      const q = search.value.trim().toLowerCase();
      const rows = m.txns.filter((t) => {
        if (catFilter.value && t.category !== catFilter.value) return false;
        if (cardFilter.value && t.card !== cardFilter.value) return false;
        if (!q) return true;
        return [t.merchant, t.desc, t.description, t.category, t.card, t.type, t.note].join(" ").toLowerCase().includes(q);
      }).sort((a, b) => {
        const x = a[sortKey], y = b[sortKey];
        const c = sortKey === "amount" ? (x as number) - (y as number) : str(x).localeCompare(str(y));
        return c * sortDir;
      });

      const table = wrap.createEl("table", { cls: "wd-money-table" });
      const hr = table.createEl("thead").createEl("tr");
      for (const c of COLS) {
        const th = hr.createEl("th", {
          cls: `is-sortable${c.num ? " is-num" : ""}${c.minor ? " wd-col-minor" : ""}`,
          text: c.label + (sortKey === c.key ? (sortDir === 1 ? " ↑" : " ↓") : ""),
        });
        th.onclick = () => {
          if (sortKey === c.key) sortDir = -sortDir;
          else { sortKey = c.key; sortDir = c.num || c.key === "date" ? -1 : 1; }
          drawTable();
        };
      }
      if (m.fromInbox) hr.createEl("th", { cls: "wd-money-actions" });
      const tbody = table.createEl("tbody");
      const visible = showAll ? rows : rows.slice(0, settings.pageSize);
      for (const t of visible) {
        const tr = tbody.createEl("tr");
        const d = moment(t.date, DATE_FMTS, true);
        const when = !d.isValid() ? t.date : String(t.date).length > 10 ? d.format("DD MMM, HH:mm") : d.format("DD MMM");
        tr.createEl("td", { cls: "is-when", text: when, attr: { title: t.date } });
        ed.editable(tr.createEl("td", { attr: { title: t.desc } }), t, "merchant");
        ed.editable(tr.createEl("td", { cls: "wd-col-minor is-desc" }), t, "description");
        locCell(tr, t.location, "wd-col-minor");
        const catCell = tr.createEl("td");
        catCell.setCssProps({ "--bar-color": colorForCategory(t.category) });
        if (m.fromInbox && t.src) ed.catPicker(catCell, t.src);
        else catCell.createSpan({ cls: "wd-money-tag", text: t.category });
        tr.createEl("td", { cls: "wd-col-minor", text: t.card });
        tr.createEl("td", { cls: "wd-col-minor", text: METHOD_LABEL[t.type] ?? t.type });
        tr.createEl("td", { cls: `is-num${t.amount < 0 ? " is-credit" : ""}`, text: fmt.exact(t.amount) });
        if (m.fromInbox) ed.deleteCell(tr, t.src);
      }
      if (!rows.length) {
        tbody.createEl("tr").createEl("td", { text: "No transaction matches these filters.", attr: { colspan: String(COLS.length + (m.fromInbox ? 1 : 0)) } });
      }

      // Spend and money in are reported apart. Netting salary against
      // groceries in one "total" would be a meaningless number.
      const kind = (t: Txn) => categoryKind(t.category, cats);
      const outSum = rows.filter((t) => kind(t) === "spend").reduce((a, t) => a + t.amount, 0);
      const inSum = rows.filter((t) => kind(t) === "income").reduce((a, t) => a - t.amount, 0);
      const investSum = rows.filter((t) => kind(t) === "investments").reduce((a, t) => a + Math.abs(t.amount), 0);
      const xferSum = rows.filter((t) => kind(t) === "transfer").reduce((a, t) => a + Math.abs(t.amount), 0);
      const parts = [`Showing ${visible.length} of ${rows.length} rows`, `spend ${fmt.exact(outSum)}`];
      if (inSum !== 0) parts.push(`money in ${fmt.exact(inSum)}`);
      if (investSum !== 0) parts.push(`invested ${fmt.exact(investSum)}, not counted`);
      if (xferSum !== 0) parts.push(`transfers ${fmt.exact(xferSum)}, not counted`);
      foot.createDiv({ cls: "wd-money-foot", text: parts.join(" · ") });
      if (rows.length > visible.length) {
        const more = foot.createEl("button", { cls: "wd-money-more", text: `Show all ${rows.length} rows` });
        more.onclick = () => { showAll = true; drawTable(); };
      }
    };

    search.oninput = () => { showAll = false; drawTable(); };
    catFilter.onchange = () => { showAll = false; drawTable(); };
    cardFilter.onchange = () => { showAll = false; drawTable(); };
    drawTable();
  };

  draw();
};
