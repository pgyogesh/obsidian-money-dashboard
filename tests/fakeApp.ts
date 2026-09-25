import { TFile } from "obsidian";

/**
 * An in-memory Obsidian app: markdown files, frontmatter parsed from the
 * file text by a tiny YAML reader good enough for the money block, and the
 * adapter calls archiving uses.
 */
export const fakeApp = (files: Record<string, string>) => {
  const store: Record<string, string> = { ...files };
  const hidden: Record<string, string> = {};
  const folders = new Set<string>();
  const fm: Record<string, Record<string, unknown>> = {};
  const opened: string[] = [];
  const onWrite: ((path: string) => void)[] = [];
  const file = (p: string) => new TFile(p);
  const app = {
    vault: {
      getMarkdownFiles: () => Object.keys(store).map(file),
      getFiles: () => Object.keys(store).map(file),
      cachedRead: async (f: TFile) => store[f.path],
      read: async (f: TFile) => store[f.path],
      getAbstractFileByPath: (p: string) => (store[p] != null ? file(p) : folders.has(p) ? { path: p } : null),
      process: async (f: TFile, fn: (d: string) => string) => {
        store[f.path] = fn(store[f.path]);
        onWrite.forEach((cb) => cb(f.path));
        return store[f.path];
      },
      create: async (p: string, data: string) => {
        if (store[p] != null) throw new Error(`File already exists: ${p}`);
        store[p] = data;
        return file(p);
      },
      createFolder: async (p: string) => { folders.add(p); },
      adapter: {
        exists: async (p: string) => folders.has(p) || store[p] != null || hidden[p] != null,
        mkdir: async (p: string) => { folders.add(p); },
        write: async (p: string, d: string) => { hidden[p] = d; },
        read: async (p: string) => { if (hidden[p] == null) throw new Error(`no file ${p}`); return hidden[p]; },
      },
    },
    fileManager: {
      processFrontMatter: async (f: TFile, fn: (fm: Record<string, unknown>) => void) => {
        const cur = fm[f.path] ?? {};
        fn(cur);
        fm[f.path] = cur;
      },
    },
    metadataCache: {
      getFileCache: (f: TFile) => (fm[f.path] ? { frontmatter: fm[f.path] } : null),
    },
    workspace: { openLinkText: async (p: string) => { opened.push(p); } },
  };
  return { app, store, hidden, folders, fm, opened, onWrite };
};
