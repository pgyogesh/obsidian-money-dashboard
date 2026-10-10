// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from "vitest";
import MoneyDashboardPlugin from "../src/main";
import { DEFAULT_SETTINGS, MoneySettingTab } from "../src/settings";
import { installDomHelpers } from "./dom";

// Exercise the settings callbacks with DOM controls in place of Obsidian's UI.
vi.mock("obsidian", async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  class Control {
    constructor(public inputEl: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement) {}
    setValue(value: string | boolean) { this.inputEl.value = String(value); return this; }
    setPlaceholder(value: string) { this.inputEl.setAttribute("placeholder", value); return this; }
    addOption(value: string, label: string) {
      const option = document.createElement("option");
      option.value = value; option.textContent = label; this.inputEl.appendChild(option); return this;
    }
    onChange(callback: (value: string) => Promise<void>) {
      this.inputEl.oninput = () => callback(this.inputEl.value); return this;
    }
  }
  class Setting {
    settingEl: HTMLDivElement;
    descEl: HTMLDivElement;
    constructor(parent: HTMLElement) {
      this.settingEl = parent.createDiv({ cls: "setting-item" });
      this.descEl = this.settingEl.createDiv({ cls: "setting-item-description" });
    }
    setName(name: string) { this.settingEl.setAttr("data-name", name); return this; }
    setDesc(desc: string) { this.descEl.textContent = desc; return this; }
    setHeading() { return this; }
    addText(callback: (control: Control) => void) { callback(new Control(this.settingEl.createEl("input"))); return this; }
    addTextArea(callback: (control: Control) => void) { callback(new Control(this.settingEl.createEl("textarea"))); return this; }
    addDropdown(callback: (control: Control) => void) { callback(new Control(this.settingEl.createEl("select"))); return this; }
    addToggle(callback: (control: Control) => void) { return this.addText(callback); }
  }
  return { ...original, Setting, Modal: class {}, PluginSettingTab: class { containerEl = document.createElement("div"); } };
});

beforeAll(installDomHelpers);

const setup = () => {
  const settings = { ...DEFAULT_SETTINGS, categories: ["Groceries", "Shopping", "Income", "Transfer", "Investments"], categoryBudgets: { Groceries: 100 } };
  const saved: unknown[] = [];
  const plugin = { settings, saveSettings: vi.fn(async () => { saved.push(JSON.parse(JSON.stringify(settings))); }) };
  const tab = new MoneySettingTab({} as never, plugin as never);
  tab.display();
  const input = (name: string) => tab.containerEl.querySelector(`input[aria-label="${name} monthly budget"]`) as HTMLInputElement;
  return { settings, plugin, saved, tab, input };
};

const change = async (input: HTMLInputElement | HTMLTextAreaElement, value: string) => {
  input.value = value;
  await (input.oninput as () => unknown)();
};

describe("monthly budget settings", () => {
  it("saves decimal limits, preserves other budgets, and clears limits", async () => {
    const { settings, saved, input } = setup();
    expect(input("Groceries").value).toBe("100");
    expect(input("Shopping").value).toBe("");
    expect(input("Income")).toBeNull();
    expect(input("Transfer")).toBeNull();
    expect(input("Investments")).toBeNull();
    await change(input("Shopping"), "2500.50");
    expect(saved[0]).toMatchObject({ categoryBudgets: { Groceries: 100, Shopping: 2500.5 } });
    await change(input("Groceries"), "0");
    expect(settings.categoryBudgets).toEqual({ Groceries: 0, Shopping: 2500.5 });
    await change(input("Groceries"), "");
    expect(settings.categoryBudgets).toEqual({ Shopping: 2500.5 });
  });

  it("keeps saved limits on invalid input and shows a validation message", async () => {
    const { settings, plugin, input } = setup();
    await change(input("Groceries"), "-1");
    expect(settings.categoryBudgets.Groceries).toBe(100);
    expect(plugin.saveSettings).not.toHaveBeenCalled();
    expect(input("Groceries").getAttribute("aria-invalid")).toBe("true");
    expect(input("Groceries").parentElement!.textContent).toContain("saved budget has not changed");
    await change(input("Groceries"), "150");
    expect(input("Groceries").hasAttribute("aria-invalid")).toBe(false);
    expect(settings.categoryBudgets.Groceries).toBe(150);
  });

  it("updates budget fields when categories change and keeps removed budgets editable", async () => {
    const { tab, input } = setup();
    await change(tab.containerEl.querySelector("textarea")!, "Dining\nIncome\nTransfer\nInvestments");
    expect(input("Dining")).not.toBeNull();
    expect(input("Shopping")).toBeNull();
    expect(input("Groceries").value).toBe("100");
    await change(tab.containerEl.querySelector('[data-name="Income category"] input') as HTMLInputElement, "Dining");
    expect(input("Dining")).toBeNull();
    expect(input("Income")).not.toBeNull();
  });
});

describe("budget persistence", () => {
  it("loads older settings without budgets and keeps defaults isolated", async () => {
    const plugin = new MoneyDashboardPlugin();
    plugin.loadData = vi.fn(async () => ({ currency: "$" }));
    await plugin.loadSettings();
    expect(plugin.settings.currency).toBe("$");
    expect(plugin.settings.categoryBudgets).toEqual({});
    plugin.settings.categoryBudgets.Groceries = 50;
    expect(DEFAULT_SETTINGS.categoryBudgets).toEqual({});
  });

  it("reloads saved budgets and schedules dashboard refreshes after saving", async () => {
    const plugin = new MoneyDashboardPlugin();
    plugin.loadData = vi.fn(async () => ({ categoryBudgets: { Groceries: 1250.5, Shopping: 0 } }));
    await plugin.loadSettings();
    expect(plugin.settings.categoryBudgets).toEqual({ Groceries: 1250.5, Shopping: 0 });
    plugin.saveData = vi.fn(async () => {});
    const block = { schedule: vi.fn() };
    plugin.blocks.add(block as never);
    await plugin.saveSettings();
    expect(plugin.saveData).toHaveBeenCalledWith(plugin.settings);
    expect(block.schedule).toHaveBeenCalledOnce();
  });
});
