import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";
export default class Camera extends Base {
  constructor() {
    super("easel.surfaces.camera", []);
  }
  update(p) {
    this.begin(p);
    const row = el("div", "kit-row");
    row.setAttribute("role", "toolbar");
    row.setAttribute("aria-label", "Camera controls");
    row.append(
      this.button("Rotate view left", "rotate", { degrees: -45 }),
      this.button("Rotate view right", "rotate", { degrees: 45 }),
      this.button("Zoom in", "zoom", { factor: 1.2 }),
      this.button("Zoom out", "zoom", { factor: 1 / 1.2 }),
      this.button("Whole table", "view", { seat: "" }),
    );
    if (p.items.length) {
      const select = el("select");
      select.setAttribute("aria-label", "View player area");
      select.append(new Option("View player area...", ""));
      for (const i of p.items)
        select.append(new Option(i.label ?? i.id, String(i.id)));
      select.onchange = () => this.emit("view", { seat: select.value });
      row.append(select);
    }
    this.content.append(row);
  }
}
