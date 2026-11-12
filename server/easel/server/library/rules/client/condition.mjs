import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";
export default class Condition extends Base {
  constructor() {
    super("easel.rules.condition", []);
  }
  update(p) {
    this.begin(p);
    for (const item of p.items) {
      const row = el("div", "kit-item");
      row.append(
        this.text(
          (item.met ? "Satisfied: " : "Unmet: ") + (item.label ?? item.id),
        ),
        this.text(item.reason ?? "", "small", "kit-muted"),
      );
      this.content.append(row);
    }
  }
}
