import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";
export default class Controlmap extends Base {
  constructor() {
    super("easel.territory.controlmap", []);
  }
  update(p) {
    this.begin(p);
    const svg = this.svg("svg", { viewBox: "0 0 " + p.width + " " + p.height });
    for (const r of p.regions) {
      const shape = this.svg("polygon", {
        points: (r.points ?? [])
          .map((v) => Number(v.x) + "," + Number(v.y))
          .join(" "),
        fill: r.color ?? "#384654",
        stroke: r.contested ? "#fff" : "#111",
        "stroke-width": r.contested ? 4 : 1,
      });
      shape.onclick = () => this.emit("select", { id: String(r.id) });
      const title = this.svg("title");
      title.textContent =
        String(r.label ?? r.id) +
        " / " +
        String(r.controller ?? "Uncontrolled");
      shape.append(title);
      svg.append(shape);
    }
    this.content.append(svg);
  }
}
