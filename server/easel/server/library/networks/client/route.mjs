import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";
export default class Route extends Base {
  constructor() {
    super("easel.networks.route", []);
  }
  update(p) {
    this.begin(p);
    const svg = this.svg("svg", { viewBox: "0 0 600 400" });
    for (const route of p.alternatives)
      svg.append(
        this.svg("polyline", {
          points: route.map((v) => Number(v.x) + "," + Number(v.y)).join(" "),
          fill: "none",
          stroke: "#66717f",
          "stroke-width": 2,
        }),
      );
    svg.append(
      this.svg("polyline", {
        points: p.points.map((v) => Number(v.x) + "," + Number(v.y)).join(" "),
        fill: "none",
        stroke: "#d6ae65",
        "stroke-width": 4,
      }),
    );
    this.content.append(svg);
  }
}
