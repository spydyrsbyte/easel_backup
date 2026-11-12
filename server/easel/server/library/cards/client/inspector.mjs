import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";
export default class Inspector extends Base {
  constructor() {
    super("easel.cards.inspector", []);
  }
  update(p) {
    this.begin(p);
    this.element.classList.add("kit-inspect");
    this.element.classList.toggle("kit-modal", p.pinned);
    this.element.setAttribute("role", p.pinned ? "dialog" : "region");
    this.element.setAttribute("aria-label", "Inspect card");
    const face = p.data.faceUp !== false;
    this.content.append(
      this.image(
        face ? (p.data.image ?? p.data.face ?? p.data.src) : p.data.back,
        face ? (p.data.name ?? "Card") : "Face-down card",
      ),
    );
    if (face) {
      this.content.append(
        this.text(p.data.name, "strong"),
        this.text(p.data.type, "small"),
        this.text(p.data.description ?? p.data.oracle ?? ""),
      );
    }
    this.content.append(this.button("Close inspection", "close", {}));
  }
}
