import { Component, h, icon, iconButton, keyed } from "./ui.mjs";

export default class Tabletop extends Component {
  constructor() {
    super("easel.layout.tabletop", "div");
    this.element.dataset.easelFill = "true";
    const make = (name, classes) => this.slot(name, h("div", { class: classes }));
    this.canvas = make("canvas", "ez-tt-canvas");
    this.top = make("top", "ez-tt-overlay ez-tt-top");
    this.rail = make("rail", "ez-tt-overlay ez-tt-rail");
    this.bottom = make("bottom", "ez-tt-overlay ez-tt-bottom");
    this.corner = make("corner", "ez-tt-overlay ez-tt-corner");
    this.status = make("status", "ez-tt-overlay ez-tt-status");
    this.side = make("sidebar", "ez-tt-side ez-glass");
    this.windows = make("windows", "ez-tt-windows");
    this.toggle = iconButton("sidebar", "Hide the sidebar", () => this.emit("sidebarToggle", { open: !this.open }), "ez-tt-sidetoggle ez-glass");
    this.toasts = h("div", { class: "ez-tt-overlay ez-tt-toasts", role: "status", "aria-live": "polite" });
    this.banner = h("div", { class: "ez-tt-banner", hidden: true });
    this.element.append(this.canvas, this.banner, this.top, this.rail, this.bottom, this.corner, this.status, this.side, this.toggle, this.windows, this.toasts);
    this.timers = new Map();
    this.observer = new ResizeObserver(() => this.measure());
    this.observer.observe(this.element);
  }

  render(props, previous) {
    this.open = props.sidebarOpen !== false;
    this.element.dataset.sidebar = this.open ? "open" : "closed";
    const width = Math.max(260, Math.min(520, Number(props.sidebarWidth) || 340));
    this.side.style.width = width + "px";
    this.element.style.setProperty("--ez-side", this.open ? width + "px" : "0px");
    this.toggle.title = this.open ? "Hide the sidebar" : "Show the sidebar";
    this.toggle.setAttribute("aria-label", this.toggle.title);
    this.toggle.setAttribute("aria-pressed", String(this.open));
    keyed(
      this.toasts,
      props.toasts || [],
      (toast) => toast.id,
      (toast) => {
        const kind = toast.kind || "info";
        const node = h("div", { class: "ez-toast ez-glass", dataset: { kind } }, icon(kind === "error" ? "warning" : kind === "success" ? "check" : "info", 16), h("span", { text: toast.message }));
        this.timers.set(
          String(toast.id),
          setTimeout(() => this.emit("toastDismiss", { id: String(toast.id) }), Number(toast.duration) || (kind === "error" ? 6000 : 3200)),
        );
        node.addEventListener("click", () => this.emit("toastDismiss", { id: String(toast.id) }));
        return node;
      },
    );
    const banner = props.banner || {};
    if (banner.key && banner.key !== (previous.banner || {}).key) {
      this.banner.replaceChildren(h("div", { class: "ez-result-card ez-glass" }, banner.eyebrow ? h("span", { class: "ez-eyebrow", text: banner.eyebrow }) : null, h("h2", { text: banner.title || "" }), banner.subtitle ? h("span", { text: banner.subtitle }) : null));
      this.banner.hidden = false;
      clearTimeout(this.bannerTimer);
      this.bannerTimer = setTimeout(() => (this.banner.hidden = true), Number(banner.duration) || 2200);
    }
    if (this.open !== (previous.sidebarOpen !== false) || props.sidebarWidth !== previous.sidebarWidth) queueMicrotask(() => this.measure());
  }

  measure() {
    const narrow = this.element.clientWidth <= 760;
    const width = this.open && !narrow ? this.side.offsetWidth + 20 : 0;
    const insets = { top: 0, left: 0, bottom: this.open && narrow ? Math.round(this.element.clientHeight * 0.62) : 0, right: width };
    const key = JSON.stringify(insets);
    if (key === this.lastInsets) return;
    this.lastInsets = key;
    this.emit("insets", { insets });
  }

  destroy() {
    this.observer.disconnect();
    clearTimeout(this.bannerTimer);
    for (const timer of this.timers.values()) clearTimeout(timer);
    super.destroy();
  }
}
