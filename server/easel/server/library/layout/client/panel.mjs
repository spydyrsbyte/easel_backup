import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";
export default class Panel extends Base {
  constructor() {
    super("easel.layout.panel", ["header", "body", "footer"]);
  }
  update(p) {
    this.begin(p);
    this.content.append(this.slots.header);
    this.content.append(
      this.button(p.collapsed ? "Expand" : "Collapse", "change", {
        value: { collapsed: !p.collapsed },
      }),
    );
    this.slots.body.hidden = p.collapsed;
    this.content.append(this.slots.body);
    if (!p.collapsed && p.text) this.content.append(this.text(p.text));
    this.content.append(this.slots.footer);
  }
}
