import { list, number } from "./support.mjs";
export default class ResultsTool {
  summarize(values) {
    const rolls = list(values).map(number);
    return {
      count: rolls.length,
      total: rolls.reduce((a, b) => a + b, 0),
      min: rolls.length ? Math.min(...rolls) : null,
      max: rolls.length ? Math.max(...rolls) : null,
    };
  }
  compare(values, target) {
    number(target);
    const summary = this.summarize(values);
    return {
      ...summary,
      successes: values.filter((v) => v >= target).length,
      failures: values.filter((v) => v < target).length,
    };
  }
}
