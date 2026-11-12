import { Component, h, avatar, button, icon, safeUrl } from "./ui.mjs";

const clock = (ms) => {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = String(seconds % 60).padStart(2, "0");
  return hours ? hours + ":" + String(minutes).padStart(2, "0") + ":" + rest : minutes + ":" + rest;
};

export default class Seat extends Component {
  constructor() {
    super("easel.display.seat", "div");
    this.element.classList.add("ez-glass");
    this.face = h("span", { class: "ez-seat-face" });
    this.name = h("div", { class: "ez-seat-name" });
    this.sub = h("div", { class: "ez-seat-sub" });
    this.tray = h("div", { class: "ez-captured" });
    this.controls = h("div", { class: "ez-seat-controls" });
    this.time = h("div", { class: "ez-clock", hidden: true });
    this.element.append(this.face, h("div", { class: "ez-seat-main" }, this.name, this.sub), this.tray, this.controls, this.time);
  }

  render(props) {
    const open = !!props.open;
    this.element.dataset.turn = String(!!props.turn && !open);
    this.element.dataset.open = String(open);
    this.face.replaceChildren(open ? h("span", { class: "ez-avatar ez-seat-empty", style: { width: "38px", height: "38px" } }, icon("user", 18)) : avatar(props.name, props.image, 38, props.color || undefined));
    this.name.textContent = open ? "Open seat" : props.name || "Player";
    this.sub.replaceChildren(
      props.swatch ? h("span", { class: "ez-seat-side", style: { background: props.swatch } }) : "",
      h("span", { text: props.label || "" }),
      props.you && !open ? h("span", { class: "ez-chip ez-chip-primary", text: "You" }) : "",
      props.status ? h("span", { class: "ez-chip", text: props.status }) : "",
    );
    const captured = props.captured || [];
    this.tray.replaceChildren(
      ...captured.slice(0, 32).map((piece) => {
        const url = safeUrl(piece.image);
        return url ? h("img", { alt: piece.label || "", title: piece.label || "", src: url, draggable: false }) : h("span", { class: "ez-captured-disc", title: piece.label || "", style: piece.color ? { background: piece.color } : undefined, text: piece.glyph || "" });
      }),
      props.advantage ? h("span", { class: "ez-captured-lead", text: props.advantage }) : "",
    );
    this.controls.replaceChildren(
      open && props.canSit ? button(props.sitLabel || "Sit here", { kind: "primary", onClick: () => this.emit("sit", {}) }) : "",
      !open && props.canLeave ? button("Leave seat", { kind: "ghost", onClick: () => this.emit("leave", {}) }) : "",
    );
    this.base = Number(props.elapsed) || 0;
    this.since = props.running ? Number(props.startedAt) || Date.now() : 0;
    this.limit = Number(props.limit) || 0;
    this.time.hidden = open || props.clock === false;
    clearInterval(this.timer);
    this.tick();
    if (this.since) this.timer = setInterval(() => this.tick(), 500);
  }

  tick() {
    const spent = this.base + (this.since ? Math.max(0, Date.now() - this.since) : 0);
    const shown = this.limit ? Math.max(0, this.limit - spent) : spent;
    this.time.textContent = clock(shown);
    this.time.dataset.low = String(!!this.limit && shown < 30000);
  }

  destroy() {
    clearInterval(this.timer);
    super.destroy();
  }
}
