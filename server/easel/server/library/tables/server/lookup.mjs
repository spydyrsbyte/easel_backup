import { copy, list, number, key } from "./support.mjs";
export default class LookupTool {
  keyed(entries, id, fallback = null) {
    const found = list(entries).find((e) => e.key === id);
    return found ? copy(found.value) : copy(fallback);
  }
  ranged(entries, value) {
    number(value);
    const hits = list(entries).filter(
      (e) => value >= number(e.min) && value <= number(e.max),
    );
    if (hits.length > 1) throw new Error("Overlapping ranges");
    return hits.length ? copy(hits[0].value) : null;
  }
}
