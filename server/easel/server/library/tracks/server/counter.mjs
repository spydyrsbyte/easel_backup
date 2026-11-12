import { number, integer, bounded } from "./support.mjs";
export default class CounterTool {
  adjust(
    value,
    delta,
    { min = 0, max = Number.MAX_SAFE_INTEGER, overflow = "clamp" } = {},
  ) {
    number(value);
    number(delta);
    number(min);
    number(max);
    if (min > max) throw new RangeError("Invalid counter bounds");
    const next = value + delta;
    number(next);
    if (overflow === "reject" && (next < min || next > max))
      throw new RangeError("Counter overflow");
    if (overflow === "wrap") {
      const size = max - min + 1;
      integer(min, -1000000, 1000000);
      integer(max, min, 1000000);
      integer(next, -Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
      return min + ((((next - min) % size) + size) % size);
    }
    if (!["clamp", "reject"].includes(overflow))
      throw new Error("Unknown overflow policy");
    return bounded(next, min, max);
  }
  reset(value = 0, options = {}) {
    return this.adjust(value, 0, options);
  }
}
