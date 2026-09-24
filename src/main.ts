import { MarkdownRenderChild, moment, normalizePath, Notice, Plugin, TAbstractFile, TFile } from "obsidian";
import { makeFormat } from "./parse/format";
import { MONTH_FMT } from "./parse/markers";
import { renderAccounts } from "./render/accounts";
import { isEditing, type RenderCtx } from "./render/common";
import { renderDashboard } from "./render/dashboard";
import { renderMap } from "./render/map";
import { DEFAULT_SETTINGS, MoneySettingTab, type MoneySettings } from "./settings";
import { ArchiveModal } from "./archive/modal";
import { EntryModal } from "./entry/modal";
import { planSetup } from "./setup";
import { findAccounts, findInbox } from "./vault/load";
import { obsidianVault } from "./vault/obsidian";

type Renderer = (ctx: RenderCtx, el: HTMLElement) => Promise<void>;

const PAGES: [string, string, Renderer][] = [
  ["money-dashboard", "money-dashboard", renderDashboard],
  ["money-accounts", "money-accounts", renderAccounts],
  ["money-map", "money-map", renderMap],
];

/**
 * One rendered block. It re-reads the vault when a money note changes, so a
 * row the Shortcut appends shows up without reopening the note. It waits
 * while you are typing in one of its inputs, so an edit is never thrown away.
 */
class MoneyBlock extends MarkdownRenderChild {
  private state: Record<string, unknown> = {};
  private cleanups: (() => void)[] = [];
  private timer: number | null = null;
  private drawing = false;
  private watched = new Set<string>();
  private loaded = false;

  constructor(el: HTMLElement, private plugin: MoneyDashboardPlugin, private page: string, private renderer: Renderer) {
    super(el);
  }

  onload(): void {
    this.loaded = true;
    this.containerEl.addClasses(["money-dashboard", this.page, "md-block"]);
    void this.draw();
    const onChange = (f: TAbstractFile) => { if (this.relevant(f)) this.schedule(); };
    this.registerEvent(this.plugin.app.vault.on("modify", onChange));
    this.registerEvent(this.plugin.app.vault.on("create", onChange));
    this.registerEvent(this.plugin.app.vault.on("delete", onChange));
    this.registerEvent(this.plugin.app.vault.on("rename", onChange));
    this.registerEvent(this.plugin.app.metadataCache.on("changed", onChange));
    this.plugin.blocks.add(this);
  }

  onunload(): void {
    this.loaded = false;
    if (this.timer != null) window.clearTimeout(this.timer);
    this.runCleanups();
    this.plugin.blocks.delete(this);
  }

  /**
   * A change matters when it touches a note this page read (the inbox, the
   * config), any month note, or a new note that could become the inbox.
   */
  private relevant(f: TAbstractFile): boolean {
    if (!(f instanceof TFile) || f.extension !== "md") return false;
    if (this.watched.has(f.path)) return true;
    if (moment(f.basename, MONTH_FMT, true).isValid()) return true;
    return this.watched.size === 0 && /expenses|inbox|account/i.test(f.basename);
  }

  schedule(): void {
    if (this.timer != null) window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      this.timer = null;
      if (isEditing(this.containerEl, document.activeElement)) { this.schedule(); return; }
      void this.draw();
    }, 1200);
  }

  private runCleanups(): void {
    for (const c of this.cleanups.splice(0)) {
      try { c(); } catch (e) { console.error("Money Dashboard: clean-up failed", e); }
    }
  }

  /**
   * Redraw after this page's own write. It waits while another field has
   * focus (you tabbed from one box to the next), so typed text is not lost.
   */
  private refresh(): Promise<void> {
    if (isEditing(this.containerEl, document.activeElement)) { this.schedule(); return Promise.resolve(); }
    return this.draw();
  }

  async draw(): Promise<void> {
    if (!this.loaded) return;
    if (this.drawing) { this.schedule(); return; }
    // This draw reads the vault afresh, so a redraw already queued by the
    // same change is not needed.
    if (this.timer != null) { window.clearTimeout(this.timer); this.timer = null; }
    this.drawing = true;
    try {
      this.runCleanups();
      this.watched.clear();
      const s = this.plugin.settings;
      const ctx: RenderCtx = {
        app: this.plugin.app,
        settings: s,
        fmt: makeFormat({ currency: s.currency, style: s.numberStyle }),
        cats: { income: s.incomeCategory, transfer: s.transferCategory, investments: s.investmentsCategory },
        state: this.state,
        refresh: () => this.refresh(),
        onCleanup: (cb) => { this.cleanups.push(cb); },
        watch: (path) => { if (path) this.watched.add(path); },
        openArchive: () => this.plugin.openArchive(),
        openEntry: () => this.plugin.openEntry(),
      };
      // Draw into a detached element, then swap, so the page does not flash
      // empty while the vault is read.
      const next = createDiv();
      await this.renderer(ctx, next);
      // The note may have closed while the vault was read.
      if (!this.loaded) { this.runCleanups(); return; }
      this.containerEl.empty();
      this.containerEl.appendChild(next);
    } catch (e) {
      console.error("Money Dashboard: render failed", e);
      this.containerEl.empty();
      this.containerEl.createDiv({ cls: "wd-money-warn", text: `Money Dashboard could not draw this page: ${(e as Error).message}` });
    } finally {
      this.drawing = false;
    }
  }
}

export default class MoneyDashboardPlugin extends Plugin {
  settings: MoneySettings = { ...DEFAULT_SETTINGS };
  blocks = new Set<MoneyBlock>();

  async onload(): Promise<void> {
    await this.loadSettings();
    this.addSettingTab(new MoneySettingTab(this.app, this));

    for (const [lang, page, renderer] of PAGES) {
      this.registerMarkdownCodeBlockProcessor(lang, (_src, el, ctx) => {
        ctx.addChild(new MoneyBlock(el, this, page, renderer));
      });
    }

    this.addCommand({
      id: "set-up-money-notes",
      name: "Set up money notes",
      callback: () => this.setUp(false),
    });
    this.addCommand({
      id: "set-up-money-notes-with-sample-data",
      name: "Set up money notes with sample data",
      callback: () => this.setUp(true),
    });

    this.addCommand({
      id: "archive-completed-months",
      name: "Archive completed months",
      callback: () => this.openArchive(),
    });
    this.addCommand({
      id: "add-expense",
      name: "Add expense",
      callback: () => this.openEntry(),
    });

    this.app.workspace.onLayoutReady(() => this.checkDataview());
  }

  private cats() {
    const s = this.settings;
    return { income: s.incomeCategory, transfer: s.transferCategory, investments: s.investmentsCategory };
  }

  openArchive(): void {
    const s = this.settings;
    new ArchiveModal(this.app, { monthFolder: s.monthFolder, byYear: s.monthByYear }, this.cats(),
      makeFormat({ currency: s.currency, style: s.numberStyle })).open();
  }

  openEntry(): void {
    new EntryModal(this.app, this.settings, async (f) => {
      // Remembered, so the next entry starts with the same account and method.
      this.settings.lastAccount = f.account;
      this.settings.lastMethod = f.method;
      await this.saveData(this.settings);
    }).open();
  }

  /** The README lists Dataview as required. Say so once if it is off. */
  private async checkDataview(): Promise<void> {
    const plugins = (this.app as unknown as { plugins?: { enabledPlugins?: Set<string> } }).plugins;
    const enabled = plugins?.enabledPlugins?.has("dataview") ?? true;
    if (enabled || this.settings.dataviewNoticeShown) return;
    new Notice("Money Dashboard: please install and enable the Dataview plugin. See the Money Dashboard README.", 10000);
    this.settings.dataviewNoticeShown = true;
    await this.saveSettings();
  }

  private async setUp(sample: boolean): Promise<void> {
    const folder = normalizePath(this.settings.setupFolder || "/").replace(/^\/$/, "");
    const existing = new Set(this.app.vault.getFiles().map((f) => f.path));
    const v = obsidianVault(this.app);
    const [inbox, accounts] = await Promise.all([findInbox(v), findAccounts(v)]);
    const monthKeys = new Set(this.app.vault.getMarkdownFiles()
      .map((f) => moment(f.basename, MONTH_FMT, true)).filter((m) => m.isValid()).map((m) => m.format("YYYY-MM")));
    const plan = planSetup(folder, existing, moment(), sample, { inbox: !!inbox, accounts: !!accounts, monthKeys });
    if (!plan.length) { new Notice("Money Dashboard: every note already exists. Nothing was changed."); return; }
    const created: string[] = [];
    try {
      if (folder && !this.app.vault.getAbstractFileByPath(folder)) await this.app.vault.createFolder(folder);
      for (const f of plan) { await this.app.vault.create(f.path, f.content); created.push(f.path); }
    } catch (e) {
      new Notice(`Money Dashboard: setup stopped after ${created.length} note(s): ${(e as Error).message}`, 10000);
      return;
    }
    const kept = [inbox && `your inbox (${inbox.file.path})`, accounts && `your account config (${accounts.file.path})`].filter(Boolean);
    new Notice(`Money Dashboard: created ${created.length} note${created.length === 1 ? "" : "s"}.${kept.length ? ` Kept ${kept.join(" and ")}.` : ""}`, 8000);
    const dash = plan.find((f) => f.path.endsWith("Money Dashboard.md"));
    if (dash) await this.app.workspace.openLinkText(dash.path, "", false);
  }

  async loadSettings(): Promise<void> {
    const saved = (await this.loadData()) as Partial<MoneySettings> | null;
    this.settings = { ...DEFAULT_SETTINGS, ...(saved ?? {}) };
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    for (const b of this.blocks) b.schedule();
  }
}
