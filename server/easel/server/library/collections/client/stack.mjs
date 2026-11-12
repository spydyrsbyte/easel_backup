import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";
export default class Stack extends Base {
  constructor() {
    super("easel.collections.stack", []);
  }
  update(p) {
    this.begin(p);
    const stack = el("div", "kit-item");
    stack.style.boxShadow = "2px 2px #777,4px 4px #333,6px 7px 10px #0008";
    if (p.items.length)
      stack.append(this.rows(p.items.slice(-1), { select: true }));
    stack.append(this.text(p.count || p.items.length, "strong"));
    stack.append(
      this.button("Take", "request", { action: "take", value: { count: 1 } }),
      this.button("Split", "request", {
        action: "split",
        value: { count: Math.ceil((p.count || p.items.length) / 2) },
      }),
    );
    this.content.append(stack);
  }
}
