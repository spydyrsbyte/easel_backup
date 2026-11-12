import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";
export default class Damage extends Base {
  constructor() {
    super("easel.combat.damage", []);
  }
  update(p) {
    this.begin(p);
    for (const key of [
      "amount",
      "armor",
      "reduction",
      "resistance",
      "absorbed",
      "total",
      "consequence",
    ])
      if (p.data[key] !== undefined)
        this.content.append(
          this.text(key + ": " + p.data[key], key === "total" ? "strong" : "p"),
        );
  }
}
