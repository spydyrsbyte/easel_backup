import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";
export default class Item extends Base {
  constructor() {
    super("easel.inventory.item", []);
  }
  update(p) {
    this.begin(p);
    if (p.src) this.content.append(this.image(p.src, p.alt));
    this.content.append(
      this.text(
        p.data.label ?? p.data.name ?? p.data.title ?? p.text,
        "strong",
      ),
    );
    if (p.data.description || p.data.text)
      this.content.append(this.text(p.data.description ?? p.data.text));
    if (p.data.quantity !== undefined)
      this.content.append(this.text("Quantity: " + p.data.quantity));
    for (const tag of p.data.tags ?? [])
      this.content.append(this.text(tag, "span", "kit-badge"));
    for (const a of p.actions)
      this.content.append(
        this.button(a.label ?? a.id, "request", {
          action: a.id,
          value: { id: String(p.data.id ?? "") },
        }),
      );
  }
}
