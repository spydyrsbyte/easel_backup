import { copy, list, number, integer } from "./support.mjs";
export default class AllocationTool {
  distribute(bids, quantity, { price = "bid", reserve = 0 } = {}) {
    integer(quantity, 0);
    number(reserve);
    if (reserve < 0 || !["bid", "uniform"].includes(price))
      throw new Error("Invalid allocation policy");
    const eligible = list(bids)
        .map((b, index) => ({ ...copy(b), amount: number(b.amount), index }))
        .filter((b) => b.amount >= reserve)
        .sort((a, b) => b.amount - a.amount || a.index - b.index),
      winners = eligible.slice(0, quantity),
      uniform = winners.at(-1)?.amount ?? reserve;
    return winners.map(({ index, ...b }) => ({
      ...b,
      price: price === "uniform" ? uniform : b.amount,
    }));
  }
}
