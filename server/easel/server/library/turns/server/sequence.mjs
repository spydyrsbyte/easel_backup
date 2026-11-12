import { list, integer, key, unique } from "./support.mjs";
export default class SequenceTool {
  next(order, current, { direction = 1, skip = [] } = {}) {
    unique(list(order).map(key));
    if (!order.length) return null;
    if (![1, -1].includes(direction))
      throw new Error("Direction must be 1 or -1");
    list(skip);
    const start =
      current == null ? (direction === 1 ? -1 : 0) : order.indexOf(current);
    if (current != null && start < 0) throw new Error("Unknown active actor");
    for (let n = 1; n <= order.length; n++) {
      const at =
        (((start + n * direction) % order.length) + order.length) %
        order.length;
      if (!skip.includes(order[at])) return order[at];
    }
    return null;
  }
  active(order, index = 0) {
    unique(list(order).map(key));
    if (!order.length) return null;
    integer(index, 0, order.length - 1);
    return order[index];
  }
}
