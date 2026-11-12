import { copy, number, integer, record, key } from "./support.mjs";
export default class AllocationTool {
  evaluate(values, rules, budget) {
    record(values);
    record(rules);
    number(budget);
    let cost = 0;
    for (const [id, value] of Object.entries(values)) {
      key(id);
      const rule = rules[id];
      if (!rule) throw new Error("Unknown allocation field");
      integer(value, rule.min ?? 0, rule.max ?? 1000000);
      const unit = number(rule.cost ?? 1);
      if (unit < 0) throw new RangeError("Negative cost");
      cost += (value - (rule.min ?? 0)) * unit;
    }
    return {
      values: copy(values),
      cost,
      remaining: budget - cost,
      affordable: cost <= budget,
    };
  }
}
