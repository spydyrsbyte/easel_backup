import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";
export default class Effectlist extends Base {
  constructor() {
    super("easel.effects.effectlist", []);
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
