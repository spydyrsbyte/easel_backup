import { copy, number, record, key } from "./support.mjs";
export default class CostTool {
  quote(balances, cost) {
    record(balances);
    record(cost);
    const missing = {};
    for (const [id, amount] of Object.entries(cost)) {
      key(id);
      if (number(amount) < 0) throw new RangeError("Negative cost");
      const short = amount - number(balances[id] ?? 0);
      if (short > 0) missing[id] = short;
    }
    return {
      cost: copy(cost),
      missing,
      affordable: Object.keys(missing).length === 0,
    };
  }
}
