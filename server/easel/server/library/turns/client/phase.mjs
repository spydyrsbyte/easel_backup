import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";
export default class Phase extends Base {
  constructor() {
    super("easel.turns.phase", []);
  }
  update(p) {
    this.begin(p);
    const row = el("div", "kit-row");
    row.setAttribute("aria-label", "Phase progress");
    for (const item of p.items) {
      const label = this.text(item.label ?? item.id, "span", "kit-badge");
      if (item.id === p.active) {
        label.setAttribute("aria-current", "step");
        label.style.borderColor = "var(--kit-accent)";
      }
      row.append(label);
    }
    row.append(
      this.button("Next phase", "request", { action: "advance", value: {} }),
    );
    this.content.append(row);
  }
}
