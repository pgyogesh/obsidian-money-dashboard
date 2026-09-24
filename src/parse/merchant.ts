// Merchant names come from SMS text, so one shop arrives as "Zomato",
// "zomato" and "ZOMATO". Every merchant is folded onto a case-insensitive key
// and relabelled with ONE spelling: the best-cased variant first, then the
// most frequent, then alphabetical. Display and grouping only: the file is
// never rewritten.
//
// Prefix folding ("ZOMATO CYBS" into "Zomato") is deliberately not done. It
// cannot tell a gateway suffix from a real product such as "Zomato Gold".

const mKey = (s: string) => String(s ?? "").trim().replace(/\s+/g, " ").toLowerCase();

const caseRank = (s: string) => {
  const upper = /[A-Z]/.test(s), lower = /[a-z]/.test(s);
  if (upper && lower) return 0; // Mixed Case, best
  if (lower) return 1;
  return 2; // ALL CAPS, shouting
};

export const applyCanonicalMerchants = (items: { merchant: string }[]): Map<string, string> => {
  const variants = new Map<string, Map<string, number>>();
  for (const it of items) {
    const k = mKey(it.merchant);
    if (!k) continue;
    if (!variants.has(k)) variants.set(k, new Map());
    const tidy = String(it.merchant).trim().replace(/\s+/g, " ");
    const v = variants.get(k)!;
    v.set(tidy, (v.get(tidy) ?? 0) + 1);
  }
  const canonical = new Map<string, string>();
  for (const [k, v] of variants) {
    canonical.set(k, [...v.entries()].sort((a, b) =>
      caseRank(a[0]) - caseRank(b[0]) || b[1] - a[1] || a[0].localeCompare(b[0]))[0][0]);
  }
  for (const it of items) {
    const k = mKey(it.merchant);
    if (k && canonical.has(k)) it.merchant = canonical.get(k)!;
  }
  return canonical;
};
