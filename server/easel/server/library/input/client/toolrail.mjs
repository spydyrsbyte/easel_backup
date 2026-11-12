import { Component, h, icon, typing } from "./ui.mjs";

export default class ToolRail extends Component {
  constructor() {
    super("easel.input.toolrail", "div");
    this.element.classList.add("ez-toolrail", "ez-glass");
    this.element.setAttribute("role", "toolbar");
    this.on(window, "keydown", (event) => {
      if (typing(event) || event.ctrlKey || event.metaKey || event.altKey || this.props.shortcuts === false) return;
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      for (const tool of this.flat()) {
        if (tool.key && String(tool.key).toLowerCase() === key && !tool.disabled) {
          event.preventDefault();
          this.choose(tool);
          return;
        }
      }
    });
    this.on(window, "pointerdown", (event) => {
      if (this.flyout && !this.element.contains(event.target)) this.closeFlyout();
    });
  }

  flat() {
    return (this.props.tools || []).flatMap((tool) => (tool.children ? tool.children : [tool])).filter((tool) => tool && !tool.separator);
  }

  choose(tool) {
    this.closeFlyout();
    if (tool.action) this.emit("action", { id: String(tool.id) });
    else if (tool.toggle) this.emit("toggle", { id: String(tool.id), on: !tool.on });
    else this.emit("select", { id: String(tool.id) });
  }

  closeFlyout() {
    this.flyout?.remove();
    this.flyout = null;
  }

  button(tool, active) {
    const pressed = tool.toggle ? !!tool.on : tool.id === active;
    const node = h("button", { type: "button", class: "ez-tool", "aria-pressed": tool.action ? undefined : String(pressed), "aria-label": tool.label || tool.id, disabled: !!tool.disabled, dataset: { tip: (tool.label || tool.id) + (tool.key ? "  ·  " + String(tool.key).toUpperCase() : ""), tool: tool.id } }, icon(tool.icon || "circle", 20));
    return node;
  }

  render(props) {
    this.props = props;
    this.closeFlyout();
    this.element.dataset.orientation = props.orientation === "horizontal" ? "horizontal" : "vertical";
    const nodes = [];
    for (const tool of props.tools || []) {
      if (!tool) continue;
      if (tool.separator) {
        nodes.push(h("div", { class: "ez-tool-sep" }));
        continue;
      }
      if (tool.children?.length) {
        const current = tool.children.find((child) => child.id === props.active) || tool.children.find((child) => child.id === this.memory?.[tool.id]) || tool.children[0];
        this.memory = { ...this.memory, [tool.id]: current.id };
        const node = this.button({ ...current, label: current.label }, props.active);
        node.dataset.flyout = "true";
        let timer = null;
        const open = () => {
          this.closeFlyout();
          this.flyout = h("div", { class: "ez-tool-flyout ez-glass" });
          for (const child of tool.children) {
            const option = this.button(child, props.active);
            option.addEventListener("click", () => {
              this.memory[tool.id] = child.id;
              this.choose(child);
            });
            this.flyout.append(option);
          }
          this.flyout.style.top = node.offsetTop - 5 + "px";
          this.element.append(this.flyout);
        };
        node.addEventListener("click", () => {
          if (current.id === props.active) open();
          else this.choose(current);
        });
        node.addEventListener("contextmenu", (event) => {
          event.preventDefault();
          open();
        });
        node.addEventListener("pointerdown", () => (timer = setTimeout(open, 420)));
        for (const type of ["pointerup", "pointerleave"]) node.addEventListener(type, () => clearTimeout(timer));
        nodes.push(node);
        continue;
      }
      const node = this.button(tool, props.active);
      node.addEventListener("click", () => this.choose(tool));
      nodes.push(node);
    }
    this.element.replaceChildren(...nodes);
  }
}
