// Obsidian adds helpers to every DOM node. A test runs under jsdom, so add them.
type Opts = { cls?: string; text?: string; attr?: Record<string, string>; href?: string; value?: string };

export const installDomHelpers = () => {
  const P = HTMLElement.prototype as unknown as Record<string, unknown>;
  const addCls = (el: HTMLElement, cls?: string) => { for (const c of (cls ?? "").split(/\s+/).filter(Boolean)) el.classList.add(c); };
  P.createEl = function (this: HTMLElement, tag: string, o: Opts = {}) {
    const el = document.createElement(tag);
    addCls(el, o.cls);
    if (o.text != null) el.textContent = o.text;
    if (o.href != null) el.setAttribute("href", o.href);
    if (o.value != null) (el as HTMLInputElement).value = o.value;
    for (const [k, v] of Object.entries(o.attr ?? {})) el.setAttribute(k, v);
    this.appendChild(el);
    return el;
  };
  P.createDiv = function (this: HTMLElement, o?: Opts) { return (this as any).createEl("div", o); };
  P.createSpan = function (this: HTMLElement, o?: Opts) { return (this as any).createEl("span", o); };
  P.empty = function (this: HTMLElement) { while (this.firstChild) this.removeChild(this.firstChild); };
  P.setText = function (this: HTMLElement, t: string) { this.textContent = t; };
  P.setAttr = function (this: HTMLElement, k: string, v: string) { this.setAttribute(k, v); };
  P.addClass = function (this: HTMLElement, c: string) { this.classList.add(c); };
  P.addClasses = function (this: HTMLElement, c: string[]) { this.classList.add(...c); };
  P.removeClass = function (this: HTMLElement, c: string) { this.classList.remove(c); };
  P.toggleClass = function (this: HTMLElement, c: string, v: boolean) { this.classList.toggle(c, v); };
  P.setCssProps = function (this: HTMLElement, props: Record<string, string>) {
    for (const [k, v] of Object.entries(props)) this.style.setProperty(k, v);
  };
  (globalThis as any).createDiv = () => document.createElement("div");

  // A 2D context that records nothing, so the map can draw.
  const fake2d = new Proxy({}, {
    get: (_t, k) => {
      if (k === "getImageData") return (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(Math.max(1, w * h) * 4) });
      if (k === "createLinearGradient" || k === "createRadialGradient") return () => ({ addColorStop: () => {} });
      return () => {};
    },
    set: () => true,
  });
  (HTMLCanvasElement.prototype as any).getContext = () => fake2d;
  (globalThis as any).ResizeObserver = class { observe() {} disconnect() {} };
};
