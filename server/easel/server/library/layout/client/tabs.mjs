import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";
export default class Tabs extends Base {
  constructor() {
    super("easel.layout.tabs", [
      "body",
      ...Array.from({ length: 16 }, (_, i) => "tab" + i),
    ]);
  }
  update(p) {
    this.begin(p);
    if (p.items.length > 16)
      throw new RangeError(
        "Tabs support up to sixteen independently mounted panels",
      );
    const active = p.active || p.items[0]?.id,
      nav = el("div", "kit-row");
    nav.setAttribute("role", "tablist");
    for (const item of p.items) {
      const b = this.button(item.label ?? item.id, "change", {
        value: { active: item.id },
      });
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", String(active === item.id));
      nav.append(b);
    }
    this.content.append(nav, this.slots.body);
    for (let i = 0; i < 16; i++) {
      const slot = this.slots["tab" + i];
      slot.setAttribute("role", "tabpanel");
      slot.hidden = p.items[i]?.id !== active;
      this.content.append(slot);
    }
  }
}
