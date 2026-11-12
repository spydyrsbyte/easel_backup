import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";
export default class Regionmarker extends Base {
  constructor() {
    super("easel.territory.regionmarker", []);
  }
  update(p) {
    this.begin(p);
    const badge = this.text(
      p.text || p.data.label || p.data.name || String(p.data.value ?? ""),
      "span",
      "kit-badge",
    );
    if (p.src) badge.prepend(this.image(p.src, p.alt));
    if (p.data.description) badge.title = String(p.data.description);
    this.content.append(badge);
  }
}
