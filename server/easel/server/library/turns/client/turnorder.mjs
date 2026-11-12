import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";
export default class Turnorder extends Base {
  constructor() {
    super("easel.turns.turnorder", []);
  }
  update(p) {
    this.begin(p);
    const rows = this.rows(p.items, { select: true });
    for (const row of rows.children) {
      if (row.dataset.id === p.active) {
        row.setAttribute("aria-current", "step");
        row.style.borderColor = "var(--kit-accent)";
        row.prepend(this.text("Active", "span", "kit-badge"));
      }
    }
    this.content.append(rows);
    for (const a of p.actions)
      this.content.append(
        this.button(a.label ?? a.id, "request", { action: a.id, value: {} }),
      );
  }
}
