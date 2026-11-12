import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";
export default class Auction extends Base {
  constructor() {
    super("easel.economy.auction", []);
  }
  update(p) {
    this.begin(p);
    this.content.append(
      this.rows(
        p.items.map((b) => ({
          ...b,
          id: b.actor,
          label: b.actor,
          value: b.amount,
        })),
      ),
      this.text("Highest: " + (p.data.highest ?? 0)),
      this.field("Your bid", p.value, "bid", "number"),
      this.button(
        "Bid",
        "request",
        { action: "bid", value: { amount: p.value } },
        p.data.closed === true,
      ),
    );
    if (p.data.deadline !== undefined)
      this.content.append(
        this.text(
          "Closes: " + new Date(p.data.deadline).toISOString(),
          "small",
        ),
      );
  }
}
