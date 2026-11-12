import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";
export default class Hexgrid extends Base {
  constructor() {
    super("easel.surfaces.hexgrid", []);
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
    for (let row = 0; row < p.height / (size * 1.5); row++)
      for (let col = 0; col < p.width / (size * Math.sqrt(3)); col++) {
        const x = size * Math.sqrt(3) * (col + (row % 2) / 2),
          y = size * 1.5 * row;
        const points = Array.from({ length: 6 }, (_, i) => {
          const a = ((i * 60 - 30) * Math.PI) / 180;
          return [x + size * Math.cos(a), y + size * Math.sin(a)].join(",");
        }).join(" ");
        const cell = this.svg("polygon", {
          points,
          fill: "transparent",
          stroke: "#ffffff30",
        });
        cell.onclick = () => this.emit("position", { x: col, y: row });
        svg.append(cell);
      }
    this.content.append(svg);
  }
}
