import { copy, list, number, key, unique } from "./support.mjs";
export default class BidTool {
  submit(bids, actor, amount, { minimum = 0, increment = 1 } = {}) {
    unique(list(bids).map((b) => key(b.actor)));
    key(actor);
    [amount, minimum, increment].forEach(number);
    if (increment < 0 || minimum < 0)
      throw new RangeError("Invalid bid policy");
    const highest = bids.reduce(
      (n, b) => Math.max(n, number(b.amount)),
      -Infinity,
    );
    if (amount < minimum || (bids.length && amount < highest + increment))
      throw new Error("Bid too low");
    return [
      ...bids.filter((b) => b.actor !== actor).map(copy),
      { actor, amount },
    ];
  }
  winner(bids) {
    list(bids);
    return copy(
      bids.reduce(
        (best, b) => (!best || number(b.amount) > best.amount ? b : best),
        null,
      ),
    );
  }
}
