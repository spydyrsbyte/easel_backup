import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";
export default class Label extends Base {
  constructor() {
    super("easel.display.label", []);
  }
  update(p) {
    this.begin(p);
    this.content.append(this.text(p.text, "span", "kit-label"));
    if (p.src) this.content.prepend(this.image(p.src, p.alt));
  }
}
