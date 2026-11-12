import { number, integer } from "./support.mjs";
export default class OrientationTool {
  rotate(value, by = 90, step = 1) {
    number(value);
    number(by);
    number(step);
    if (step <= 0) throw new RangeError("Orientation step must be positive");
    return (((Math.round((value + by) / step) * step) % 360) + 360) % 360;
  }
  flip(index, count = 2) {
    integer(count, 1, 1000);
    integer(index, 0, count - 1);
    return (index + 1) % count;
  }
}
