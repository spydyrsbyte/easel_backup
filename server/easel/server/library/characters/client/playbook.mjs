import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";
export default class Playbook extends Base {
  constructor() {
    super("easel.characters.playbook", ["body"]);
  }
  update(p) {
    this.begin(p);
    for (const field of p.fields) {
      const id = String(field.id ?? field.path),
        v = p.data[id] ?? field.value ?? "";
      if (p.editable) {
        const row = this.field(field.label ?? id, v, id, field.type ?? "text");
        this.content.append(row);
      } else
        this.content.append(this.text((field.label ?? id) + ": " + String(v)));
    }
    this.content.append(this.slots.body);
  }
}
