import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";
export default class Outcome extends Base {
  constructor() {
    super("easel.rules.outcome", []);
  }
  update(p) {
    this.begin(p);
    const outcome = this.text(
      p.data.label ??
        p.data.outcome ??
        (p.data.success ? "Success" : "Failure"),
      "strong",
      "kit-badge",
    );
    outcome.style.color = p.data.success ? "#a8d3b2" : "#ecc192";
    this.content.append(outcome);
    if (p.data.description) this.content.append(this.text(p.data.description));
    if (p.data.margin !== undefined)
      this.content.append(this.text("Margin: " + p.data.margin));
  }
}
