import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";
export default class Exchange extends Base {
  constructor() {
    super("easel.resources.exchange", []);
  }
  update(p) {
    this.begin(p);
    this.content.append(
      this.field(p.data.from ?? "Quantity", p.value, "quantity", "number"),
    );
    const result = p.value * Number(p.data.rate ?? 1);
    this.content.append(
      this.text(
        p.value +
          " " +
          (p.data.from ?? "") +
          " = " +
          result +
          " " +
          (p.data.to ?? ""),
      ),
      this.button("Exchange", "request", {
        action: "exchange",
        value: { quantity: p.value },
      }),
    );
  }
}
