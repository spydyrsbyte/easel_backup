import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";
export default class Tray extends Base {
  constructor() {
    super("easel.dice.tray", []);
  }
  update(p) {
    this.begin(p);
    const tray = el("div", "kit-row");
    for (const [index, d] of p.items.entries())
      tray.append(
        this.button("d" + (d.sides ?? 6) + ": " + (d.value ?? "?"), "request", {
          action: "reroll",
          value: { index },
        }),
      );
    tray.append(
      this.button("Roll", "request", { action: "roll", value: {} }),
      this.button("Clear", "request", { action: "clear", value: {} }),
    );
    this.content.append(tray);
  }
}
