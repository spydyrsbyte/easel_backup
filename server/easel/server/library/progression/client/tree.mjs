import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";
export default class Tree extends Base {
  constructor() {
    super("easel.progression.tree", []);
  }
  update(p) {
    this.begin(p);
    const list = el("ul", "kit-list");
    for (const item of p.items) {
      const selected = p.selected.includes(String(item.id)),
        eligible = (item.requires ?? []).every((id) =>
          p.selected.includes(String(id)),
        );
      const node = el("li", "kit-item");
      node.style.marginInlineStart =
        Math.min(10, (item.requires ?? []).length) * 16 + "px";
      node.append(
        this.button(
          (selected ? "Selected: " : "") + (item.label ?? item.id),
          "select",
          { id: String(item.id) },
          !eligible && !selected,
        ),
      );
      if (item.requires?.length)
        node.append(
          this.text(
            "Requires: " + item.requires.join(", "),
            "small",
            "kit-muted",
          ),
        );
      list.append(node);
    }
    this.content.append(list);
  }
}
