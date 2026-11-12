import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";
export default class Price extends Base {
  constructor() {
    super("easel.economy.price", []);
  }
  update(p) {
    this.begin(p);
    this.content.append(
      this.text(
        String(p.data.total ?? p.value) + " " + String(p.data.currency ?? ""),
        "strong",
        "kit-badge",
      ),
    );
    if (p.data.tax !== undefined)
      this.content.append(this.text("Tax: " + p.data.tax, "small"));
  }
}
