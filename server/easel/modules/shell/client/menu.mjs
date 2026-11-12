import { el, button } from "./dom.mjs";

export default class Menu {
  constructor() {
    this.element = el("div", "easel-menu-item");
    this.trigger = button("", "easel-menu-trigger", () => this.toggle(this.popup.hidden));
    this.trigger.setAttribute("aria-haspopup", "menu");
    this.trigger.setAttribute("aria-expanded", "false");

    this.popup = el("div", "easel-menu-popup");
    this.popup.setAttribute("role", "menu");
    this.popup.hidden = true;

    this.element.append(this.trigger, this.popup);

    this.outside = (event) => {
      if (!this.element.contains(event.target)) this.toggle(false);
    };
    this.keydown = (event) => {
      if (event.key === "Escape" && !this.popup.hidden) {
        this.toggle(false);
        this.trigger.focus();
        return;
      }
      if (!this.popup.hidden && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
        event.preventDefault();
        const items = [...this.popup.querySelectorAll("button:not([disabled])")];
        if (!items.length) return;
        const index = items.indexOf(document.activeElement);
        if (event.key === "ArrowDown") {
          const next = index < items.length - 1 ? index + 1 : 0;
          items[next]?.focus();
        } else {
          const prev = index > 0 ? index - 1 : items.length - 1;
          items[prev]?.focus();
        }
      }
    };

    document.addEventListener("pointerdown", this.outside);
    document.addEventListener("keydown", this.keydown);
  }

  toggle(open) {
    this.popup.hidden = !open;
    this.trigger.setAttribute("aria-expanded", String(open));
    if (open) {
      const rect = this.trigger.getBoundingClientRect();
      this.popup.style.top = `${rect.bottom + 4}px`;
      this.popup.style.left = `${rect.left}px`;
      this.popup.querySelector("button:not([disabled])")?.focus();
    }
  }

  update(props) {
    this.element.hidden = !props.visible;
    this.trigger.disabled = !props.enabled;
    this.trigger.textContent = props.label || "Game";

    this.popup.replaceChildren();
    for (const item of props.items || []) {
      if (item.separator) {
        const hr = el("hr", "easel-menu-divider");
        this.popup.append(hr);
        continue;
      }
      const itemBtn = button(item.label || item.id, "easel-menu-trigger", () => {
        this.toggle(false);
        this.onEvent?.("select", { id: item.id });
      });
      itemBtn.setAttribute("role", "menuitem");
      if (item.disabled) itemBtn.disabled = true;
      if (item.danger) itemBtn.classList.add("danger");
      if (item.shortcut) {
        const hint = el("span", "easel-menu-shortcut", item.shortcut);
        itemBtn.append(hint);
      }
      this.popup.append(itemBtn);
    }
  }

  destroy() {
    document.removeEventListener("pointerdown", this.outside);
    document.removeEventListener("keydown", this.keydown);
  }
}
