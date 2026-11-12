import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";
export default class Chooser extends Base {
  constructor() {
    super("easel.actions.chooser", []);
  }
  update(p) {
    this.begin(p);
    this.content.append(this.rows(p.items, { select: true }));
  }
}
