import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";
export default class Container extends Base {
  constructor() {
    super("easel.inventory.container", []);
  }
  update(p) {
    this.begin(p);
    const render = (items, depth = 0, trail = new Set()) => {
      if (depth > 32) throw new Error("Container nesting limit");
      const list = el("ul", "kit-list");
      for (const item of items) {
        if (trail.has(item.id)) throw new Error("Container cycle");
        const li = el("li", "kit-item"),
          details = el("details");
        details.append(
          this.text(item.label ?? item.name ?? item.id, "summary"),
        );
        if (item.items)
          details.append(
            render(item.items, depth + 1, new Set([...trail, item.id])),
          );
        this.dropzone(details, item.id);
        li.append(details);
        list.append(li);
      }
      return list;
    };
    this.content.append(render(p.items));
  }
}
