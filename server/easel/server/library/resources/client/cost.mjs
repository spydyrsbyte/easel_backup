import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";
export default class Cost extends Base {
  constructor() {
    super("easel.resources.cost", []);
  }
  update(p) {
    this.begin(p);
    for (const item of p.items) {
      const row = el("div", "kit-row");
      const available =
        Number(item.available ?? 0) >= Number(item.required ?? item.value ?? 0);
      row.append(
        this.text(item.label ?? item.id),
        this.text(
          (item.required ?? item.value ?? 0) + " / " + (item.available ?? 0),
          "strong",
        ),
      );
      row.setAttribute(
        "aria-label",
        (item.label ?? item.id) +
          ": " +
          (available ? "available" : "insufficient"),
      );
      row.style.color = available ? "#9bceab" : "#e8a29b";
      this.content.append(row);
    }
  }
}
