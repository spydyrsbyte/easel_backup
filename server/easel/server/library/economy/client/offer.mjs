import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";
export default class Offer extends Base {
  constructor() {
    super("easel.economy.offer", []);
  }
  update(p) {
    this.begin(p);
    this.content.append(
      this.text(p.data.label ?? p.data.id ?? "Offer", "strong"),
      this.text("Price: " + (p.data.price ?? "?")),
      this.text("Available: " + (p.data.quantity ?? 0)),
      this.field("Quantity", p.value, "quantity", "number"),
      this.button(
        "Accept",
        "request",
        {
          action: "accept",
          value: { id: String(p.data.id ?? ""), quantity: p.value },
        },
        p.value <= 0 || p.value > Number(p.data.quantity ?? 0),
      ),
      this.button("Decline", "request", {
        action: "decline",
        value: { id: String(p.data.id ?? "") },
      }),
    );
  }
}
