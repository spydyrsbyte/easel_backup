import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";
export default class Inspector extends Base {
  constructor() {
    super("easel.objects.inspector", []);
  }
  update(p) {
    this.begin(p);
    for (const f of p.fields) {
      const id = String(f.path ?? f.id ?? f),
        v = id.split(".").reduce((v, k) => v?.[k], p.data);
      if (v !== undefined)
        this.content.append(this.text((f.label ?? id) + ": " + String(v)));
    }
    for (const a of p.actions)
      this.content.append(
        this.button(a.label ?? a.id, "request", {
          action: a.id,
          value: { id: String(p.data.id ?? "") },
        }),
      );
  }
}
