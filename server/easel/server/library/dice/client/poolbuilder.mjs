import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";
export default class Poolbuilder extends Base {
  constructor() {
    super("easel.dice.poolbuilder", []);
  }
  update(p) {
    this.begin(p);
    for (const d of p.items)
      this.content.append(
        this.field("d" + d.sides, d.count ?? 0, String(d.sides), "number"),
      );
    this.content.append(
      this.button("Roll pool", "request", { action: "roll", value: {} }),
    );
  }
}
