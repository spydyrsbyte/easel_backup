import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";
export default class Ready extends Base {
  constructor() {
    super("easel.turns.ready", []);
  }
  update(p) {
    this.begin(p);
    for (const item of p.items)
      this.content.append(
        this.text(
          (item.label ?? item.id) + ": " + (item.ready ? "Ready" : "Waiting"),
          "div",
          "kit-item",
        ),
      );
    this.content.append(
      this.button("Ready", "request", {
        action: "ready",
        value: { ready: true },
      }),
    );
  }
}
