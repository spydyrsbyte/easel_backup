import { copy, list, number } from "./support.mjs";
export default class RolltableTool {
  resolve(entries, roll) {
    number(roll);
    const matches = list(entries).filter(
      (e) => roll >= number(e.min) && roll <= number(e.max),
    );
    if (matches.length > 1) throw new Error("Overlapping ranges");
    return matches.length ? copy(matches[0]) : null;
  }
}
