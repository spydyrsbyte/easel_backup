import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";
export default class Actionbar extends Base {
  constructor() {
    super("easel.actions.actionbar", []);
  }
  update(p) {
    this.begin(p);
    const row = el("div", "kit-row");
    row.setAttribute("role", "toolbar");
    for (const a of p.actions.length ? p.actions : p.items)
      row.append(
        this.button(
          a.label ?? a.id,
          "request",
          { action: String(a.id), value: {} },
          !!a.disabled,
        ),
      );
    this.content.append(row);
  }
}
