import { list, number } from "./support.mjs";
import { distance, intersects } from "./spatial.mjs";
export default class RangeTool {
  evaluate(
    origin,
    target,
    { min = 0, max = 10, facing = 0, arc = 360, walls = [] } = {},
  ) {
    const d = distance(origin, target);
    [min, max, facing, arc].forEach(number);
    if (min < 0 || max < min || arc < 0 || arc > 360)
      throw new RangeError("Invalid range");
    const angle =
        (Math.atan2(target.y - origin.y, target.x - origin.x) * 180) / Math.PI,
      delta = ((angle - facing + 540) % 360) - 180;
    return {
      distance: d,
      inRange: d >= min && d <= max,
      inArc: Math.abs(delta) <= arc / 2,
      cover: list(walls).some(
        (w) => !w.open && intersects(origin, target, w.a, w.b),
      ),
    };
  }
}
