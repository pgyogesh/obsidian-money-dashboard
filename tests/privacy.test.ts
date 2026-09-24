import { execSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { describe, expect, it } from "vitest";

// Every file git would publish: tracked, plus new files not ignored.
const files = execSync("git ls-files --cached --others --exclude-standard", { encoding: "utf8" })
  .split("\n").filter((f) => f && existsSync(f) && !/\.(png|jpg|gif|ico)$/i.test(f));

// Personal terms live in a git-ignored file, so the terms themselves are
// never committed. One term per line; lines starting with # are comments.
const DENY = "privacy-denylist.txt";
const terms = existsSync(DENY)
  ? readFileSync(DENY, "utf8").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"))
  : [];

const EM_DASH = String.fromCharCode(0x2014);

describe("privacy", () => {
  it("has no personal terms in any published file", () => {
    const hits: string[] = [];
    for (const f of files) {
      const text = readFileSync(f, "utf8").toLowerCase();
      for (const t of terms) if (text.includes(t.toLowerCase())) hits.push(`${f}: ${t}`);
    }
    expect(hits).toEqual([]);
  });

  it("has no em-dash in any published file", () => {
    const hits = files.filter((f) => readFileSync(f, "utf8").includes(EM_DASH));
    expect(hits).toEqual([]);
  });
});
