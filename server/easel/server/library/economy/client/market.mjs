import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";
export default class Market extends Base {
  constructor() {
    super("easel.economy.market", []);
  }
  update(p) {
    this.begin(p);
    const grid = el("div", "kit-tiles");
    for (const item of p.items) {
      const node = el("div", "kit-item");
      if (item.image)
        node.append(this.image(item.image, item.label ?? item.id));
      node.append(
        this.text(item.label ?? item.name ?? item.id, "strong"),
        this.text("Price: " + (item.price ?? "?")),
        this.text("Available: " + (item.quantity ?? "?")),
        this.button(
          "Quote",
          "request",
          { action: "quote", value: { id: item.id, quantity: 1 } },
          item.available === false,
        ),
        this.button(
          "Buy",
          "request",
          { action: "buy", value: { id: item.id, quantity: 1 } },
          item.available === false,
        ),
      );
      grid.append(node);
    }
    this.content.append(grid);
  }
}
