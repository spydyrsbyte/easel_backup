import { Component, h, icon, button, keyed } from "./ui.mjs";

export default class GameTable extends Component {
  constructor() {
    super("easel.layout.gametable", "div");
    this.element.dataset.easelFill = "true";
    this.top = this.slot("top", h("div", { class: "ez-gt-seat" }));
    this.board = this.slot("board", h("div", { class: "ez-gt-board" }));
    this.bottom = this.slot("bottom", h("div", { class: "ez-gt-seat" }));
    this.status = h("div", { class: "ez-gt-status", role: "status", "aria-live": "polite" });
    this.actions = h("div", { class: "ez-gt-actions" });
    this.sidebar = this.slot("sidebar", h("div", { class: "ez-gt-panels" }));
    this.result = h("div", { class: "ez-result", hidden: true });
    this.toasts = h("div", { class: "ez-gt-toasts", role: "alert" });
    this.boardWrap = h("div", { class: "ez-gt-boardwrap" }, this.board, this.result);
    this.element.append(h("div", { class: "ez-gt-main" }, this.top, this.boardWrap, this.bottom), h("aside", { class: "ez-gt-side ez-glass" }, this.status, this.sidebar, this.actions), this.toasts);
    this.timers = new Map();
  }

  render(props, previous) {
    this.status.replaceChildren(props.statusIcon ? icon(props.statusIcon, 18) : "", h("div", {}, h("strong", { text: props.status || "" }), props.detail ? h("span", { text: props.detail }) : null));
    this.status.dataset.tone = props.statusTone || "";
    this.status.hidden = !props.status;
    keyed(
      this.actions,
      (props.actions || []).filter((action) => action && !action.hidden),
      (action) => action.id,
      (action) => {
        const node = button(action.label, { iconName: action.icon, kind: action.primary ? "primary" : action.danger ? "danger" : "" });
        node.addEventListener("click", () => this.emit("action", { id: String(node.dataset.key) }));
        return node;
      },
      (node, action) => {
        node.disabled = !!action.disabled;
        node.title = action.title || "";
        const label = node.querySelector("span");
        if (label && label.textContent !== action.label) label.textContent = action.label;
      },
    );
    this.actions.hidden = !this.actions.children.length;
    const result = props.result || {};
    if (!result.key) this.result.hidden = true;
    else if (result.key !== (previous.result || {}).key || !this.sameActions(result, previous.result)) {
      const actions = h("div", { class: "ez-result-actions" });
      for (const action of result.actions || []) actions.append(button(action.label, { iconName: action.icon, kind: action.primary ? "primary" : "", onClick: () => this.emit("resultAction", { id: String(action.id) }) }));
      actions.append(button("View board", { kind: "ghost", onClick: () => (this.result.hidden = true) }));
      this.result.replaceChildren(h("div", { class: "ez-result-card ez-glass" }, icon(result.icon || "trophy", 34), result.eyebrow ? h("span", { class: "ez-eyebrow", text: result.eyebrow }) : null, h("h2", { text: result.title || "" }), result.text ? h("span", { text: result.text }) : null, actions));
      if (result.key !== (previous.result || {}).key) this.result.hidden = false;
    }
    keyed(
      this.toasts,
      props.toasts || [],
      (toast) => toast.id,
      (toast) => {
        const kind = toast.kind || "info";
        const node = h("div", { class: "ez-toast ez-glass", dataset: { kind } }, icon(kind === "error" ? "warning" : kind === "success" ? "check" : "info", 16), h("span", { text: toast.message }));
        this.timers.set(
          String(toast.id),
          setTimeout(() => this.emit("toastDismiss", { id: String(toast.id) }), Number(toast.duration) || (kind === "error" ? 5000 : 3000)),
        );
        node.addEventListener("click", () => this.emit("toastDismiss", { id: String(toast.id) }));
        return node;
      },
    );
  }

  sameActions(result, before) {
    return JSON.stringify(result.actions || []) === JSON.stringify((before || {}).actions || []) && result.text === (before || {}).text;
  }

  destroy() {
    for (const timer of this.timers.values()) clearTimeout(timer);
    super.destroy();
  }
}
