import { Component, h, icon, iconButton, menu } from "./ui.mjs";

const ICONS = { ground: "layers", object: "image", drawing: "pen", wall: "wall", token: "token", light: "light", roof: "roof", image: "image", dialogue: "speech", group: "group" };

export default class LayerTree extends Component {
  constructor() {
    super("easel.maps.layertree", "div");
    this.element.classList.add("ez-tree");
    this.element.setAttribute("role", "tree");
    this.closed = new Set();
  }

  row(node, depth) {
    const props = this.props;
    const hidden = node.visible === false;
    const hasChildren = (node.children || []).length > 0;
    const open = !this.closed.has(node.id);
    const row = h("div", { class: "ez-tree-row", role: "treeitem", tabIndex: 0, "aria-selected": String(node.id === props.selected), dataset: { hidden: String(hidden) } });
    row.style.setProperty("--depth", depth);
    const twist = h("span", { style: { width: "14px", display: "grid", placeItems: "center" } });
    if (hasChildren) {
      const arrow = icon(open ? "chevronDown" : "chevronRight", 13);
      twist.append(arrow);
      twist.addEventListener("click", (event) => {
        event.stopPropagation();
        if (open) this.closed.add(node.id);
        else this.closed.delete(node.id);
        this.render(this.props);
      });
    }
    row.append(twist, icon(ICONS[node.kind] || "file", 15), h("span", { class: "ez-tree-name", text: node.name || node.kind || "Untitled" }));
    if (node.count !== undefined) row.append(h("span", { class: "ez-folder-count", text: node.count || "" }));
    if (node.toggleable !== false) {
      const eye = iconButton(hidden ? "eyeOff" : "eye", hidden ? "Show" : "Hide", (event) => {
        event.stopPropagation();
        this.emit("visibility", { id: String(node.id), visible: hidden });
      });
      row.append(eye);
    }
    row.addEventListener("click", () => this.emit("select", { id: String(node.id), kind: String(node.kind || "") }));
    row.addEventListener("pointerenter", () => this.emit("preview", { id: String(node.id) }));
    row.addEventListener("pointerleave", () => this.emit("preview", { id: "" }));
    row.addEventListener("contextmenu", (event) => {
      const actions = node.actions || props.actions || [];
      if (!actions.length) return;
      event.preventDefault();
      menu(actions, { x: event.clientX, y: event.clientY }, (id) => this.emit("action", { id: String(node.id), action: id }));
    });
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        this.emit("select", { id: String(node.id), kind: String(node.kind || "") });
      }
    });
    const rows = [row];
    if (hasChildren && open) for (const child of node.children) rows.push(...this.row(child, depth + 1));
    return rows;
  }

  render(props) {
    this.props = props;
    const rows = (props.nodes || []).flatMap((node) => this.row(node, 0));
    if (!rows.length) rows.push(h("div", { class: "ez-empty", style: { padding: "14px" } }, h("span", { text: props.emptyText || "Nothing here yet." })));
    this.element.replaceChildren(...rows);
  }
}
