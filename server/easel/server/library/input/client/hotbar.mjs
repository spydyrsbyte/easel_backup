import { Component, h, icon, safeUrl, typing, menu } from "./ui.mjs";

export default class Hotbar extends Component {
  constructor() {
    super("easel.input.hotbar", "div");
    this.element.classList.add("ez-glass");
    this.element.setAttribute("role", "toolbar");
    this.on(window, "keydown", (event) => {
      if (typing(event) || event.ctrlKey || event.metaKey || event.altKey || this.props.shortcuts === false) return;
      const index = "1234567890".indexOf(event.key);
      const slot = index >= 0 ? (this.props.slots || [])[index] : null;
      if (slot && slot.id) {
        event.preventDefault();
        this.emit("use", { index, id: String(slot.id) });
      }
    });
  }

  render(props) {
    this.props = props;
    const count = Math.max(1, Math.min(10, Number(props.size) || 10));
    const nodes = [];
    for (let index = 0; index < count; index++) {
      const slot = (props.slots || [])[index] || null;
      const filled = !!slot?.id;
      const node = h("button", { type: "button", class: "ez-hotbar-slot", title: filled ? slot.label || "" : "Empty slot", "aria-label": filled ? slot.label || "Slot " + (index + 1) : "Empty slot " + (index + 1), dataset: { empty: String(!filled) } });
      const image = filled ? safeUrl(slot.image) : "";
      if (image) node.append(h("img", { src: image, alt: "", draggable: false }));
      else if (filled && slot.icon) node.append(icon(slot.icon, 20));
      else if (filled) node.append(h("span", { class: "ez-hotbar-label", text: slot.label || "" }));
      node.append(h("span", { class: "ez-hotbar-key", text: String((index + 1) % 10) }));
      node.addEventListener("click", () => {
        if (filled) this.emit("use", { index, id: String(slot.id) });
        else this.emit("assign", { index });
      });
      node.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        menu(
          filled
            ? [
                { id: "edit", label: "Edit", icon: "edit" },
                { id: "clear", label: "Clear slot", icon: "trash", danger: true },
              ]
            : [{ id: "edit", label: "Assign a macro", icon: "plus" }],
          { x: event.clientX, y: event.clientY },
          (id) => this.emit(id === "clear" ? "clear" : "assign", { index }),
        );
      });
      node.addEventListener("dragover", (event) => event.preventDefault());
      node.addEventListener("drop", (event) => {
        event.preventDefault();
        try {
          const data = JSON.parse(event.dataTransfer.getData("application/x-easel-kit") || "{}");
          if (data.id) this.emit("drop", { index, data });
        } catch {}
      });
      nodes.push(node);
    }
    this.element.replaceChildren(...nodes);
  }
}
