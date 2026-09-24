import { moment, Platform } from "obsidian";
import { cycleFor, dueFor, inCycle, sameAccount, type Account } from "../parse/accounts";
import { ACCT_START, DATE_FMTS } from "../parse/markers";
import { summarise } from "../parse/summary";
import type { Ranked } from "../parse/types";
import { findAccounts, findInbox, loadPool, type PoolTxn } from "../vault/load";
import { obsidianVault } from "../vault/obsidian";
import { bars, colorForCategory, locCell, METHOD_LABEL, noteLink, panel, plural, statCards, type RenderCtx } from "./common";

// Spend per account on the account's OWN billing cycle, not the calendar
// month. A statement generated on the 18th covers the 19th of the previous
// month to the 18th of this one, and that window decides the bill.

const PAGE_SIZE = 30;
const HUE = ["wd-blue", "wd-purple", "wd-green", "wd-amber", "wd-cyan", "wd-pink", "wd-slate"];

export const renderAccounts = async (ctx: RenderCtx, el: HTMLElement): Promise<void> => {
  const { app, fmt, cats } = ctx;
  const v = obsidianVault(app);
  const NOW = moment();
  const [cfg, pool, inbox] = await Promise.all([findAccounts(v), loadPool(v, NOW), findInbox(v)]);
  const root = el.createDiv({ cls: "wd-money-root" });
  ctx.watch(cfg?.file.path);
  ctx.watch(inbox?.file.path);

  if (!cfg) {
    root.createDiv({
      cls: "wd-money-empty",
      text: `No account config found. Expected a note holding ${ACCT_START} with a table of accounts. Run "Money Dashboard: Set up money notes" to create one.`,
    });
    return;
  }
  const { accounts, file: cfgFile } = cfg;
  const small = Platform.isMobile;
  const forAcct = (acct: Account, offset: number) => {
    const cyc = cycleFor(acct, offset, NOW);
    return { cyc, rows: pool.filter((t) => sameAccount(t.card, acct.name) && inCycle(t, cyc)) };
  };
  const merchantRank = (rows: PoolTxn[]): Ranked => {
    const m = new Map<string, number>();
    for (const t of summarise(rows, cats).spendT) m.set(t.merchant, (m.get(t.merchant) ?? 0) + t.amount);
    return [...m.entries()].filter(([, x]) => x !== 0).sort((a, b) => b[1] - a[1]);
  };

  const draw = () => {
    root.empty();
    let selName = (ctx.state.selName as string) ?? accounts[0].name;
    if (!accounts.some((a) => a.name === selName)) selName = accounts[0].name;
    const offset = (ctx.state.offset as number) ?? 0;
    const set = (name: string, off: number) => { ctx.state.selName = name; ctx.state.offset = off; draw(); };

    const head = root.createDiv({ cls: "wd-money-top" });
    const h = head.createDiv({ cls: "wd-money-heading" });
    h.createDiv({ cls: "wd-money-eyebrow", text: "ACCOUNTS" });
    h.createSpan({ cls: "wd-money-title", text: "Billing cycles" });
    const nav0 = head.createDiv({ cls: "wd-money-nav" });
    const monthNote = app.vault.getMarkdownFiles().find((f) => f.basename === "Money Dashboard");
    if (monthNote) noteLink(app, nav0, "← By month", monthNote.path).setAttr("title", "Spend by calendar month");
    const openCfg = nav0.createEl("button", { cls: "wd-money-step", text: "⚙", attr: { "aria-label": "Open the account config" } });
    openCfg.onclick = () => app.workspace.openLinkText(cfgFile.path, "", false);

    // An account in the data but missing from the config would vanish from
    // this page, so it is named instead.
    const strays = [...new Set(pool.map((t) => t.card)
      .filter((n) => n && n !== "Unknown" && !accounts.some((a) => sameAccount(a.name, n))))];
    if (strays.length) {
      root.createDiv({ cls: "wd-money-warn", text: `Not in the config, so not shown below: ${strays.join(", ")}. Add them to the table in ${cfgFile.basename}, or fix the Account cell in the inbox.` });
    }
    const noDay = accounts.filter((a) => !a.statementDay && !/savings|wallet|calendar/i.test(a.note));
    if (noDay.length) {
      root.createDiv({ cls: "wd-money-warn", text: `No statement day set for ${noDay.map((a) => a.name).join(", ")}, so they use the calendar month. Set one in ${cfgFile.basename} to use the real billing cycle.` });
    }

    // --- One card per account ----------------------------------------------
    // Biggest spend first, idle accounts last. The hue stays tied to the
    // account's position in the CONFIG, so a card keeps its colour.
    const cards = accounts.map((acct, i) => {
      const { cyc, rows } = forAcct(acct, 0);
      return { acct, cyc, s: summarise(rows, cats), hue: HUE[i % HUE.length], order: i };
    }).sort((a, b) => (b.s.net || 0) - (a.s.net || 0) || a.order - b.order);

    const grid = root.createDiv({ cls: "wd-grid" });
    for (const { acct, cyc, s, hue } of cards) {
      const card = grid.createDiv({ cls: `wd-card ${hue} is-clickable${acct.name === selName ? " is-active" : ""}`, attr: { tabindex: "0" } });
      card.createDiv({ cls: "wd-label", text: acct.name });
      card.createDiv({ cls: "wd-value", text: fmt.whole(s.net) });
      const bits = [cyc.label];
      if (!cyc.calendar) {
        const days = cyc.statement.diff(NOW.clone().startOf("day"), "days");
        bits.push(days <= 0 ? (small ? "statement today" : "statement due today")
          : small ? `stmt in ${days}d` : `statement in ${plural(days, "day")}`);
      }
      card.createDiv({ cls: "wd-detail", text: bits.join(" · ") });

      if (acct.limit) {
        const used = Math.max(0, s.net);
        const ratio = used / acct.limit;
        const track = card.createDiv({ cls: "wd-acct-track" });
        const fill = track.createDiv({ cls: `wd-acct-fill${ratio >= 0.75 ? " is-high" : ratio >= 0.3 ? " is-mid" : ""}` });
        fill.setCssProps({ "--fill": `${Math.min(100, ratio * 100).toFixed(1)}%` });
        card.createDiv({
          cls: "wd-detail",
          text: small ? `${fmt.pct(used, acct.limit)} of ${fmt.short(acct.limit)}` : `${fmt.pct(used, acct.limit)} of ${fmt.whole(acct.limit)} limit`,
        });
      }

      const last = forAcct(acct, -1);
      const prev = summarise(last.rows, cats);
      const due = dueFor(acct, last.cyc);
      if (prev.count) {
        const dueIn = due ? due.diff(NOW.clone().startOf("day"), "days") : null;
        const when = dueIn == null ? null
          : dueIn < 0 ? "overdue" : dueIn === 0 ? "today" : small ? `${dueIn}d` : `in ${plural(dueIn, "day")}`;
        const line = due
          ? (small ? `Bill ${fmt.whole(prev.net)} · due ${due.format("D MMM")} (${when})`
            : `Last bill ${fmt.whole(prev.net)}, due ${due.format("D MMM")} (${when})`)
          : `Last cycle ${fmt.whole(prev.net)}`;
        const cls = dueIn != null && dueIn < 0 ? " is-overdue" : dueIn != null && dueIn <= 3 ? " is-soon" : "";
        card.createDiv({ cls: `wd-detail wd-acct-due${cls}`, text: line });
      }
      card.onclick = () => set(acct.name, 0);
      card.onkeydown = (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); set(acct.name, 0); } };
    }

    // --- Detail for the selected account -----------------------------------
    const acct = accounts.find((a) => a.name === selName) ?? accounts[0];
    const { cyc, rows } = forAcct(acct, offset);
    const s = summarise(rows, cats);

    const nav = root.createDiv({ cls: "wd-money-top" });
    const nh = nav.createDiv({ cls: "wd-money-heading" });
    nh.createDiv({ cls: "wd-money-eyebrow", text: acct.name.toUpperCase() });
    nh.createSpan({ cls: "wd-money-title", text: cyc.label });
    const navBtns = nav.createDiv({ cls: "wd-money-nav" });
    const back = navBtns.createEl("button", { cls: "wd-money-step", text: "‹", attr: { "aria-label": "Previous cycle" } });
    back.onclick = () => set(acct.name, offset - 1);
    navBtns.createSpan({ cls: "wd-money-badge", text: offset === 0 ? "current" : `${plural(-offset, "cycle")} back` });
    const fwd = navBtns.createEl("button", { cls: "wd-money-step", text: "›", attr: { "aria-label": "Next cycle" } });
    fwd.disabled = offset >= 0;
    fwd.onclick = () => set(acct.name, offset + 1);

    const days = Math.max(1, Math.min(NOW.diff(cyc.start, "days") + 1, cyc.end.diff(cyc.start, "days") + 1));
    const running = offset === 0;
    statCards(root, [
      { cls: "wd-blue", label: running ? "Spend so far" : "Cycle spend", value: fmt.whole(s.net), detail: `${cyc.start.format("D MMM")} to ${cyc.end.format("D MMM YYYY")}` },
      { cls: "wd-purple", label: "Transactions", value: String(s.count), detail: s.count ? `average ${fmt.whole(s.net / s.count)} each` : "none in this cycle" },
      { cls: "wd-green", label: "Refunds in", value: fmt.whole(s.refunds), detail: s.refunds ? "netted into their category" : "none" },
      { cls: "wd-amber", label: "Average per day", value: fmt.whole(s.net / days), detail: `over ${plural(days, "day")}${running ? " so far" : ""}` },
    ]);

    const cols = root.createDiv({ cls: "wd-money-cols" });
    bars(panel(cols, "Where it went", plural(s.byCategory.length, "category", "categories")), s.byCategory, s.net, fmt,
      { colour: colorForCategory, empty: "Nothing in this cycle." });
    const merchants = merchantRank(rows);
    bars(panel(cols, "Top merchants", `${merchants.length} in this cycle`), merchants.filter(([, x]) => x > 0).slice(0, 10), s.net, fmt,
      { empty: "Nothing in this cycle." });

    // --- Transactions in this cycle ----------------------------------------
    const tp = panel(root, "Transactions", `${rows.length} in this cycle`);
    const table = tp.createDiv({ cls: "wd-money-tablewrap" }).createEl("table", { cls: "wd-money-table" });
    const hr = table.createEl("thead").createEl("tr");
    const MINOR = new Set(["Method", "Location"]);
    for (const label of ["Date", "Merchant", "Location", "Category", "Method", "Amount"]) {
      hr.createEl("th", { cls: `${label === "Amount" ? "is-num" : ""}${MINOR.has(label) ? " wd-col-minor" : ""}`.trim(), text: label });
    }
    const tb = table.createEl("tbody");
    const sorted = rows.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
    for (const t of sorted.slice(0, PAGE_SIZE)) {
      const tr = tb.createEl("tr");
      const d = moment(t.date, DATE_FMTS, true);
      tr.createEl("td", {
        text: d.isValid() ? (String(t.date).length > 10 ? d.format("DD MMM, HH:mm") : d.format("DD MMM")) : t.date,
        attr: { title: String(t.date) },
      });
      tr.createEl("td", { text: t.merchant, attr: { title: t.desc || t.merchant } });
      locCell(tr, t.location, "wd-col-minor");
      const cc = tr.createEl("td");
      cc.setCssProps({ "--bar-color": colorForCategory(t.category) });
      cc.createSpan({ cls: "wd-money-tag", text: t.category });
      tr.createEl("td", { cls: "wd-col-minor", text: METHOD_LABEL[t.type] ?? t.type });
      tr.createEl("td", { cls: `is-num${t.amount < 0 ? " is-credit" : ""}`, text: fmt.exact(t.amount) });
    }
    if (!rows.length) tb.createEl("tr").createEl("td", { text: "No transaction in this cycle.", attr: { colspan: "6" } });
    const foot = [`spend ${fmt.exact(s.net)}`];
    if (rows.length > PAGE_SIZE) foot.unshift(`Showing the first ${PAGE_SIZE} of ${rows.length}`);
    if (s.invested) foot.push(`invested ${fmt.exact(s.invested)}, not counted`);
    if (s.transfers) foot.push(`transfers ${fmt.exact(s.transfers)}, not counted`);
    tp.createDiv({ cls: "wd-money-foot", text: foot.join(" · ") });
    root.createDiv({
      cls: "wd-money-foot",
      text: `Cycles use the statement day in ${cfgFile.basename}. ${inbox ? `Live rows from ${inbox.file.path}.` : ""}`.trim(),
    });
  };

  draw();
};
