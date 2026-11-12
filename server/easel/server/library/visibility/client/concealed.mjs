import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";
export default class Concealed extends Base {
  constructor() {
    super("easel.visibility.concealed", []);
  }
  update(p) {
    this.begin(p);
    const known = p.data.known === true && p.data.faceUp !== false;
    this.content.append(
      this.text(
        known ? (p.data.label ?? p.data.name ?? "Known") : "Unknown",
        "div",
        "kit-item",
      ),
    );
    if (known && p.data.image)
      this.content.append(this.image(p.data.image, p.data.label ?? ""));
  }
}
