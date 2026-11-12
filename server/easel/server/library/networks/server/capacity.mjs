import { number } from "./support.mjs";
export default class CapacityTool {
  evaluate(capacity, usage, requested = 0) {
    number(capacity);
    number(usage);
    number(requested);
    if (capacity < 0 || usage < 0 || requested < 0)
      throw new RangeError("Negative capacity or usage");
    return {
      capacity,
      usage,
      remaining: Math.max(0, capacity - usage),
      available: usage + requested <= capacity,
      overflow: Math.max(0, usage + requested - capacity),
    };
  }
}
