import { number, bounded } from "./support.mjs";
export default class ProgressTool {
  advance(value, amount = 1, { min = 0, max = 10 } = {}) {
    number(value);
    number(amount);
    const next = bounded(value + amount, min, max);
    return { value: next, complete: next === max, remaining: max - next };
  }
}
