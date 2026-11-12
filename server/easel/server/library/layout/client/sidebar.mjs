import { Component, h, icon, keyed } from "./ui.mjs";

export default class Sidebar extends Component {
  constructor() {
    super("easel.layout.sidebar", "aside");
    this.tabs = h("div", { class: "ez-sidebar-tabs", role: "tablist" });
    this.title = h("h2", { class: "ez-sidebar-title" });
    this.actions = this.slot("actions", h("div", { style: { display: "flex", gap: "2px" } }));
    this.head = h("div", { class: "ez-sidebar-head" }, this.title, this.actions);
    this.panels = this.slot("panels", h("div", { class: "ez-sidebar-panels" }));
    this.element.append(this.tabs, this.head, this.panels);
    this.watch = new MutationObserver(() => this.show());
    this.watch.observe(this.panels, { childList: true });
    this.on(this.tabs, "keydown", (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      const tabs = this.props.tabs || [];
      const index = tabs.findIndex((tab) => tab.id === this.props.active);
      const next = tabs[(index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length];
      if (next) {
        event.preventDefault();
        this.emit("select", { id: String(next.id) });
        queueMicrotask(() => this.tabs.querySelector('[aria-selected="true"]')?.focus());
      }
    });
  }

  render(props) {
    const tabs = props.tabs || [];
    keyed(
      this.tabs,
      tabs,
      (tab) => tab.id,
      (tab) => {
        const node = h("button", { type: "button", class: "ez-sidebar-tab ez-tip", role: "tab" });
        node.addEventListener("click", () => this.emit("select", { id: String(tab.id) }));
        return node;
      },
      (node, tab) => {
        const selected = tab.id === props.active;
        node.setAttribute("aria-selected", String(selected));
        node.tabIndex = selected ? 0 : -1;
        node.dataset.tip = tab.label || "";
        node.setAttribute("aria-label", tab.label || tab.id);
        const signature = (tab.icon || "") + "|" + (tab.badge || "");
        if (node.dataset.signature !== signature) {
          node.dataset.signature = signature;
          node.replaceChildren(icon(tab.icon || "circle", 19), tab.badge ? h("span", { class: "ez-sidebar-badge", text: tab.badge }) : "");
        }
      },
    );
    this.tabs.hidden = tabs.length < 2;
    this.props = props;
    this.show();
  }

  show() {
    const tabs = this.props.tabs || [];
    const active = tabs.find((tab) => tab.id === this.props.active) || tabs[0];
    this.title.textContent = active?.label || "";
    for (const child of this.panels.children) {
      const id = child.dataset.easelId;
      const owner = tabs.find((tab) => (tab.panel || tab.id) === id);
      child.classList.add("ez-sidebar-panel");
      child.hidden = !owner || owner !== active;
    }
  }

  destroy() {
    this.watch.disconnect();
    super.destroy();
  }
}
