import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";
export default class Strip extends Base {
  constructor() {
    super("easel.collections.strip", []);
  }
  update(p) {
    this.begin(p);
    const list = this.rows(p.items, { select: true, actions: p.actions });
    list.style.display = "flex";
    list.style.overflow = "auto";
    this.content.append(list);
  }
}
