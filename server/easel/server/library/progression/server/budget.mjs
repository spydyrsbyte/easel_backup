import { list, number, integer } from "./support.mjs";
export default class BudgetTool {
  evaluate(budget, purchases) {
    number(budget);
    if (budget < 0) throw new RangeError("Negative budget");
    const spent = list(purchases).reduce((n, p) => {
      const cost = number(p.cost),
        quantity = integer(p.quantity ?? 1, 0);
      if (cost < 0) throw new RangeError("Negative cost");
      return n + cost * quantity;
    }, 0);
    return {
      budget,
      spent,
      remaining: budget - spent,
      affordable: spent <= budget,
    };
  }
  stepped(from, to, costs) {
    integer(from, 0);
    integer(to, 0);
    list(costs);
    if (Math.max(from, to) > costs.length)
      throw new Error("Missing step price");
    return (
      costs.slice(Math.min(from, to), Math.max(from, to)).reduce((n, v) => {
        if (number(v) < 0) throw new RangeError("Negative step price");
        return n + v;
      }, 0) * (to >= from ? 1 : -1)
    );
  }
}
