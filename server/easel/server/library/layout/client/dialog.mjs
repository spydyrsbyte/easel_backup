import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";
export default class Dialog extends Base {
  constructor() {
    super("easel.layout.dialog", ["body"]);
    this.element.addEventListener(
      "keydown",
      (e) => {
        if (e.key !== "Tab" || !this.props.modal) return;
        const focusable = [
          ...this.element.querySelectorAll(
            'button,input,select,textarea,[tabindex="0"]',
          ),
        ].filter((n) => !n.disabled && !n.hidden);
        if (!focusable.length) return;
        const first = focusable[0],
          last = focusable.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      },
      { signal: this.life.signal },
    );
  }
  update(p) {
    this.begin(p);
    this.element.classList.toggle("kit-modal", p.modal);
    this.element.setAttribute("role", "dialog");
    this.element.setAttribute("aria-modal", String(p.modal));
    this.element.setAttribute("aria-label", p.title || "Dialog");
    this.content.append(this.text(p.text), this.slots.body);
    const buttons = el("div", "kit-row");
    for (const a of p.actions)
      buttons.append(
        this.button(a.label ?? a.id, "action", { id: a.id }, !!a.disabled),
      );
    buttons.append(this.button("Cancel", "close", {}));
    this.content.append(buttons);
    if (p.open && p.modal && !this.focused) {
      this.previousFocus = document.activeElement;
      this.focused = true;
      queueMicrotask(() => {
        if (!this.life.signal.aborted)
          this.content.querySelector("button,input,textarea")?.focus();
      });
    }
    if (!p.open && this.focused) {
      this.previousFocus?.focus();
      this.focused = false;
    }
  }
}
