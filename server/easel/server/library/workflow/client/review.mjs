import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";
export default class Review extends Base {
  constructor() {
    super("easel.workflow.review", []);
  }
  update(p) {
    this.begin(p);
    this.content.append(this.rows(p.items, { fields: p.fields }));
    if (p.data.total !== undefined)
      this.content.append(this.text("Total: " + p.data.total, "strong"));
    if (p.data.remaining !== undefined)
      this.content.append(this.text("Remaining: " + p.data.remaining));
    this.content.append(
      this.button("Confirm", "request", { action: "confirm", value: {} }),
      this.button("Back", "request", { action: "back", value: {} }),
    );
  }
}
