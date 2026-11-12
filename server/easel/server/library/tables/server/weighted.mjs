import { copy, list, integer } from "./support.mjs";
import { random } from "./random.mjs";
export default class WeightedTool {
  choose(entries, source) {
    const values = list(entries),
      total = values.reduce((n, e) => n + integer(e.weight, 0, 1000000), 0);
    integer(total, 1, Number.MAX_SAFE_INTEGER);
    let target = integer(random(source).integer(0, total), 0, total - 1);
    for (const e of values) {
      if (target < e.weight) return copy(e.value);
      target -= e.weight;
    }
    throw new Error("Invalid weighted draw");
  }
}
