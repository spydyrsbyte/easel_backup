import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";
export default class Targetpicker extends Base {
  constructor() {
    super("easel.input.targetpicker", []);
  }
  update(p) {
    this.begin(p);
    this.content.append(this.rows(p.items, { select: true }));
  }
}
