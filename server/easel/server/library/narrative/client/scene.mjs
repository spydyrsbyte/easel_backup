import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";
export default class Scene extends Base {
  constructor() {
    super("easel.narrative.scene", ["body"]);
  }
  update(p) {
    this.begin(p);
    this.content.append(
      this.text(p.data.name ?? p.data.title ?? "", "strong"),
      this.text(p.data.description ?? ""),
    );
    if (p.items.length) this.content.append(this.rows(p.items));
    this.content.append(this.slots.body);
  }
}
