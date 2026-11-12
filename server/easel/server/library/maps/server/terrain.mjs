import { copy, list, number, point } from "./support.mjs";
import { inside } from "./spatial.mjs";
export default class TerrainTool {
  at(regions, position) {
    point(position);
    return copy(
      list(regions)
        .filter((r) => inside(position, r.polygon))
        .at(-1) ?? null,
    );
  }
  cost(regions, position, fallback = 1) {
    const terrain = this.at(regions, position);
    const cost = number(terrain?.cost ?? fallback);
    if (cost < 0) throw new RangeError("Negative movement cost");
    return cost;
  }
}
