/** The part of a vault file the loaders need. TFile satisfies it. */
export interface FileLike {
  path: string;
  basename: string;
}

/** The vault calls the loaders make, so a fake vault can test them. */
export interface VaultLike {
  files(): FileLike[];
  read(f: FileLike): Promise<string>;
  frontmatter(f: FileLike): Record<string, unknown> | null;
}
