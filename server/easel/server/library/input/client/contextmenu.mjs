import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";
export default class Contextmenu extends Base {
  constructor() {
    super("easel.input.contextmenu", []);
  }
  update(p) {
    this.begin(p);
    const menu = el("div", "kit-list");
    menu.setAttribute("role", "menu");
    for (const a of p.items) {
      const b = this.button(
        a.label ?? a.id,
        "action",
        { id: String(a.id) },
        a.disabled,
      );
      b.setAttribute("role", "menuitem");
      menu.append(b);
    }
    this.content.append(menu);
  }
}
