import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";
export default class Squaregrid extends Base {
  constructor() {
    super("easel.surfaces.squaregrid", []);
  }
  update(p) {
    this.begin(p);
    const size = Math.max(5, p.gridSize);
    if (
      !Number.isFinite(size) ||
      p.width <= 0 ||
      p.height <= 0 ||
      ((p.width / size) * p.height) / size > 10000
    )
      throw new RangeError("Grid bounds exceeded");
    const svg = this.svg("svg", { viewBox: "0 0 " + p.width + " " + p.height });
    svg.style.height = p.height + "px";
    for (let x = 0; x < p.width; x += size)
      for (let y = 0; y < p.height; y += size) {
        const cell = this.svg("rect", {
          x,
          y,
          width: size,
          height: size,
          fill: "transparent",
          stroke: "#ffffff30",
        });
        cell.onclick = () =>
          this.emit("position", { x: x / size, y: y / size });
        svg.append(cell);
        if (p.labels) {
          const t = this.svg("text", {
            x: x + 3,
            y: y + 14,
            fill: "#aaa",
            "font-size": 10,
          });
          t.textContent = x / size + "," + y / size;
          svg.append(t);
        }
      }
    this.content.append(svg);
  }
}
