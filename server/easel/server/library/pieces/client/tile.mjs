import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";
export default class Tile extends Base {
  constructor() {
    super("easel.pieces.tile", []);
  }
  update(p) {
    this.begin(p);
    const tile = el("div", "kit-item");
    tile.style.aspectRatio = String(p.data.aspect ?? "1");
    tile.style.transform = "rotate(" + p.orientation + "deg)";
    if (p.src) tile.append(this.image(p.src, p.alt));
    else tile.append(this.text(p.text || p.data.label || ""));
    for (const edge of p.data.edges ?? [])
      tile.append(this.text(edge, "span", "kit-badge"));
    tile.append(
      this.button("Flip", "request", {
        action: "flip",
        value: { id: String(p.data.id ?? "") },
      }),
    );
    this.draggable(tile, p.data.id ?? "");
    this.content.append(tile);
  }
}
