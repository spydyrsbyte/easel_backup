import { safeImage, element as el } from "./safe.mjs";
export class Base {
  constructor(name, slots = []) {
    this.name = name;
    this.props = {};
    this.life = new AbortController();
    this.element = el("section", "kit kit-" + name.replaceAll(".", "-"));
    this.element.dataset.kit = name;
    if (!document.querySelector("link[data-easel-kits]")) {
      const link = el("link");
      link.rel = "stylesheet";
      link.href = new URL("./kit.css", import.meta.url).href;
      link.dataset.easelKits = "true";
      document.head.append(link);
    }
    this.content = el("div", "kit-content");
    this.element.append(this.content);
    this.slots = {};
    for (const name of slots) {
      const slot = el("div", "kit-slot kit-slot-" + name);
      slot.dataset.slot = name;
      this.slots[name] = slot;
      this.element.append(slot);
    }
    this.element.addEventListener(
      "keydown",
      (e) => {
        if (e.key === "Escape") this.emit("close", {});
      },
      { signal: this.life.signal },
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
    if (props.camera) {
      for (const k of ["x", "y", "rotation", "zoom"])
        if (
          props.camera[k] !== undefined &&
          (typeof props.camera[k] !== "number" ||
            !Number.isFinite(props.camera[k]))
        )
          throw new TypeError("Camera values must be finite numbers");
      if (props.camera.zoom !== undefined && props.camera.zoom <= 0)
        throw new RangeError("Camera zoom must be positive");
    }
    if (props.title) this.content.append(el("h3", "", props.title));
  }
  button(
    label,
    event = "action",
    payload = { id: String(label) },
    disabled = false,
  ) {
    const node = el("button", "", label);
    node.type = "button";
    node.disabled = !!this.props.disabled || disabled;
    node.onclick = () => this.emit(event, payload);
    return node;
  }
  text(value, kind = "p", classes = "") {
    return el(kind, classes, value ?? "");
  }
  image(src, alt = "") {
    const image = el("img", "kit-image");
    image.alt = String(alt);
    const url = safeImage(src);
    if (url) image.src = url;
    else image.hidden = true;
    image.onerror = () => {
      image.hidden = true;
      image.dataset.failed = "true";
    };
    return image;
  }
  field(label, value, id, type = "text") {
    const row = el("label", "kit-field");
    row.append(el("span", "", label));
    const input = el(type === "textarea" ? "textarea" : "input");
    if (type !== "textarea") input.type = type;
    input.disabled = !!this.props.disabled;
    input.dataset.field = id;
    if (type === "checkbox") input.checked = !!value;
    else input.value = String(value ?? "");
    input.onchange = () => {
      const value =
        type === "checkbox"
          ? input.checked
          : type === "number"
            ? Number(input.value)
            : input.value;
      if (
        type === "number" &&
        (!Number.isFinite(value) || !input.checkValidity())
      ) {
        input.setAttribute("aria-invalid", "true");
        return;
      }
      input.removeAttribute("aria-invalid");
      this.emit("change", { value: { id, value } });
    };
    row.append(input);
    return row;
  }
  rows(items, { select = false, actions = [], fields = [] } = {}) {
    if (items.length > 10000)
      throw new RangeError("Collection display limit exceeded");
    const ul = el("ul", "kit-list");
    for (const [index, raw] of items.entries()) {
      const item =
        typeof raw === "object" && raw !== null
          ? raw
          : { id: String(raw), label: String(raw) };
      const id = String(item.id ?? index),
        li = el("li", "kit-item");
      li.dataset.id = id;
      li.append(
        el("div", "kit-label", item.label ?? item.name ?? item.title ?? id),
      );
      if (item.description || item.text)
        li.append(el("p", "kit-muted", item.description ?? item.text));
      if (item.value !== undefined)
        li.append(el("strong", "", String(item.value)));
      for (const f of fields) {
        const value = String(f.path ?? f.id ?? f)
          .split(".")
          .reduce((v, k) => v?.[k], item);
        if (value !== undefined)
          li.append(
            el(
              "p",
              "",
              String(f.label ?? f.path ?? f.id ?? f) + ": " + String(value),
            ),
          );
      }
      if (select) {
        li.tabIndex = 0;
        li.setAttribute("role", "option");
        li.setAttribute(
          "aria-selected",
          String((this.props.selected ?? []).includes(id)),
        );
        const choose = (e) => {
          let ids =
            this.props.multiple || e.ctrlKey || e.metaKey
              ? [...(this.props.selected ?? [])]
              : [];
          ids = ids.includes(id) ? ids.filter((v) => v !== id) : [...ids, id];
          this.emit("select", { id });
          this.emit("selection", { ids });
        };
        li.onclick = choose;
        li.onkeydown = (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            choose(e);
          }
          if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
            e.preventDefault();
            this.emit("reorder", {
              id,
              before: String(
                items[index + (e.key === "ArrowUp" ? -1 : 1)]?.id ?? "",
              ),
            });
          }
        };
      }
      for (const action of actions)
        li.append(
          this.button(
            action.label ?? action.id,
            "request",
            { action: action.id, value: { id } },
            !!action.disabled,
          ),
        );
      ul.append(li);
    }
    if (select) ul.setAttribute("role", "listbox");
    return ul;
  }
  card(item, { inspect = true } = {}) {
    const data = item ?? {},
      figure = el("figure", "kit-card");
    figure.style.margin = "0";
    figure.dataset.id = String(data.id ?? "");
    figure.tabIndex = 0;
    figure.setAttribute("role", "button");
    figure.setAttribute("aria-pressed", String(!!data.selected));
    if (data.selected) figure.style.outline = "2px solid var(--kit-accent)";
    const faceUp = data.faceUp !== false;
    const src = faceUp ? (data.image ?? data.face ?? data.src) : data.back;
    const image = this.image(
      src,
      faceUp ? (data.name ?? data.label ?? "Card") : "Face-down card",
    );
    figure.append(image);
    if (!src)
      figure.append(
        el(
          "figcaption",
          "",
          faceUp ? (data.name ?? data.label ?? "Card") : "Face down",
        ),
      );
    if (data.count !== undefined)
      figure.append(el("span", "kit-counter", data.count));
    figure.setAttribute(
      "aria-label",
      faceUp ? (data.name ?? data.label ?? "Card") : "Face-down card",
    );
    figure.style.transform = "rotate(" + Number(data.orientation ?? 0) + "deg)";
    figure.onclick = () => this.emit("select", { id: String(data.id ?? "") });
    figure.ondblclick = () => {
      if (inspect && faceUp)
        this.emit("inspect", { id: String(data.id ?? "") });
    };
    figure.onkeydown = (e) => {
      if (e.key === "Enter") this.emit("select", { id: String(data.id ?? "") });
      if (e.key === " " && inspect && faceUp) {
        e.preventDefault();
        this.emit("inspect", { id: String(data.id ?? "") });
      }
    };
    return figure;
  }
  dropzone(node, id) {
    node.dataset.kitDrop = String(id);
    node.ondragover = (e) => {
      e.preventDefault();
    };
    const drop = (detail) => {
      if (!detail || typeof detail.id !== "string") return;
      this.emit("drop", {
        id: detail.id,
        source: String(detail.source ?? ""),
        destination: String(id),
        x: Number(detail.x ?? 0),
        y: Number(detail.y ?? 0),
      });
    };
    node.ondrop = (e) => {
      e.preventDefault();
      try {
        const value = JSON.parse(
          e.dataTransfer.getData("application/x-easel-kit"),
        );
        const rect = node.getBoundingClientRect();
        drop({ ...value, x: e.clientX - rect.left, y: e.clientY - rect.top });
      } catch {}
    };
    node.addEventListener("kit-drop", (e) => {
      e.stopPropagation();
      drop(e.detail);
    });
  }
  draggable(node, id, source = "") {
    node.draggable = true;
    node.ondragstart = (e) => {
      if (this.props.disabled) {
        e.preventDefault();
        return;
      }
      e.dataTransfer.setData(
        "application/x-easel-kit",
        JSON.stringify({ id: String(id), source: String(source) }),
      );
      this.emit("drag", { id: String(id) });
    };
    node.onpointerdown = (e) => {
      if (e.pointerType === "mouse" || e.button !== 0 || this.props.disabled)
        return;
      const start = { x: e.clientX, y: e.clientY };
      let moved = false;
      node.setPointerCapture(e.pointerId);
      const move = (ev) => {
        if (Math.hypot(ev.clientX - start.x, ev.clientY - start.y) > 8) {
          moved = true;
          node.style.opacity = ".5";
        }
      };
      const finish = (ev) => {
        node.style.opacity = "";
        node.removeEventListener("pointermove", move);
        node.removeEventListener("pointerup", finish);
        node.removeEventListener("pointercancel", cancel);
        try {
          node.releasePointerCapture(ev.pointerId);
        } catch {}
        if (moved) {
          const target = document
            .elementFromPoint(ev.clientX, ev.clientY)
            ?.closest("[data-kit-drop]");
          if (target) {
            const rect = target.getBoundingClientRect();
            target.dispatchEvent(
              new CustomEvent("kit-drop", {
                bubbles: true,
                detail: {
                  id: String(id),
                  source: String(source),
                  x: ev.clientX - rect.left,
                  y: ev.clientY - rect.top,
                },
              }),
            );
          }
        }
      };
      const cancel = (ev) => {
        moved = false;
        finish(ev);
      };
      node.addEventListener("pointermove", move);
      node.addEventListener("pointerup", finish);
      node.addEventListener("pointercancel", cancel);
    };
  }
  svg(tag, attributes = {}) {
    const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [k, v] of Object.entries(attributes))
      node.setAttribute(k, String(v));
    return node;
  }
  destroy() {
    this.life.abort();
    cancelAnimationFrame(this.frame);
    this.previousFocus?.focus();
    clearInterval(this.interval);
    clearTimeout(this.timeout);
    this.observer?.disconnect();
    this.element.remove();
  }
}
