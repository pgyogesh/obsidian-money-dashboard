import { str } from "./str";

// The Location cell is usually a Maps link built from street, town and
// county, so a missing street leaves a LEADING COMMA: "[, Pune, MH](...)".

/** Label and link for a table cell. Only an http(s) link is kept. */
export const locParts = (cell: unknown): { label: string; url: string } | null => {
  const s = str(cell).trim();
  if (!s || s === "-") return null;
  const m = /^\[([^\]]*)\]\(([^)]*)\)$/.exec(s);
  const label = (m ? m[1] : s).replace(/^[,\s]+/, "").replace(/\s*,\s*/g, ", ").trim();
  const url = m && /^https?:/.test(m[2]) ? m[2] : "";
  return label ? { label, url } : null;
};

export interface Place { lat: number | null; lng: number | null; label: string }

/**
 * Coordinates for the map. The link already carries them (ll, sll or q), so
 * nothing is geocoded. A bare place name keeps its label with no coordinates.
 */
export const parseLoc = (cell: unknown): Place | null => {
  const s = str(cell).trim();
  if (!s || s === "-") return null;
  const label = (/^\[([^\]]*)\]/.exec(s)?.[1] ?? s).replace(/^[,\s]+/, "").trim();
  const ll = /[?&](?:ll|sll|q)=(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/.exec(s);
  if (ll) return { lat: +ll[1], lng: +ll[2], label: label || s };
  const bare = /^(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)$/.exec(s);
  if (bare) return { lat: +bare[1], lng: +bare[2], label: label || s };
  return { lat: null, lng: null, label: label || s };
};
