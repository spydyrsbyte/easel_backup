import { safeImage, element as el } from "./safe.mjs";

export class Base {
  constructor(name, slots = []) {
    this.name = name;
    this.props = {};
    this.life = new AbortController();
    this.element = el("section", "kit kit-" + name.replaceAll(".", "-"));
    this.element.dataset.kit = name;
    this.content = el("div", "kit-content");
    this.element.append(this.content);
    this.slots = {};
    for (const sName of slots) {
      const slot = el("div", "kit-slot kit-slot-" + sName);
      slot.dataset.slot = sName;
      this.slots[sName] = slot;
      this.element.append(slot);
    }
    this.element.addEventListener(
      "keydown",
      (e) => {
        if (e.key === "Escape") this.emit("close", {});
      },
      { signal: this.life.signal }
    );
  }

  emit(name, payload = {}) {
    if (this.props.disabled) return;
    this.onEvent?.(name, payload);
  }

  begin(props) {
    this.props = props;
    this.content.replaceChildren();
    this.element.hidden = props.open === false;
    this.element.setAttribute("aria-disabled", String(!!props.disabled));
    if (props.title) {
      this.content.append(el("h3", "kit-title", props.title));
    }
  }

  button(label, event = "action", payload = { id: String(label) }, disabled = false) {
    const node = el("button", "kit-button", label);
    node.type = "button";
    node.disabled = !!this.props.disabled || disabled;
    node.onclick = () => this.emit(event, payload);
    return node;
  }

  text(value, kind = "p", classes = "") {
    return el(kind, classes, value ?? "");
  }

  image(src, alt = "") {
    const img = el("img", "kit-image");
    img.alt = String(alt);
    const url = safeImage(src);
    if (url) img.src = url;
    else img.hidden = true;
    img.onerror = () => {
      img.hidden = true;
    };
    return img;
  }

  field(label, value, id, type = "text") {
    const row = el("label", "kit-field");
    row.append(el("span", "kit-label", label));
    const input = el(type === "textarea" ? "textarea" : "input");
    if (type !== "textarea") input.type = type;
    input.disabled = !!this.props.disabled;
    input.dataset.field = id;
    if (type === "checkbox") input.checked = !!value;
    else input.value = String(value ?? "");
    input.onchange = () => {
      const val =
        type === "checkbox"
          ? input.checked
          : type === "number"
          ? Number(input.value)
          : input.value;
      this.emit("change", { value: { id, value: val } });
    };
    row.append(input);
    return row;
  }

  destroy() {
    this.life.abort();
    this.element.remove();
  }
}
