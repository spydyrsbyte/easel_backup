import { list, number } from "./support.mjs";
export default class ThresholdTool {
  crossings(before, after, thresholds) {
    number(before);
    number(after);
    return list(thresholds)
      .map(number)
      .filter((v) =>
        before < after ? v > before && v <= after : v < before && v >= after,
      )
      .sort((a, b) => (before < after ? a - b : b - a));
  }
}
