import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";
export default class Priority extends Base {
  constructor() {
    super("easel.turns.priority", []);
  }
  update(p) {
    this.begin(p);
    this.content.append(
      this.rows(
        p.items.map((i) => ({
          ...i,
          label: (i.label ?? i.id) + (i.id === p.active ? " / priority" : ""),
          description: i.passed ? "Passed" : "Waiting",
        })),
      ),
    );
    this.content.append(
      this.button("Pass", "request", { action: "pass", value: {} }),
      this.button("Claim", "request", { action: "claim", value: {} }),
    );
  }
}
