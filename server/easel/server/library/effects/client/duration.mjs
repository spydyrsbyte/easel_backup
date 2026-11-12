import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";
export default class Duration extends Base {
  constructor() {
    super("easel.effects.duration", []);
  }
  update(p) {
    this.begin(p);
    this.content.append(
      this.text(Math.max(0, p.value) + " " + p.unit, "span", "kit-badge"),
    );
  }
}
