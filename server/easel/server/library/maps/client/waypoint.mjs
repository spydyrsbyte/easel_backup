import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";
export default class Waypoint extends Base {
  constructor() {
    super("easel.maps.waypoint", []);
  }
  update(p) {
    this.begin(p);
    const nav = el("ol", "kit-list");
    for (const [index, item] of p.items.entries()) {
      const li = el("li");
      li.append(
        this.button(index + 1 + ". " + (item.label ?? item.id), "select", {
          id: String(item.id),
        }),
      );
      nav.append(li);
    }
    this.content.append(nav);
  }
}
