import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";
export default class Wizard extends Base {
  constructor() {
    super("easel.workflow.wizard", ["body"]);
  }
  update(p) {
    this.begin(p);
    const at = Math.max(
        0,
        p.items.findIndex((i) => i.id === p.active),
      ),
      step = p.items[at];
    if (step)
      this.content.append(
        this.text(
          at + 1 + " / " + p.items.length + " / " + (step.label ?? step.id),
          "strong",
        ),
        this.text(step.description ?? ""),
      );
    this.content.append(this.slots.body);
    const row = el("div", "kit-row");
    row.append(
      this.button(
        "Back",
        "request",
        { action: "back", value: { step: p.active } },
        at === 0,
      ),
      this.button(at === p.items.length - 1 ? "Submit" : "Next", "request", {
        action: at === p.items.length - 1 ? "submit" : "next",
        value: { step: p.active },
      }),
      this.button("Cancel", "close", {}),
    );
    this.content.append(row);
  }
}
