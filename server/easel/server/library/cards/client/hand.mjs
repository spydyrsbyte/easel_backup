import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";
export default class Hand extends Base {
  constructor() {
    super("easel.cards.hand", []);
  }
  update(p) {
    this.begin(p);
    const fan = el("div", "kit-fan");
    fan.style.setProperty(
      "--card-width",
      Number(p.data.cardWidth ?? 110) + "px",
    );
    fan.style.setProperty(
      "--card-overlap",
      Number(p.data.overlap ?? 30) + "px",
    );
    for (const item of p.items) {
      const node = this.card({
        ...item,
        selected: p.selected.includes(String(item.id)),
      });
      const keydown = node.onkeydown;
      node.onkeydown = (e) => {
        if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
          e.preventDefault();
          const at = p.items.indexOf(item),
            before = p.items[at + (e.key === "ArrowLeft" ? -1 : 2)];
          this.emit("reorder", {
            id: String(item.id),
            before: String(before?.id ?? ""),
          });
        } else keydown?.(e);
      };
      this.draggable(node, item.id, p.data.id ?? this.name);
      fan.append(node);
    }
    this.dropzone(fan, p.data.id ?? this.name);
    this.content.append(fan);
  }
}
