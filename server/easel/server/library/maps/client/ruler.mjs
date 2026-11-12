import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";
export default class Ruler extends Base {
  constructor() {
    super("easel.maps.ruler", []);
  }
  update(p) {
    this.begin(p);
    const svg = this.svg("svg", { viewBox: "0 0 " + p.width + " " + p.height });
    svg.style.touchAction = "none";
    let from = p.data.from ?? { x: 0, y: 0 },
      to = p.data.to ?? { x: 0, y: 0 };
    const line = this.svg("line", { stroke: "#d6ae65", "stroke-width": 3 }),
      label = this.svg("text", { fill: "#fff", "font-size": 14 });
    svg.append(line, label);
    const draw = () => {
      for (const [k, v] of Object.entries({
        x1: from.x,
        y1: from.y,
        x2: to.x,
        y2: to.y,
      }))
        line.setAttribute(k, v);
      label.setAttribute("x", (from.x + to.x) / 2);
      label.setAttribute("y", (from.y + to.y) / 2 - 10);
      label.textContent = Math.hypot(to.x - from.x, to.y - from.y).toFixed(2);
    };
    const point = (e) => {
      const b = svg.getBoundingClientRect();
      return {
        x: ((e.clientX - b.left) * p.width) / b.width,
        y: ((e.clientY - b.top) * p.height) / b.height,
      };
    };
    svg.onpointerdown = (e) => {
      from = point(e);
      to = { ...from };
      svg.setPointerCapture(e.pointerId);
      svg.onpointermove = (ev) => {
        to = point(ev);
        draw();
      };
      svg.onpointerup = () => {
        svg.onpointermove = null;
        this.emit("measure", {
          distance: Math.hypot(to.x - from.x, to.y - from.y),
          from,
          to,
        });
      };
      draw();
    };
    draw();
    this.content.append(svg);
  }
}
