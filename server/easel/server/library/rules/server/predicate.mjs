import { list, number, record, path } from "./support.mjs";
export default class PredicateTool {
  evaluate(rule, context = {}, depth = 0) {
    if (depth > 32) throw new Error("Predicate depth limit");
    record(rule);
    const next = (r) => this.evaluate(r, context, depth + 1);
    if (rule.op === "all") return list(rule.rules).every(next);
    if (rule.op === "any") return list(rule.rules).some(next);
    if (rule.op === "not") return !next(rule.rule);
    const a = rule.path === undefined ? rule.left : path(context, rule.path),
      b = rule.right;
    switch (rule.op) {
      case "eq":
        return a === b;
      case "ne":
        return a !== b;
      case "gt":
        return number(a) > number(b);
      case "gte":
        return number(a) >= number(b);
      case "lt":
        return number(a) < number(b);
      case "lte":
        return number(a) <= number(b);
      case "in":
        return list(b).includes(a);
      case "contains":
        return list(a).includes(b);
      case "exists":
        return a !== undefined && a !== null;
      default:
        throw new Error("Unknown predicate");
    }
  }
}
