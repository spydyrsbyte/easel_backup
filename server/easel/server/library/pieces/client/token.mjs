import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";
export default class Token extends Base {
  constructor() {
    super("easel.pieces.token", ["overlay"]);
  }
  update(p) {
    this.begin(p);
    const token = el("div", "kit-piece");
    token.style.width = Math.max(16, p.size) + "px";
    token.style.height = Math.max(16, p.size) + "px";
    token.style.transform = "rotate(" + p.orientation + "deg)";
    if (p.data.color) token.style.background = String(p.data.color);
    if (p.src) token.append(this.image(p.src, p.alt));
    else
      token.textContent = String(
        p.text || p.data.label || p.data.name || p.data.value || "",
      );
    token.tabIndex = 0;
    token.setAttribute("role", "button");
    token.setAttribute("aria-label", p.alt || p.text || "Piece");
    token.onclick = () => this.emit("select", { id: String(p.data.id ?? "") });
    this.draggable(token, p.data.id ?? "", p.data.source ?? "");
    this.content.append(token, this.slots.overlay);
  }
}
