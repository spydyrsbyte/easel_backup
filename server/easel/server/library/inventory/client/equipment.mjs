import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";
export default class Equipment extends Base {
  constructor() {
    super("easel.inventory.equipment", []);
  }
  update(p) {
    this.begin(p);
    const grid = el("div", "kit-tiles");
    for (const slot of p.items) {
      const node = el("div", "kit-item");
      node.append(
        this.text(slot.label ?? slot.id, "strong"),
        this.text(slot.item?.name ?? slot.item?.id ?? "Empty"),
      );
      this.dropzone(node, slot.id);
      if (slot.item)
        node.append(
          this.button("Unequip", "request", {
            action: "unequip",
            value: { slot: slot.id, id: slot.item.id },
          }),
        );
      grid.append(node);
    }
    this.content.append(grid);
  }
}
