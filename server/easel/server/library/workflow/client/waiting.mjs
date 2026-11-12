import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";
export default class Waiting extends Base {
  constructor() {
    super("easel.workflow.waiting", []);
  }
  update(p) {
    this.begin(p);
    this.element.setAttribute("aria-live", "polite");
    this.content.append(
      this.text(
        p.items.filter((i) => !i.ready).length + " outstanding responders",
        "strong",
      ),
      this.rows(
        p.items.map((i) => ({
          ...i,
          description: i.ready ? "Ready" : "Waiting",
        })),
      ),
    );
  }
}
