import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";
export default class Inventory extends Base {
  constructor() {
    super("easel.inventory.inventory", []);
  }
  update(p) {
    this.begin(p);
    const grid = el("div", "kit-tiles");
    for (const item of p.items) {
      const row = el("div", "kit-item");
      if (item.image) row.append(this.image(item.image, item.name ?? item.id));
      row.append(
        this.text(item.name ?? item.id, "strong"),
        this.text("Quantity: " + (item.quantity ?? 1)),
        this.button("Equip", "request", {
          action: "equip",
          value: { id: item.id },
        }),
      );
      this.draggable(row, item.id, p.data.id ?? "inventory");
      grid.append(row);
    }
    this.dropzone(grid, p.data.id ?? "inventory");
    this.content.append(grid);
  }
}
