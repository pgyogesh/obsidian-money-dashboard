import { App, PluginSettingTab, Setting } from "obsidian";
import type MoneyDashboardPlugin from "./main";
import type { NumberStyle } from "./parse/format";

export interface MoneySettings {
  currency: string;
  numberStyle: NumberStyle;
  categories: string[];
  incomeCategory: string;
  transferCategory: string;
  investmentsCategory: string;
  pageSize: number;
  trendMonths: number;
  mapTiles: boolean;
  tileUrl: string;
  setupFolder: string;
  dataviewNoticeShown: boolean;
}

export const DEFAULT_SETTINGS: MoneySettings = {
  currency: "₹",
  numberStyle: "indian",
  categories: [
    "Rent & Home", "Farm", "Groceries", "Dining & Delivery", "Transport & Fuel",
    "Bills & Utilities", "Shopping", "Health & Medical", "Fitness", "Personal Care",
    "Entertainment & Subscriptions", "Festival & Celebration", "Travel", "Education",
    "Insurance", "Loan & EMI", "Family & Gifts", "Cash Withdrawal", "Fees & Interest",
    "Taxes", "Other", "Income", "Transfer", "Investments",
  ],
  incomeCategory: "Income",
  transferCategory: "Transfer",
  investmentsCategory: "Investments",
  pageSize: 40,
  trendMonths: 12,
  mapTiles: true,
  tileUrl: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  setupFolder: "Money",
  dataviewNoticeShown: false,
};

const positiveInt = (v: string, fallback: number) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export class MoneySettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: MoneyDashboardPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    const s = this.plugin.settings;
    const save = () => this.plugin.saveSettings();
    containerEl.empty();

    new Setting(containerEl).setName("Money").setHeading();
    new Setting(containerEl)
      .setName("Currency symbol")
      .setDesc("Shown before every amount.")
      .addText((t) => t.setValue(s.currency).onChange(async (v) => { s.currency = v; await save(); }));
    new Setting(containerEl)
      .setName("Number format")
      .setDesc("Indian groups digits as 1,56,729 and shortens to L and Cr. International groups as 156,729 and shortens to k, M and B.")
      .addDropdown((d) => d
        .addOption("indian", "Indian")
        .addOption("international", "International")
        .setValue(s.numberStyle)
        .onChange(async (v) => { s.numberStyle = v as NumberStyle; await save(); }));

    new Setting(containerEl).setName("Categories").setHeading();
    new Setting(containerEl)
      .setName("Category list")
      .setDesc("One per line. These are the choices in the category picker.")
      .addTextArea((t) => {
        t.setValue(s.categories.join("\n")).onChange(async (v) => {
          s.categories = v.split("\n").map((x) => x.trim()).filter(Boolean);
          await save();
        });
        t.inputEl.rows = 10;
      });
    const special: [keyof MoneySettings, string, string][] = [
      ["incomeCategory", "Income category", "Money in. Not counted as spend."],
      ["transferCategory", "Transfer category", "Money between your own accounts. Neither spend nor income."],
      ["investmentsCategory", "Investments category", "Money to yourself, such as a SIP. Not counted as spend."],
    ];
    for (const [key, name, desc] of special) {
      new Setting(containerEl).setName(name).setDesc(desc)
        .addText((t) => t.setValue(String(s[key])).onChange(async (v) => {
          (s[key] as string) = v.trim();
          await save();
        }));
    }

    new Setting(containerEl).setName("Pages").setHeading();
    new Setting(containerEl)
      .setName("Rows before \"Show all\"")
      .addText((t) => t.setValue(String(s.pageSize)).onChange(async (v) => {
        s.pageSize = positiveInt(v, DEFAULT_SETTINGS.pageSize);
        await save();
      }));
    new Setting(containerEl)
      .setName("Months on the trend chart")
      .addText((t) => t.setValue(String(s.trendMonths)).onChange(async (v) => {
        s.trendMonths = positiveInt(v, DEFAULT_SETTINGS.trendMonths);
        await save();
      }));
    new Setting(containerEl)
      .setName("Folder for new notes")
      .setDesc("Where the setup command creates the inbox, the config and the pages.")
      .addText((t) => t.setValue(s.setupFolder).onChange(async (v) => { s.setupFolder = v.trim(); await save(); }));

    new Setting(containerEl).setName("Map").setHeading();
    new Setting(containerEl)
      .setName("Load map tiles")
      .setDesc("The map page downloads map tiles from the server below. Only tile numbers are sent, never your transactions. Turn this off to draw the heat on a blank background.")
      .addToggle((t) => t.setValue(s.mapTiles).onChange(async (v) => { s.mapTiles = v; await save(); }));
    new Setting(containerEl)
      .setName("Tile URL")
      .setDesc("Uses {z}, {x} and {y}. Respect the tile server's usage policy.")
      .addText((t) => t.setValue(s.tileUrl).onChange(async (v) => {
        s.tileUrl = v.trim() || DEFAULT_SETTINGS.tileUrl;
        await save();
      }));
  }
}
