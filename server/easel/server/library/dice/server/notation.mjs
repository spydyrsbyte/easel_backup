import { integer } from "./support.mjs";
import { random } from "./random.mjs";
export default class NotationTool {
  parse(expression) {
    if (typeof expression !== "string" || expression.length > 200)
      throw new Error("Invalid dice notation");
    const match = expression
      .trim()
      .match(/^(\d{1,3})?d(\d{1,5})(?:\s*([+-])\s*(\d{1,6}))?$/i);
    if (!match)
      throw new Error("Supported notation: NdS plus or minus an integer");
    return {
      count: integer(Number(match[1] ?? 1), 1, 100),
      sides: integer(Number(match[2]), 2, 10000),
      modifier: match[4] ? Number(match[4]) * (match[3] === "-" ? -1 : 1) : 0,
    };
  }
  roll(expression, source) {
    const spec = this.parse(expression),
      r = random(source),
      rolls = Array.from({ length: spec.count }, () =>
        integer(r.integer(1, spec.sides + 1), 1, spec.sides),
      );
    return {
      ...spec,
      rolls,
      total: rolls.reduce((n, v) => n + v, spec.modifier),
    };
  }
}
