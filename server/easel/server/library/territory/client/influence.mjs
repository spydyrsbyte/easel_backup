import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";
export default class Influence extends Base {
  constructor() {
    super("easel.territory.influence", []);
  }
  update(p) {
    this.begin(p);
    for (const item of p.items) {
      const row = el("div", "kit-item");
      row.append(this.text(item.label ?? item.name ?? item.id, "strong"));
      const bar = el("div", "kit-progress"),
        fill = el("span");
      fill.style.width =
        Math.max(
          0,
          Math.min(1, Number(item.value ?? 0) / Number(item.max || 100)),
        ) *
          100 +
        "%";
      bar.append(fill);
      row.append(bar, this.text(item.value ?? 0));
      this.content.append(row);
    }
  }
}
