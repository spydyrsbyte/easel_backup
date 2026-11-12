import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";
export default class Dragdrop extends Base {
  constructor() {
    super("easel.input.dragdrop", ["body"]);
  }
  update(p) {
    this.begin(p);
    const zone = el("div", "kit-item");
    this.dropzone(zone, p.data.id ?? this.name);
    for (const item of p.items) {
      const node = this.text(
        item.label ?? item.name ?? item.id,
        "div",
        "kit-item",
      );
      node.tabIndex = 0;
      this.draggable(node, item.id, p.data.id ?? this.name);
      node.onkeydown = (e) => {
        if (e.key === "Enter")
          this.emit("drop", {
            id: String(item.id),
            source: String(item.source ?? ""),
            destination: String(p.data.id ?? this.name),
            x: 0,
            y: 0,
          });
      };
      zone.append(node);
    }
    zone.append(this.slots.body);
    this.content.append(zone);
  }
}
