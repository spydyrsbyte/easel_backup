import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";
export default class Mask extends Base {
  constructor() {
    super("easel.visibility.mask", ["body"]);
  }
  update(p) {
    this.begin(p);
    this.element.style.background =
      "rgba(0,0,0," + Math.max(0, Math.min(1, p.opacity)) + ")";
    this.content.append(this.text(p.text));
  }
}
