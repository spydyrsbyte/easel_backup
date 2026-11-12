import { Component, h, icon, iconButton, button, safeUrl, initials } from "./ui.mjs";

function read(values, path) {
  return String(path).split(".").reduce((value, key) => (value === null || value === undefined ? undefined : value[key]), values);
}

export default class StatSheet extends Component {
  constructor() {
    super("easel.characters.statsheet", "div");
    this.element.classList.add("ez-sheet");
    this.tab = "";
    this.picker = h("input", { type: "file", accept: "image/png,image/jpeg,image/webp,image/gif,image/svg+xml", hidden: true });
    this.picker.addEventListener("change", () => {
      if (this.picker.files[0]) this.emit("image", { file: { file: this.picker.files[0] } });
      this.picker.value = "";
    });
  }

  change(path, value) {
    this.emit("change", { path: String(path), value: { value } });
  }

  number(path, value, label, extra = {}) {
    const node = h("input", { type: "number", value: value ?? 0, disabled: !!this.props.readOnly, "aria-label": label, dataset: { path }, ...extra });
    node.addEventListener("change", () => {
      const number = Number(node.value);
      if (node.value === "" || !Number.isFinite(number)) node.value = value ?? 0;
      else this.change(path, number);
    });
    node.addEventListener("click", (event) => event.stopPropagation());
    return node;
  }

  text(path, value, label, classes = "", placeholder = "") {
    const node = h("input", { type: "text", class: classes, value: value ?? "", disabled: !!this.props.readOnly, "aria-label": label, placeholder, dataset: { path } });
    node.addEventListener("change", () => this.change(path, node.value));
    return node;
  }

  block(block, values) {
    const wrap = h("section", { class: "ez-sheet-block" });
    if (block.title) wrap.append(h("h4", { class: "ez-eyebrow", text: block.title }));
    if (block.type === "stats") {
      const grid = h("div", { class: "ez-stats" });
      for (const item of block.items || []) {
        const value = read(values, item.id);
        const modifier = item.modifier === "half" ? Math.floor((Number(value) - 10) / 2) : null;
        const rollable = item.roll !== false && !this.props.readOnly;
        const cell = h("div", { class: "ez-stat", dataset: { rollable: String(rollable) }, title: rollable ? "Roll " + item.label : "" }, h("span", { class: "ez-eyebrow", text: item.label }), this.number(item.id, value, item.label), modifier === null ? "" : h("span", { class: "ez-stat-mod", text: (modifier >= 0 ? "+" : "") + modifier }));
        if (rollable) cell.addEventListener("click", () => this.emit("roll", { id: String(item.id), label: String(item.label), modifier: modifier === null ? Number(value) || 0 : modifier }));
        grid.append(cell);
      }
      wrap.append(grid);
    } else if (block.type === "resources") {
      const list = h("div", { class: "ez-resources" });
      for (const item of block.items || []) {
        const resource = read(values, item.id) || {};
        const max = Number(resource.max) || 0;
        const ratio = max > 0 ? Math.max(0, Math.min(1, Number(resource.value) / max)) : 0;
        const bar = h("div", { class: "ez-bar", dataset: { level: ratio > 0.5 ? "high" : ratio > 0.25 ? "mid" : "low" } }, h("span", { style: { width: ratio * 100 + "%", ...(item.color ? { background: item.color } : {}) } }));
        list.append(h("div", { class: "ez-resource" }, h("strong", { text: item.label }), h("div", { class: "ez-resource-values" }, this.number(item.id + ".value", resource.value, item.label), h("span", { text: "/" }), this.number(item.id + ".max", resource.max, item.label + " maximum")), bar));
      }
      wrap.append(list);
    } else if (block.type === "fields") {
      const list = h("div", { class: "ez-rows" });
      for (const item of block.items || []) {
        const value = read(values, item.id);
        const control = item.type === "number" ? this.number(item.id, value, item.label) : this.text(item.id, value, item.label, "", item.placeholder || "");
        list.append(h("label", { class: "ez-row" }, h("span", { class: "ez-row-main", style: { color: "var(--ez-dim)" }, text: item.label }), control));
      }
      wrap.append(list);
    } else if (block.type === "list") {
      const rows = Array.isArray(read(values, block.id)) ? read(values, block.id) : [];
      const list = h("div", { class: "ez-rows" });
      rows.forEach((row, index) => {
        const line = h("div", { class: "ez-row" });
        for (const column of block.columns || [{ id: "name", label: "Name" }]) {
          const path = block.id + "." + index + "." + column.id;
          if (column.type === "number") line.append(this.number(path, row?.[column.id], column.label, { title: column.label }));
          else line.append(h("span", { class: "ez-row-main" }, this.text(path, row?.[column.id], column.label, "", column.label)));
        }
        if (block.roll && !this.props.readOnly) line.append(iconButton("d20", "Roll " + (row?.name || block.title || "this"), () => this.emit("roll", { id: block.id + "." + index, label: String(row?.name || block.title || ""), modifier: Number(row?.[block.roll]) || 0 })));
        if (!this.props.readOnly) line.append(iconButton("trash", "Remove", () => this.emit("listRemove", { id: String(block.id), index })));
        list.append(line);
      });
      if (!rows.length) list.append(h("div", { class: "ez-empty", style: { padding: "12px" } }, h("span", { text: block.emptyText || "Nothing yet." })));
      wrap.append(list);
      if (!this.props.readOnly) wrap.append(h("div", { style: { marginTop: "6px" } }, button(block.addLabel || "Add", { kind: "small ez-btn-ghost", iconName: "plus", onClick: () => this.emit("listAdd", { id: String(block.id) }) })));
    } else if (block.type === "text") {
      const node = h("textarea", { rows: block.rows || 6, disabled: !!this.props.readOnly, placeholder: block.placeholder || "", "aria-label": block.title || "Notes", dataset: { path: block.id } });
      node.value = read(values, block.id) ?? "";
      node.addEventListener("change", () => this.change(block.id, node.value));
      wrap.append(node);
    }
    return wrap;
  }

  render(props) {
    this.props = props;
    const actor = props.actor || {};
    const layout = props.layout || {};
    const values = props.values || {};
    const tabs = layout.tabs || [];
    if (!tabs.some((tab) => tab.id === this.tab)) this.tab = tabs[0]?.id || "";
    const active = document.activeElement;
    const focused = this.element.contains(active) ? active.dataset.path : null;
    const scroll = this.element.parentElement?.scrollTop || 0;
    const portrait = h("div", { class: "ez-sheet-portrait", title: props.readOnly ? "" : "Change portrait" });
    const image = safeUrl(actor.image);
    if (image) portrait.append(h("img", { src: image, alt: "" }));
    else portrait.textContent = initials(actor.name);
    if (!props.readOnly) portrait.addEventListener("click", () => this.picker.click());
    const name = h("input", { type: "text", class: "ez-sheet-name", value: actor.name || "", disabled: !!props.readOnly, "aria-label": "Name", dataset: { path: "@name" } });
    name.addEventListener("change", () => this.emit("rename", { name: name.value }));
    const hero = h("header", { class: "ez-sheet-hero" }, portrait, h("div", { class: "ez-sheet-id" }, name, layout.tagline ? this.text(layout.tagline, read(values, layout.tagline), "Summary", "ez-sheet-tagline", layout.taglinePlaceholder || "Ancestry, calling, level…") : ""));
    const tabBar = h("div", { class: "ez-sheet-tabs", role: "tablist", hidden: tabs.length < 2 });
    for (const tab of tabs) {
      const node = h("button", { type: "button", class: "ez-sheet-tab", role: "tab", "aria-selected": String(tab.id === this.tab), text: tab.label });
      node.addEventListener("click", () => {
        this.tab = tab.id;
        this.render(this.props);
      });
      tabBar.append(node);
    }
    const page = h("div", { class: "ez-sheet-page" });
    for (const block of (tabs.find((tab) => tab.id === this.tab) || {}).blocks || []) page.append(this.block(block, values));
    if (!tabs.length) page.append(h("div", { class: "ez-empty" }, icon("user", 28), h("span", { text: "This game has not described its character sheet." })));
    this.element.replaceChildren(hero, tabBar, page, this.picker);
    if (this.element.parentElement) this.element.parentElement.scrollTop = scroll;
    if (focused) this.element.querySelector('[data-path="' + CSS.escape(focused) + '"]')?.focus({ preventScroll: true });
  }
}
