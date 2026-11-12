import { Component, h, icon, button, safeUrl } from "./ui.mjs";

function read(values, path) {
  return String(path).split(".").reduce((value, key) => (value === null || value === undefined ? undefined : value[key]), values);
}

export default class Form extends Component {
  constructor() {
    super("easel.input.form", "form");
    this.element.noValidate = true;
    this.on(this.element, "submit", (event) => {
      event.preventDefault();
      this.emit("submit", { values: this.props.values || {} });
    });
  }

  change(field, value) {
    this.emit("change", { id: String(field.id), value: { value } });
  }

  control(field, value) {
    const props = this.props;
    const disabled = !!props.readOnly || !!field.disabled;
    const type = field.type || "text";
    if (type === "switch") {
      const node = h("button", { type: "button", class: "ez-switch", role: "switch", "aria-checked": String(!!value), "aria-label": field.label || field.id, disabled });
      node.addEventListener("click", () => this.change(field, !value));
      return node;
    }
    if (type === "segment") {
      const group = h("div", { class: "ez-segment", role: "group" });
      for (const option of field.options || []) {
        const id = typeof option === "object" ? option.id : option;
        const node = h("button", { type: "button", "aria-pressed": String(id === value), disabled, text: typeof option === "object" ? option.label : option });
        node.addEventListener("click", () => this.change(field, id));
        group.append(node);
      }
      return group;
    }
    if (type === "select") {
      const node = h("select", { disabled, "aria-label": field.label || field.id });
      for (const option of field.options || []) {
        const id = typeof option === "object" ? option.id : option;
        node.append(h("option", { value: String(id), selected: id === value, text: typeof option === "object" ? option.label : option }));
      }
      node.addEventListener("change", () => {
        const match = (field.options || []).find((option) => String(typeof option === "object" ? option.id : option) === node.value);
        this.change(field, match === undefined ? node.value : typeof match === "object" ? match.id : match);
      });
      return node;
    }
    if (type === "range") {
      const node = h("input", { type: "range", min: field.min ?? 0, max: field.max ?? 1, step: field.step ?? 0.01, value: Number(value ?? field.min ?? 0), disabled, "aria-label": field.label || field.id });
      const label = h("span", { class: "ez-field-value", text: this.format(field, Number(node.value)) });
      node.addEventListener("input", () => (label.textContent = this.format(field, Number(node.value))));
      node.addEventListener("change", () => this.change(field, Number(node.value)));
      return [node, label];
    }
    if (type === "color") {
      const text = typeof value === "string" && /^#[0-9a-f]{6}/i.test(value) ? value.slice(0, 7) : "#ffffff";
      const node = h("input", { type: "color", value: text, disabled, "aria-label": field.label || field.id });
      node.addEventListener("change", () => this.change(field, node.value));
      return [node, h("span", { class: "ez-field-value", text })];
    }
    if (type === "image") {
      const url = safeUrl(value);
      const thumb = h("div", { class: "ez-imagefield-thumb" });
      if (url) thumb.style.backgroundImage = 'url("' + url.replace(/"/g, "%22") + '")';
      const choose = button(url ? "Replace" : "Choose image", { kind: "small", iconName: "upload", onClick: () => picker.click() });
      const picker = h("input", { type: "file", accept: field.accept || "image/png,image/jpeg,image/webp,image/gif,image/svg+xml", hidden: true });
      picker.addEventListener("change", () => {
        if (picker.files[0]) this.emit("file", { id: String(field.id), file: { file: picker.files[0] } });
        picker.value = "";
      });
      choose.disabled = disabled;
      const clear = url ? button("", { kind: "small ez-btn-ghost", iconName: "close", title: "Remove image", onClick: () => this.change(field, "") }) : "";
      if (clear) clear.disabled = disabled;
      return h("div", { class: "ez-imagefield" }, thumb, choose, clear, picker);
    }
    if (type === "textarea") {
      const node = h("textarea", { rows: field.rows || 4, disabled, placeholder: field.placeholder || "", "aria-label": field.label || field.id });
      node.value = value ?? "";
      node.addEventListener("change", () => this.change(field, node.value));
      return node;
    }
    if (type === "action") {
      return button(field.text || field.label, { kind: field.kind || "", iconName: field.icon || "", onClick: () => this.emit("action", { id: String(field.id) }) });
    }
    if (type === "static") return h("span", { class: "ez-field-value", style: { textAlign: "start" }, text: value ?? field.text ?? "" });
    const node = h("input", { type: type === "number" ? "number" : "text", disabled, placeholder: field.placeholder || "", "aria-label": field.label || field.id });
    if (type === "number") {
      if (field.min !== undefined) node.min = field.min;
      if (field.max !== undefined) node.max = field.max;
      node.step = field.step ?? "any";
    }
    node.value = value ?? "";
    node.addEventListener("change", () => {
      if (type !== "number") return this.change(field, node.value);
      const number = Number(node.value);
      if (node.value === "" || !Number.isFinite(number)) {
        node.value = value ?? "";
        return;
      }
      this.change(field, Math.min(field.max ?? Infinity, Math.max(field.min ?? -Infinity, number)));
    });
    return node;
  }

  format(field, value) {
    if (field.percent) return Math.round(value * 100) + "%";
    return (Math.round(value * 100) / 100).toString() + (field.unit ? " " + field.unit : "");
  }

  render(props) {
    this.props = props;
    const active = document.activeElement;
    const focused = this.element.contains(active) ? active.closest("[data-field]")?.dataset.field : null;
    const nodes = [];
    for (const field of props.fields || []) {
      if (!field || (field.when && !read(props.values || {}, field.when))) continue;
      if (field.type === "section") {
        nodes.push(h("div", { class: "ez-form-section ez-eyebrow", text: field.label }));
        continue;
      }
      const value = field.id === undefined ? undefined : read(props.values || {}, field.id);
      const wide = field.wide || field.type === "textarea" || (field.type === "action" && !field.caption);
      const row = h("div", { class: "ez-field", dataset: { wide: String(!!wide), field: String(field.id ?? "") } });
      if (field.type !== "action" || field.caption) row.append(h("label", { class: "ez-field-label", text: field.type === "action" ? field.caption : field.label || "" }));
      row.append(h("div", { class: "ez-field-control" }, this.control(field, value)));
      if (field.hint) row.append(h("div", { class: "ez-field-hint", text: field.hint }));
      nodes.push(row);
    }
    if ((props.actions || []).length) {
      const actions = h("div", { class: "ez-form-actions" });
      for (const action of props.actions) actions.append(button(action.label, { kind: action.kind || "", iconName: action.icon || "", onClick: () => this.emit("action", { id: String(action.id) }) }));
      nodes.push(actions);
    }
    if (!nodes.length && props.emptyText) nodes.push(h("div", { class: "ez-empty" }, icon(props.emptyIcon || "pointer", 28), h("span", { text: props.emptyText })));
    this.element.replaceChildren(...nodes);
    if (focused) this.element.querySelector('[data-field="' + CSS.escape(focused) + '"] :is(input, select, textarea, button)')?.focus({ preventScroll: true });
  }
}
