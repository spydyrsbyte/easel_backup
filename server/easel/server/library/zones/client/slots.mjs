import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";
export default class Slots extends Base {
  constructor() {
    super("easel.zones.slots", []);
  }
  update(p) {
    this.begin(p);
    const grid = el("div", "kit-tiles");
    grid.style.gridTemplateColumns =
      "repeat(" + Math.max(1, Math.min(20, p.columns)) + ",minmax(0,1fr))";
    for (const i of p.items) {
      const slot = el("div", "kit-item");
      slot.append(this.text(i.label ?? i.id));
      this.dropzone(slot, i.id);
      grid.append(slot);
    }
    this.content.append(grid);
  }
}
