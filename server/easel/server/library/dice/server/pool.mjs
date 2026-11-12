import { list, number, integer } from "./support.mjs";
export default class PoolTool {
  evaluate(
    rolls,
    { drop = 0, keep = rolls.length - drop, highest = true } = {},
  ) {
    const values = list(rolls).map(number);
    integer(keep, 0, values.length);
    integer(drop, 0, values.length);
    if (keep + drop > values.length)
      throw new RangeError("Keep/drop exceeds pool size");
    const ordered = values
      .map((value, index) => ({ value, index }))
      .sort((a, b) => (highest ? b.value - a.value : a.value - b.value));
    const selected = ordered.slice(drop, drop + keep);
    return {
      total: selected.reduce((n, v) => n + v.value, 0),
      kept: selected.map((v) => v.index),
      dropped: ordered.filter((v) => !selected.includes(v)).map((v) => v.index),
    };
  }
  describe(groups) {
    return list(groups).map((g) => ({
      sides: integer(g.sides, 2, 10000),
      count: integer(g.count, 0, 1000),
    }));
  }
}
