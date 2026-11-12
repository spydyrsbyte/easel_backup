import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";
export default class Notification extends Base {
  constructor() {
    super("easel.display.notification", []);
  }
  update(p) {
    this.begin(p);
    this.element.setAttribute("aria-live", "polite");
    for (const item of p.items) {
      const row = el("div", "kit-item");
      row.append(
        this.text(item.text ?? item.label),
        this.button("Dismiss", "request", {
          action: "dismiss",
          value: { id: item.id },
        }),
      );
      this.content.append(row);
    }
  }
}
