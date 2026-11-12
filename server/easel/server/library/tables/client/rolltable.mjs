import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";
export default class Rolltable extends Base {
  constructor() {
    super("easel.tables.rolltable", []);
  }
  update(p) {
    this.begin(p);
    this.content.append(
      this.button("Roll", "request", { action: "roll", value: {} }),
    );
    if (p.data.result)
      this.content.append(
        this.text(
          p.data.result.label ?? p.data.result.text ?? String(p.data.result),
        ),
      );
    this.content.append(this.rows(p.items));
  }
}
