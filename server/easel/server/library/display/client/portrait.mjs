import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";
export default class Portrait extends Base {
  constructor() {
    super("easel.display.portrait", ["overlay"]);
  }
  update(p) {
    this.begin(p);
    const frame = el("figure", "kit-item");
    frame.append(this.image(p.src, p.alt));
    if (p.text) frame.append(this.text(p.text, "figcaption"));
    for (const s of p.data.statuses ?? [])
      frame.append(this.text(s, "span", "kit-badge"));
    this.content.append(frame);
    this.content.append(this.slots.overlay);
  }
}
