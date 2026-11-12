import { copy, list, number } from "./support.mjs";
export default class ThresholdTool {
  evaluate(value, bands) {
    number(value);
    const band = list(bands)
      .map((b) => ({ ...copy(b), min: number(b.min) }))
      .sort((a, b) => b.min - a.min)
      .find((b) => value >= b.min);
    return band ? { ...band, value, margin: value - band.min } : null;
  }
}
