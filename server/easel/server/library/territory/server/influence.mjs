import { copy, list, number, key } from "./support.mjs";
export default class InfluenceTool {
  distribution(entries) {
    const totals = Object.create(null);
    for (const e of list(entries)) {
      key(e.region);
      key(e.actor);
      const weight = number(e.weight ?? 1);
      if (weight < 0) throw new RangeError("Negative influence");
      totals[e.region] ??= Object.create(null);
      totals[e.region][e.actor] = (totals[e.region][e.actor] ?? 0) + weight;
    }
    return copy(totals);
  }
}
