import { moment } from "obsidian";
import { parseLoc, type Place } from "../parse/location";
import { categoryKind } from "../parse/summary";
import { findInbox, loadPool } from "../vault/load";
import { obsidianVault } from "../vault/obsidian";
import { catSlug, colorForCategory, plural, type RenderCtx } from "./common";

// Every located transaction, all months, as a heatmap on a pannable map.
//
// The heat is a true accumulating kernel: each place paints a radial alpha
// gradient into an offscreen canvas, the alphas add up where places overlap,
// and the result is mapped through a colour ramp. The kernel is measured in
// SCREEN pixels, so the blur stays constant as you zoom.
//
// Heat is weighted by AMOUNT, not by count. One large purchase burns hotter
// than ten small ones.

const TILE = 256;
const worldX = (lng: number, z: number) => ((lng + 180) / 360) * Math.pow(2, z) * TILE;
const worldY = (lat: number, z: number) => {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * Math.pow(2, z) * TILE;
};

// Group by LABEL first, then by proximity, so jitter from one doorway merges
// but two differently named places never do.
const CLUSTER_M = 150;
const metresBetween = (aLat: number, aLng: number, bLat: number, bLng: number) => {
  const dy = (aLat - bLat) * 111320;
  const dx = (aLng - bLng) * 111320 * Math.cos((((aLat + bLat) / 2) * Math.PI) / 180);
  return Math.hypot(dx, dy);
};

// Heat is each place's share of the biggest, compressed by a gamma so a heavy
// tail stays readable. It is monotonic, so a bigger spend is always hotter.
const GAMMA = 0.35;
const FLOOR = 0.10;
const KERNEL = 38; // heat radius in screen pixels
const MINZ = 3, MAXZ = 18;
const ROW_CAP = 25;

interface Spot {
  label: string; reads: [number, number][]; total: number; count: number;
  cats: Map<string, { amount: number; count: number }>; first: string; last: string;
  lat: number; lng: number;
}

const buildLut = (): Uint8ClampedArray => {
  const g = createEl("canvas");
  g.width = 256; g.height = 1;
  const gx = g.getContext("2d")!;
  const grad = gx.createLinearGradient(0, 0, 256, 0);
  grad.addColorStop(0.00, "#2c3d8f");
  grad.addColorStop(0.25, "#1f8fc4");
  grad.addColorStop(0.45, "#3fb878");
  grad.addColorStop(0.62, "#e9d34a");
  grad.addColorStop(0.80, "#ef8c3b");
  grad.addColorStop(1.00, "#d6335a");
  gx.fillStyle = grad;
  gx.fillRect(0, 0, 256, 1);
  return gx.getImageData(0, 0, 256, 1).data;
};

const px = (n: number) => `${n}px`;

export const renderMap = async (ctx: RenderCtx, el: HTMLElement): Promise<void> => {
  const { app, fmt, cats, settings } = ctx;
  const v = obsidianVault(app);
  const [pool, inbox] = await Promise.all([loadPool(v, moment()), findInbox(v)]);
  const root = el.createDiv({ cls: "wd-money-root" });
  ctx.watch(inbox?.file.path);

  const rows = pool.filter((t) => categoryKind(t.category, cats) === "spend")
    .map((t) => ({ when: t.date, category: t.category, amount: t.amount, loc: parseLoc(t.location) }));
  const located = rows.filter((r): r is typeof r & { loc: Place } => !!r.loc);
  const withCoords = located.filter((r) => r.loc.lat != null && r.loc.lng != null);
  const nameOnly = located.filter((r) => r.loc.lat == null);

  if (!withCoords.length) {
    const box = root.createDiv({ cls: "wd-money-empty" });
    box.createDiv({ cls: "wd-money-empty-title", text: "No coordinates yet" });
    box.createDiv({
      text: inbox || rows.length
        ? `Read ${plural(rows.length, "transaction")}, but none carry coordinates in the Location column yet.`
        : "Could not find the inbox. It is the note holding the money:inbox:start marker.",
    });
    if (nameOnly.length) {
      box.createDiv({ text: `${nameOnly.length} ${nameOnly.length === 1 ? "row has" : "rows have"} a place name with no coordinates: ${[...new Set(nameOnly.map((r) => r.loc.label))].slice(0, 6).join(", ")}.` });
    }
    return;
  }

  // --- Places ----------------------------------------------------------------
  const spots: Spot[] = [];
  for (const r of withCoords) {
    const lat = r.loc.lat!, lng = r.loc.lng!;
    let s = spots.find((x) => x.label === r.loc.label && x.reads.some((q) => metresBetween(lat, lng, q[0], q[1]) <= CLUSTER_M));
    if (!s) {
      s = { label: r.loc.label, reads: [], total: 0, count: 0, cats: new Map(), first: r.when, last: r.when, lat: 0, lng: 0 };
      spots.push(s);
    }
    s.reads.push([lat, lng]);
    s.total += r.amount;
    s.count += 1;
    const e = s.cats.get(r.category) ?? { amount: 0, count: 0 };
    e.amount += r.amount; e.count += 1;
    s.cats.set(r.category, e);
    if (r.when < s.first) s.first = r.when;
    if (r.when > s.last) s.last = r.when;
  }
  for (const s of spots) {
    s.lat = s.reads.reduce((a, q) => a + q[0], 0) / s.reads.length;
    s.lng = s.reads.reduce((a, q) => a + q[1], 0) / s.reads.length;
  }
  const pts = spots.filter((s) => s.total > 0);
  if (!pts.length) {
    root.createDiv({ cls: "wd-money-empty", text: "Every located place nets to zero or less after refunds, so there is nothing to heat." });
    return;
  }
  const totalSpend = pts.reduce((a, s) => a + s.total, 0);
  const maxTotal = Math.max(...pts.map((s) => s.total));
  const heatOf = (total: number) => Math.max(FLOOR, Math.min(1, Math.pow(total / maxTotal, GAMMA)));

  // --- Shell -------------------------------------------------------------------
  const wrap = root.createDiv({ cls: `wd-hmap${settings.mapTiles ? "" : " is-tileless"}` });
  const tileLayer = wrap.createDiv({ cls: "wd-hmap-tiles" });
  const canvas = wrap.createEl("canvas", { cls: "wd-hmap-heat" });
  const hit = wrap.createDiv({ cls: "wd-hmap-hit" });
  const tip = wrap.createDiv({ cls: "wd-hmap-tip is-hidden" });
  const ctrl = wrap.createDiv({ cls: "wd-hmap-ctrl" });
  const bIn = ctrl.createEl("button", { cls: "wd-hmap-btn", text: "+", attr: { title: "Zoom in" } });
  const bOut = ctrl.createEl("button", { cls: "wd-hmap-btn", text: "−", attr: { title: "Zoom out" } });
  const bFit = ctrl.createEl("button", { cls: "wd-hmap-btn wd-hmap-btn-wide", text: "Fit", attr: { title: "Frame every place" } });
  if (settings.mapTiles) wrap.createDiv({ cls: "wd-hmap-attr", text: "© OpenStreetMap contributors" });
  const zoomLabel = wrap.createDiv({ cls: "wd-hmap-zoom" });
  wrap.createDiv({ cls: "wd-hmap-fade" });
  const hero = wrap.createDiv({ cls: "wd-hmap-hero" });
  const heroAmt = hero.createDiv({ cls: "wd-hmap-hero-amt" });
  const heroSub = hero.createDiv({ cls: "wd-hmap-hero-sub" });

  const legend = root.createDiv({ cls: "wd-hmap-legend" });
  legend.createSpan({ cls: "wd-hmap-legend-cap", text: "Less spend" });
  legend.createDiv({ cls: "wd-hmap-legend-bar" });
  legend.createSpan({ cls: "wd-hmap-legend-cap", text: fmt.short(maxTotal) });
  legend.createSpan({ cls: "wd-hmap-legend-sum", text: `${plural(withCoords.length, "transaction")} · ${plural(pts.length, "place")} · ${fmt.whole(totalSpend)}` });
  const below = root.createDiv({ cls: "wd-map-below" });

  const LUT = buildLut();

  // --- View state ----------------------------------------------------------------
  // The origin is the world-pixel coordinate of the top-left corner at zoom z.
  const view = (ctx.state.mapView as { z: number; ox: number; oy: number } | undefined);
  let z = view?.z ?? 13, ox = view?.ox ?? 0, oy = view?.oy ?? 0, W = 0, H = 0;
  const remember = () => { ctx.state.mapView = { z, ox, oy }; };

  const fit = () => {
    W = wrap.clientWidth || 640;
    H = wrap.clientHeight || 460;
    const lats = pts.map((p) => p.lat), lngs = pts.map((p) => p.lng);
    const n = Math.max(...lats), s = Math.min(...lats), e = Math.max(...lngs), w = Math.min(...lngs);
    const pad = KERNEL + 12;
    let best = MINZ;
    for (let t = MAXZ; t >= MINZ; t--) {
      const dx = Math.abs(worldX(e, t) - worldX(w, t));
      const dy = Math.abs(worldY(s, t) - worldY(n, t));
      if (dx <= W - 2 * pad && dy <= H - 2 * pad) { best = t; break; }
    }
    z = best;
    ox = (worldX(w, z) + worldX(e, z)) / 2 - W / 2;
    oy = (worldY(n, z) + worldY(s, z)) / 2 - H / 2;
  };

  // --- Tiles -------------------------------------------------------------------
  // Cached by z/x/y, so panning moves existing images instead of refetching.
  const tiles = new Map<string, HTMLImageElement>();
  const clearTiles = () => { for (const [, img] of tiles) img.remove(); tiles.clear(); };
  const tileSrc = (tz: number, tx: number, ty: number) =>
    settings.tileUrl.replace("{z}", String(tz)).replace("{x}", String(tx)).replace("{y}", String(ty));
  const drawTiles = () => {
    if (!settings.mapTiles) return;
    const span = Math.pow(2, z);
    const x0 = Math.floor(ox / TILE), x1 = Math.floor((ox + W) / TILE);
    const y0 = Math.floor(oy / TILE), y1 = Math.floor((oy + H) / TILE);
    const live = new Set<string>();
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        if (y < 0 || y >= span) continue;
        const wx = ((x % span) + span) % span; // wrap the world horizontally
        const key = `${z}/${wx}/${y}@${x}`;
        live.add(key);
        let img = tiles.get(key);
        if (!img) {
          img = tileLayer.createEl("img", { cls: "wd-hmap-tile", attr: { src: tileSrc(z, wx, y), loading: "lazy", alt: "", draggable: "false" } });
          tiles.set(key, img);
        }
        img.setCssProps({ "--x": px(x * TILE - ox), "--y": px(y * TILE - oy) });
      }
    }
    for (const [k, img] of tiles) if (!live.has(k)) { img.remove(); tiles.delete(k); }
  };

  // --- Heat ----------------------------------------------------------------------
  const shadow = createEl("canvas");
  const sctx = shadow.getContext("2d", { willReadFrequently: true })!;
  const hctx = canvas.getContext("2d")!;
  const drawHeat = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    for (const c of [canvas, shadow]) { c.width = W * dpr; c.height = H * dpr; }
    canvas.setCssProps({ "--w": px(W), "--h": px(H) });
    sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    sctx.clearRect(0, 0, W, H);
    let painted = 0;
    for (const p of pts) {
      const x = worldX(p.lng, z) - ox, y = worldY(p.lat, z) - oy;
      if (x < -KERNEL || y < -KERNEL || x > W + KERNEL || y > H + KERNEL) continue;
      sctx.globalAlpha = heatOf(p.total);
      const g = sctx.createRadialGradient(x, y, 0, x, y, KERNEL);
      g.addColorStop(0, "rgba(0,0,0,1)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      sctx.fillStyle = g;
      sctx.beginPath();
      sctx.arc(x, y, KERNEL, 0, Math.PI * 2);
      sctx.fill();
      painted++;
    }
    sctx.globalAlpha = 1;
    hctx.setTransform(1, 0, 0, 1, 0, 0);
    if (!painted || !shadow.width || !shadow.height) { hctx.clearRect(0, 0, canvas.width, canvas.height); return; }
    const img = sctx.getImageData(0, 0, shadow.width, shadow.height);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const a = d[i + 3];
      if (!a) continue;
      const j = a * 4;
      d[i] = LUT[j]; d[i + 1] = LUT[j + 1]; d[i + 2] = LUT[j + 2];
      // Fade the coldest tail out, or the whole map sits under a blue film.
      d[i + 3] = a < 28 ? a * 2.4 : Math.min(232, a + 40);
    }
    hctx.putImageData(img, 0, 0);
  };

  let drawPlaces: (() => void) | null = null;
  const render = () => {
    W = wrap.clientWidth || W || 640;
    H = wrap.clientHeight || H || 460;
    drawTiles();
    drawHeat();
    zoomLabel.setText(`zoom ${z}`);
    bIn.disabled = z >= MAXZ;
    bOut.disabled = z <= MINZ;
    remember();
    if (drawPlaces) drawPlaces();
  };

  // --- Zoom, anchored on a point ---------------------------------------------
  const zoomTo = (nz: number, ax: number, ay: number) => {
    nz = Math.max(MINZ, Math.min(MAXZ, nz));
    if (nz === z) return;
    const k = Math.pow(2, nz - z);
    ox = (ox + ax) * k - ax;
    oy = (oy + ay) * k - ay;
    z = nz;
    clearTiles();
    render();
  };
  const refit = () => { clearTiles(); fit(); render(); };
  bIn.onclick = () => zoomTo(z + 1, W / 2, H / 2);
  bOut.onclick = () => zoomTo(z - 1, W / 2, H / 2);
  bFit.onclick = refit;

  hit.addEventListener("wheel", (ev) => {
    ev.preventDefault();
    const r = wrap.getBoundingClientRect();
    zoomTo(z + (ev.deltaY < 0 ? 1 : -1), ev.clientX - r.left, ev.clientY - r.top);
  }, { passive: false });

  // --- Pan and the hover tooltip ---------------------------------------------
  let drag: { x: number; y: number } | null = null;
  const hideTip = () => tip.addClass("is-hidden");
  hit.addEventListener("pointerdown", (ev) => {
    if (ev.isPrimary === false) return;
    drag = { x: ev.clientX, y: ev.clientY };
    hit.setPointerCapture(ev.pointerId);
    wrap.addClass("is-dragging");
  });
  hit.addEventListener("pointermove", (ev) => {
    if (drag) {
      ox -= ev.clientX - drag.x; oy -= ev.clientY - drag.y;
      drag = { x: ev.clientX, y: ev.clientY };
      render();
      hideTip();
      return;
    }
    const r = wrap.getBoundingClientRect();
    const mx = ev.clientX - r.left, my = ev.clientY - r.top;
    let near: Spot | null = null, best = KERNEL * KERNEL;
    for (const p of pts) {
      const dx = worldX(p.lng, z) - ox - mx, dy = worldY(p.lat, z) - oy - my;
      const d2 = dx * dx + dy * dy;
      if (d2 < best) { best = d2; near = p; }
    }
    if (!near) { hideTip(); return; }
    const top = [...near.cats.entries()].sort((a, b) => b[1].amount - a[1].amount)[0];
    tip.empty();
    tip.createDiv({ cls: "wd-hmap-tip-name", text: near.label });
    tip.createDiv({ cls: "wd-hmap-tip-amt", text: fmt.whole(near.total) });
    tip.createDiv({ cls: "wd-hmap-tip-sub", text: `${plural(near.count, "transaction")} · mostly ${top ? top[0] : "n/a"}` });
    tip.createDiv({ cls: "wd-hmap-tip-sub", text: `${near.first.slice(0, 10)} to ${near.last.slice(0, 10)}` });
    tip.removeClass("is-hidden");
    const tw = tip.offsetWidth || 180, th = tip.offsetHeight || 70;
    tip.setCssProps({ "--x": px(Math.max(4, Math.min(W - tw - 4, mx + 14))), "--y": px(Math.max(4, Math.min(H - th - 4, my + 14))) });
  });
  const endDrag = () => { drag = null; wrap.removeClass("is-dragging"); };
  hit.addEventListener("pointerup", endDrag);
  hit.addEventListener("pointercancel", endDrag);
  hit.addEventListener("pointerleave", () => { endDrag(); hideTip(); });
  hit.addEventListener("dblclick", (ev) => {
    const r = wrap.getBoundingClientRect();
    zoomTo(z + 1, ev.clientX - r.left, ev.clientY - r.top);
  });

  // Pinch to zoom, the only way to zoom a map on a phone.
  let pinch: { d: number; z: number } | null = null;
  hit.addEventListener("touchstart", (ev) => {
    if (ev.touches.length !== 2) return;
    const [a, b] = [ev.touches[0], ev.touches[1]];
    pinch = { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), z };
  }, { passive: true });
  hit.addEventListener("touchmove", (ev) => {
    if (!pinch || ev.touches.length !== 2) return;
    ev.preventDefault();
    const [a, b] = [ev.touches[0], ev.touches[1]];
    const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    const r = wrap.getBoundingClientRect();
    zoomTo(Math.round(pinch.z + Math.log2(d / pinch.d)), (a.clientX + b.clientX) / 2 - r.left, (a.clientY + b.clientY) / 2 - r.top);
  }, { passive: false });
  hit.addEventListener("touchend", () => { pinch = null; }, { passive: true });

  // --- Places in view --------------------------------------------------------
  // The table follows the map: zoom or pan and it lists only what is on screen.
  const tp = below.createDiv({ cls: "wd-money-panel wd-map-places" });
  const tph = tp.createDiv({ cls: "wd-money-panel-head" });
  tph.createSpan({ cls: "wd-money-panel-title", text: "Places in view" });
  const tpNote = tph.createSpan({ cls: "wd-money-panel-note" });
  const tpAll = tph.createEl("a", { cls: "wd-money-link", text: "Show all →", href: "#", attr: { title: "Reframe the map on every place" } });
  tpAll.onclick = (ev) => { ev.preventDefault(); refit(); };
  const tbl = tp.createEl("table", { cls: "wd-money-table" });
  const thead = tbl.createEl("thead").createEl("tr");
  for (const h of ["", "Place", "Spend", "Share", "Txns", "Mostly", "Last seen"]) {
    const th = thead.createEl("th", { cls: h === "" ? "wd-swatch-col" : "", text: h });
    if (h === "Txns") th.setAttr("title", "Transactions at this place, across every category");
    if (h === "Mostly") th.setAttr("title", "The largest category here by amount, with its share. Hover a cell for the full mix.");
  }
  const tbody = tbl.createEl("tbody");
  const tpFoot = tp.createDiv({ cls: "wd-money-foot" });

  const cp = below.createDiv({ cls: "wd-money-panel wd-map-cats" });
  const cph = cp.createDiv({ cls: "wd-money-panel-head" });
  cph.createSpan({ cls: "wd-money-panel-title", text: "Categories in view" });
  const cpNote = cph.createSpan({ cls: "wd-money-panel-note" });
  const cpBody = cp.createDiv({ cls: "wd-money-bars" });

  const inView = () => pts.filter((p) => {
    const x = worldX(p.lng, z) - ox, y = worldY(p.lat, z) - oy;
    return x >= -KERNEL && y >= -KERNEL && x <= W + KERNEL && y <= H + KERNEL;
  }).sort((a, b) => b.total - a.total);

  // Rebuilt only when the visible set changes, not on every pointer move.
  let lastSig: string | null = null;
  drawPlaces = () => {
    const list = inView();
    const sig = z + "|" + list.map((p) => p.lat.toFixed(4) + "," + p.lng.toFixed(4)).join(";");
    if (sig === lastSig) return;
    lastSig = sig;

    tbody.empty();
    const shown = list.slice(0, ROW_CAP);
    const viewTotal = list.reduce((a, p) => a + p.total, 0);
    const viewTxns = list.reduce((a, p) => a + p.count, 0);
    for (const p of shown) {
      const tr = tbody.createEl("tr", { cls: "wd-money-clickable" });
      const idx = Math.max(0, Math.min(255, Math.round(heatOf(p.total) * 255)));
      tr.createEl("td", { cls: "wd-swatch-col" }).createSpan({ cls: "wd-swatch" })
        .setCssProps({ "--swatch": `rgb(${LUT[idx * 4]}, ${LUT[idx * 4 + 1]}, ${LUT[idx * 4 + 2]})` });
      tr.createEl("td", { cls: "is-place", text: p.label });
      tr.createEl("td", { cls: "wd-money-num is-spend", text: fmt.whole(p.total) })
        .setCssProps({ "--bar": (viewTotal ? (p.total / viewTotal) * 100 : 0).toFixed(1) + "%" });
      tr.createEl("td", { cls: "wd-money-num", text: viewTotal ? ((p.total / viewTotal) * 100).toFixed(1) + "%" : "0.0%" });
      tr.createEl("td", { cls: "wd-money-num", text: String(p.count) });
      const ranked = [...p.cats.entries()].sort((a, b) => b[1].amount - a[1].amount);
      const cell = tr.createEl("td", { cls: "is-mostly" });
      const top = ranked[0];
      if (top) {
        cell.createSpan({ cls: "wd-money-tag", text: top[0] }).setCssProps({ "--bar-color": colorForCategory(top[0]) });
        cell.createSpan({ cls: "wd-mostly-share", text: fmt.pct(top[1].amount, p.total) });
        if (ranked.length > 1) cell.createSpan({ cls: "wd-mostly-more", text: `+${ranked.length - 1}` });
        cell.setAttr("title", ranked.map(([cat, e]) => `${cat}: ${fmt.whole(e.amount)} (${e.count} txn)`).join("\n"));
      }
      tr.createEl("td", { text: p.last.slice(0, 10) });
      tr.onclick = () => {
        clearTiles();
        z = Math.max(z, 15);
        ox = worldX(p.lng, z) - W / 2;
        oy = worldY(p.lat, z) - H / 2;
        render();
        wrap.scrollIntoView({ block: "center", behavior: "smooth" });
      };
    }
    if (!list.length) {
      tbody.createEl("tr").createEl("td", { cls: "is-empty-row", text: "Nothing in view. Zoom out, or press fit.", attr: { colspan: "7" } });
    }

    const fmtKey = (k: string) => moment(k, "YYYY-MM").format("MMM ’YY");
    const f = list.length ? list.reduce((a, p) => (p.first < a ? p.first : a), list[0].first).slice(0, 7) : "";
    const l = list.length ? list.reduce((a, p) => (p.last > a ? p.last : a), list[0].last).slice(0, 7) : "";
    const span = list.length ? (f === l ? fmtKey(f) : `${fmtKey(f)} to ${fmtKey(l)}`) : "";
    heroAmt.setText(list.length ? fmt.whole(viewTotal) : "n/a");
    heroSub.setText(list.length
      ? `${list.length === pts.length ? "all located spend" : "in view"} · ${plural(viewTxns, "transaction")} · ${plural(list.length, "place")} · ${span}`
      : "nothing in view");

    cpBody.empty();
    const byCat = new Map<string, number>();
    for (const p of list) for (const [cat, e] of p.cats) byCat.set(cat, (byCat.get(cat) ?? 0) + e.amount);
    const catRows = [...byCat.entries()].filter(([, x]) => x > 0).sort((a, b) => b[1] - a[1]);
    const catTop = catRows.length ? catRows[0][1] : 0;
    for (const [cat, amt] of catRows.slice(0, 10)) {
      const rowEl = cpBody.createDiv({ cls: `wd-money-row wd-cat-${catSlug(cat)}` });
      rowEl.setCssProps({ "--bar-color": colorForCategory(cat), "--bar-width": (catTop ? (amt / catTop) * 100 : 0).toFixed(1) + "%" });
      rowEl.createDiv({ cls: "wd-money-name", text: cat, attr: { title: cat } });
      rowEl.createDiv({ cls: "wd-money-track" }).createDiv({ cls: "wd-money-fill" });
      rowEl.createDiv({ cls: "wd-money-amt", text: fmt.whole(amt) });
    }
    if (!catRows.length) cpBody.createDiv({ cls: "wd-money-foot", text: "Nothing in view." });
    cpNote.setText(catRows.length ? plural(catRows.length, "category", "categories") : "");
    tpNote.setText(list.length === pts.length ? `all ${plural(pts.length, "place")}` : `${list.length} of ${plural(pts.length, "place")}`);
    tpAll.toggleClass("is-hidden", list.length === pts.length);

    const parts = [];
    if (list.length) {
      parts.push(`${fmt.whole(viewTotal)} across ${plural(viewTxns, "transaction")} in view`);
      if (viewTotal !== totalSpend) parts.push(`${fmt.pct(viewTotal, totalSpend)} of all located spend`);
    }
    if (shown.length < list.length) parts.push(`showing the top ${ROW_CAP}`);
    tpFoot.setText(parts.join(" · "));
  };

  if (nameOnly.length) {
    const names = [...new Set(nameOnly.map((r) => r.loc.label))];
    tp.createDiv({ cls: "wd-money-foot", text: `${nameOnly.length} ${nameOnly.length === 1 ? "row has" : "rows have"} a place name but no coordinates, so ${nameOnly.length === 1 ? "it is" : "they are"} not on the map: ${names.slice(0, 6).join(", ")}.` });
  }
  tp.createDiv({ cls: "wd-money-foot", text: `Heat is weighted by amount, not by number of transactions. Full heat is ${fmt.whole(maxTotal)}, the hottest place, and the scale is compressed so smaller places stay readable beside a large one.` });

  // --- Go ----------------------------------------------------------------------
  // The block has no width on the first pass, so the first fit waits a frame.
  const raf = window.requestAnimationFrame(() => { if (!view) fit(); render(); });
  const ro = new ResizeObserver(() => {
    if (!wrap.clientWidth) return;
    const nw = wrap.clientWidth, nh = wrap.clientHeight;
    if (nw === W && nh === H) return;
    ox += (W - nw) / 2; oy += (H - nh) / 2; // keep the centre, not the corner
    W = nw; H = nh;
    render();
  });
  ro.observe(wrap);
  ctx.onCleanup(() => { window.cancelAnimationFrame(raf); ro.disconnect(); clearTiles(); });
};
