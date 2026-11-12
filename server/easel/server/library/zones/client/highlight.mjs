import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";
export default class Highlight extends Base {
  constructor() {
    super("easel.zones.highlight", ["body"]);
  }
  update(p) {
    this.begin(p);
    const area = el("div", "kit-item");
    area.style.width = Math.max(1, p.width) + "px";
    area.style.height = Math.max(1, p.height) + "px";
    area.style.borderColor = p.data.color ?? "var(--kit-accent)";
    area.style.background = p.data.active ? "#d6ae6522" : "transparent";
    area.append(this.text(p.text || p.data.label || ""), this.slots.body);
    this.content.append(area);
  }
}
