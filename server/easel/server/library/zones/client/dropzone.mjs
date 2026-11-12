import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";
export default class Dropzone extends Base {
  constructor() {
    super("easel.zones.dropzone", ["body"]);
  }
  update(p) {
    this.begin(p);
    const zone = el("div", "kit-item");
    zone.style.minHeight = "80px";
    zone.append(this.text(p.text), this.slots.body);
    zone.setAttribute("aria-label", p.text);
    this.dropzone(zone, p.data.id ?? this.name);
    this.content.append(zone);
  }
}
