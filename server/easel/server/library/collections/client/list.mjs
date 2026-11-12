import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";
export default class List extends Base {
  constructor() {
    super("easel.collections.list", []);
  }
  update(p) {
    this.begin(p);
    this.content.append(
      this.rows(p.items, {
        select: true,
        actions: p.actions,
        fields: p.fields,
      }),
    );
  }
}
