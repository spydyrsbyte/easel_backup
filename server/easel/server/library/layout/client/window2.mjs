import { Component, h, icon, iconButton, drag, clamp } from "./ui.mjs";

export default class FloatingWindow extends Component {
  constructor() {
    super("easel.layout.window", "section");
    this.element.setAttribute("role", "dialog");
    this.badge = h("span", { class: "ez-window-icon" });
    this.title = h("span", { class: "ez-window-title" });
    this.actions = h("div", { class: "ez-window-actions", style: { display: "flex", gap: "2px" } });
    this.minimize = iconButton("minimize", "Minimize", () => this.emit("minimize", { minimized: !this.props.minimized }));
    this.close = iconButton("close", "Close", () => this.emit("close", {}));
    this.head = h("header", { class: "ez-window-head" }, this.badge, this.title, this.actions, this.minimize, this.close);
    this.body = this.slot("content", h("div", { class: "ez-window-body" }));
    this.grip = h("div", { class: "ez-window-grip" });
    this.element.append(this.head, this.body, this.grip);
    this.box = { x: 80, y: 80, width: 420, height: 480 };
    this.on(this.element, "pointerdown", () => this.raise(), true);
    drag(
      this.head,
      {
        threshold: 2,
        start: (event) => {
          if (event.target.closest("button")) return false;
          return { ...this.box };
        },
        move: (event, delta, origin) => this.place({ ...this.box, x: origin.x + delta.x, y: origin.y + delta.y }),
        end: () => this.emit("move", { x: Math.round(this.box.x), y: Math.round(this.box.y) }),
      },
      this.signal,
    );
    drag(
      this.grip,
      {
        start: () => ({ ...this.box }),
        move: (event, delta, origin) => this.place({ ...this.box, width: origin.width + delta.x, height: origin.height + delta.y }),
        end: () => this.emit("resize", { width: Math.round(this.box.width), height: Math.round(this.box.height) }),
      },
      this.signal,
    );
    this.on(this.head, "dblclick", (event) => {
      if (!event.target.closest("button")) this.emit("minimize", { minimized: !this.props.minimized });
    });
    this.on(this.element, "keydown", (event) => {
      if (event.key === "Escape" && !event.defaultPrevented && this.props.closable !== false) {
        event.stopPropagation();
        this.emit("close", {});
      }
    });
  }

  raise() {
    const parent = this.element.parentElement;
    if (!parent) return;
    if (parent.lastElementChild !== this.element) {
      const scroll = this.body.scrollTop;
      parent.append(this.element);
      this.body.scrollTop = scroll;
    }
    for (const sibling of parent.children) if (sibling.classList.contains("ez-window")) sibling.dataset.active = String(sibling === this.element);
    if (!this.active) {
      this.active = true;
      this.emit("focus", {});
    }
    queueMicrotask(() => (this.active = parent.lastElementChild === this.element));
  }

  place(box) {
    const parent = this.element.parentElement;
    const limitX = parent ? parent.clientWidth : innerWidth;
    const limitY = parent ? parent.clientHeight : innerHeight;
    const width = clamp(box.width, 260, Math.max(260, limitX - 8));
    const height = clamp(box.height, 140, Math.max(140, limitY - 8));
    this.box = { width, height, x: clamp(box.x, 60 - width, Math.max(0, limitX - 60)), y: clamp(box.y, 0, Math.max(0, limitY - 44)) };
    Object.assign(this.element.style, { left: this.box.x + "px", top: this.box.y + "px", width: width + "px", height: height + "px" });
  }

  render(props, previous) {
    this.title.replaceChildren(props.title || "", props.subtitle ? h("span", { class: "ez-window-sub", text: props.subtitle }) : "");
    this.element.setAttribute("aria-label", props.title || "Window");
    if (props.icon !== previous.icon) this.badge.replaceChildren(props.icon ? icon(props.icon, 16) : "");
    this.badge.hidden = !props.icon;
    this.element.dataset.minimized = String(!!props.minimized);
    this.close.hidden = props.closable === false;
    this.grip.hidden = props.resizable === false;
    if (!previous.title && previous.x === undefined) {
      this.place({ x: props.x, y: props.y, width: props.width, height: props.height });
      queueMicrotask(() => {
        this.place(this.box);
        this.raise();
      });
    } else if (props.x !== previous.x || props.y !== previous.y || props.width !== previous.width || props.height !== previous.height) {
      this.place({ x: props.x, y: props.y, width: props.width, height: props.height });
    }
  }
}
