import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";
export default class Milestones extends Base {
  constructor() {
    super("easel.progression.milestones", []);
  }
  update(p) {
    this.begin(p);
    for (const item of p.items) {
      const row = el("div", "kit-item");
      row.append(
        this.text(item.label ?? item.id, "strong"),
        this.text(
          item.claimed ? "Claimed" : item.eligible ? "Available" : "Locked",
        ),
      );
      if (item.eligible && !item.claimed)
        row.append(
          this.button("Claim", "request", {
            action: "claim",
            value: { id: item.id },
          }),
        );
      this.content.append(row);
    }
  }
}
