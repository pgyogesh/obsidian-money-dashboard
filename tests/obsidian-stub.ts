import moment from "moment";
export { moment };

// Just enough of the Obsidian API for the renderers to run in tests.
export class TFile {
  path: string; basename: string; extension = "md";
  constructor(path: string) { this.path = path; this.basename = path.split("/").pop()!.replace(/\.md$/, ""); }
}
export const Platform = { isMobile: false };
export class Component {}
export class MarkdownRenderChild extends Component {}
export class Notice {}
export class Plugin {}
export class PluginSettingTab {}
export class Setting {}
export const normalizePath = (p: string) => p;
