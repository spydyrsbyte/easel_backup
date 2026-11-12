import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";
export default class Meeple extends Base {
  constructor() {
    super("easel.pieces.meeple", []);
  }
  update(p) {
    this.begin(p);
    const svg = this.svg("svg", { viewBox: "0 0 100 100" });
    svg.style.width = Math.max(16, p.size) + "px";
    svg.style.minHeight = "0";
    const shape = this.svg("path", {
      d: "M40 30 A15 15 0 1 1 60 30 L83 45 L76 60 L63 53 L70 95 L51 95 L50 69 L49 95 L30 95 L37 53 L24 60 L17 45 Z",
      fill: p.data.color ?? "#d6ae65",
      stroke: "#ffffff88",
      "stroke-width": 2,
    });
    svg.append(shape);
    svg.setAttribute("role", "button");
    svg.setAttribute("aria-label", p.data.label ?? "Meeple");
    svg.tabIndex = 0;
    svg.onclick = () => this.emit("select", { id: String(p.data.id ?? "") });
    this.content.append(svg);
  }
}
