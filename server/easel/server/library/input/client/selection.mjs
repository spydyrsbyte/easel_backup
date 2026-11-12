import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";
export default class Selection extends Base {
  constructor() {
    super("easel.input.selection", []);
  }
  update(p) {
    this.begin(p);
    this.content.append(this.rows(p.items, { select: true }));
  }
}
