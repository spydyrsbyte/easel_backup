import { number, key } from "./support.mjs";
export default class ExchangeTool {
  quote(quantity, { from, to, rate = 1, rounding = "floor" }) {
    key(from);
    key(to);
    number(quantity);
    number(rate);
    if (quantity < 0 || rate <= 0 || from === to)
      throw new RangeError("Invalid exchange");
    const round = {
      floor: Math.floor,
      ceil: Math.ceil,
      nearest: Math.round,
      exact: (v) => v,
    }[rounding];
    if (!round) throw new Error("Unknown rounding policy");
    return {
      debit: { [from]: quantity },
      credit: { [to]: round(quantity * rate) },
    };
  }
}
