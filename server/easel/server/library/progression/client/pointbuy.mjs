import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";
export default class Pointbuy extends Base {
  constructor() {
    super("easel.progression.pointbuy", []);
  }
  update(p) {
    this.begin(p);
    for (const item of p.items) {
      const row = this.field(
        item.label ?? item.id,
        item.value ?? item.min ?? 0,
        String(item.id),
        "number",
      );
      const input = row.querySelector("input");
      input.min = String(item.min ?? 0);
      input.max = String(item.max ?? 100);
      row.append(
        this.text("Cost per point: " + (item.cost ?? 1), "small", "kit-muted"),
      );
      this.content.append(row);
    }
    this.content.append(
      this.text("Remaining: " + (p.data.remaining ?? 0), "strong"),
    );
  }
}
