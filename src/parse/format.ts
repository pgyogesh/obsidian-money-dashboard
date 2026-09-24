export type NumberStyle = "indian" | "international";

export interface MoneyFormat {
  currency: string;
  style: NumberStyle;
}

export interface Formatter {
  /** Rounded to the unit: ₹1,56,729 */
  whole(n: number): string;
  /** Two decimals: ₹1,234.50 */
  exact(n: number): string;
  /** Short scale for charts: ₹1.57L, $2.50M */
  short(n: number): string;
  /** Share of a whole, or "n/a" when the whole is not positive */
  pct(part: number, whole: number): string;
}

export const makeFormat = ({ currency, style }: MoneyFormat): Formatter => {
  const locale = style === "indian" ? "en-IN" : "en-US";
  const sign = (n: number) => (n < 0 ? "-" : "");
  // Indian short scale, because ₹1,56,729 reads slower than ₹1.57L on a chart.
  const scale: [number, string, number][] = style === "indian"
    ? [[1e7, "Cr", 2], [1e5, "L", 2], [1e3, "k", 1]]
    : [[1e9, "B", 2], [1e6, "M", 2], [1e3, "k", 1]];
  return {
    whole: (n) => sign(n) + currency + Math.round(Math.abs(n)).toLocaleString(locale),
    exact: (n) => sign(n) + currency + Math.abs(n).toLocaleString(locale,
      { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    short: (n) => {
      const a = Math.abs(n);
      for (const [at, suffix, dp] of scale) {
        if (a >= at) return `${sign(n)}${currency}${(a / at).toFixed(dp)}${suffix}`;
      }
      return `${sign(n)}${currency}${Math.round(a)}`;
    },
    pct: (part, whole) => (whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : "n/a"),
  };
};
