import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";
export default class Placement extends Base {
  constructor() {
    super("easel.surfaces.placement", ["body"]);
  }
  update(p) {
    this.begin(p);
    const area = el("div", "kit-surface");
    area.style.height = p.height + "px";
    const ghost = el("div", "kit-piece");
    ghost.style.position = "absolute";
    ghost.style.opacity = ".5";
    ghost.textContent = p.data.label ?? "Place";
    area.append(ghost, this.slots.body);
    area.onpointermove = (e) => {
      const b = area.getBoundingClientRect();
      ghost.style.left = e.clientX - b.left + "px";
      ghost.style.top = e.clientY - b.top + "px";
    };
    area.onclick = (e) => {
      const b = area.getBoundingClientRect();
      this.emit("position", { x: e.clientX - b.left, y: e.clientY - b.top });
    };
    this.content.append(area);
  }
}
