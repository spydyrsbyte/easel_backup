import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";
export default class Clock extends Base {
  constructor() {
    super("easel.tracks.clock", []);
  }
  update(p) {
    this.begin(p);
    if (p.segments < 1 || p.segments > 1000)
      throw new RangeError("Invalid clock segments");
    const svg = this.svg("svg", { viewBox: "0 0 120 120" });
    svg.style.width = "140px";
    for (let i = 0; i < p.segments; i++) {
      const a = (((i / p.segments) * 360 - 90) * Math.PI) / 180,
        b = ((((i + 1) / p.segments) * 360 - 90) * Math.PI) / 180;
      const arc = this.svg("path", {
        d:
          "M60 60 L" +
          (60 + 52 * Math.cos(a)) +
          " " +
          (60 + 52 * Math.sin(a)) +
          " A52 52 0 " +
          (p.segments === 1 ? 1 : 0) +
          " 1 " +
          (60 + 52 * Math.cos(b - 0.001)) +
          " " +
          (60 + 52 * Math.sin(b - 0.001)) +
          " Z",
        fill: i < p.value ? "#d6ae65" : "#303842",
        stroke: "#121820",
        "stroke-width": 2,
      });
      arc.tabIndex = 0;
      arc.setAttribute("role", "button");
      arc.setAttribute("aria-label", "Fill " + (i + 1) + " segments");
      arc.onclick = () => this.emit("change", { value: { value: i + 1 } });
      svg.append(arc);
    }
    this.content.append(svg, this.text(p.value + " / " + p.segments));
  }
}
