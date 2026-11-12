import { copy, list, number } from "./support.mjs";
export default class MilestoneTool {
  eligible(milestones, value, claimed = []) {
    number(value);
    list(claimed);
    return list(milestones)
      .filter((m) => !claimed.includes(m.id) && value >= number(m.threshold))
      .map(copy);
  }
}
