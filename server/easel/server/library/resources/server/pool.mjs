import { copy, number, record, key } from "./support.mjs";
export default class PoolTool {
  adjust(balances, changes, { allowNegative = false } = {}) {
    record(balances);
    record(changes);
    const result = copy(balances);
    for (const [id, delta] of Object.entries(changes)) {
      key(id);
      const next = number(result[id] ?? 0) + number(delta);
      number(next);
      if (!allowNegative && next < 0)
        throw new Error("Insufficient resource: " + id);
      result[id] = next;
    }
    return result;
  }
  debit(balances, cost) {
    const changes = Object.fromEntries(
      Object.entries(record(cost)).map(([k, v]) => {
        if (number(v) < 0) throw new RangeError("Negative cost");
        return [k, -v];
      }),
    );
    return this.adjust(balances, changes);
  }
  credit(balances, amounts) {
    for (const v of Object.values(record(amounts)))
      if (number(v) < 0) throw new RangeError("Negative credit");
    return this.adjust(balances, amounts);
  }
}
