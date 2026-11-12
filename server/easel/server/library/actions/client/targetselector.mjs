import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";
export default class Targetselector extends Base {
  constructor() {
    super("easel.actions.targetselector", []);
  }
  update(p) {
    this.begin(p);
    this.content.append(this.rows(p.items, { select: true }));
  }
}
