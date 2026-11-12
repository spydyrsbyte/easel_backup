import { copy, list, number, integer } from "./support.mjs";
export default class StackingTool {
  layout(count, { dx = 0.05, dy = 0.05 } = {}) {
    integer(count, 0, 10000);
    number(dx);
    number(dy);
    return Array.from({ length: count }, (_, index) => ({
      index,
      x: index * dx,
      y: index * dy,
      z: index,
    }));
  }
  split(members, count) {
    list(members);
    integer(count, 0, members.length);
    return {
      taken: copy(members.slice(0, count)),
      remaining: copy(members.slice(count)),
    };
  }
}
