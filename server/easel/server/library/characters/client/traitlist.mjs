import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";
export default class Traitlist extends Base {
  constructor() {
    super("easel.characters.traitlist", []);
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
