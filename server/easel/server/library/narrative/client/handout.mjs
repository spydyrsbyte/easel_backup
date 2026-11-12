import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";
export default class Handout extends Base {
  constructor() {
    super("easel.narrative.handout", []);
  }
  update(p) {
    this.begin(p);
    if (p.src || p.data.image)
      this.content.append(
        this.image(p.src || p.data.image, p.alt || p.data.title || "Handout"),
      );
    this.content.append(
      this.text(p.data.title ?? p.title, "strong"),
      this.text(p.text || p.data.text || ""),
      this.button("Close", "close", {}),
    );
  }
}
