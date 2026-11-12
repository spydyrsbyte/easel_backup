import { copy, list, integer, key, unique } from "./support.mjs";
export default class TargetingTool {
  validate(targets, allowed, { min = 1, max = 1 } = {}) {
    unique(list(targets).map(key));
    list(allowed);
    integer(min);
    integer(max, min);
    if (
      targets.length < min ||
      targets.length > max ||
      targets.some((id) => !allowed.includes(id))
    )
      throw new Error("Target not allowed");
    return copy(targets);
  }
}
