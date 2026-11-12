import { number } from "./support.mjs";
export default class DamageTool {
  resolve(amount, { reduction = 0, multiplier = 1, threshold = 0 } = {}) {
    [amount, reduction, multiplier, threshold].forEach(number);
    if (Math.min(amount, reduction, multiplier, threshold) < 0)
      throw new RangeError("Negative damage parameter");
    const reduced = Math.max(0, amount - reduction),
      total = reduced * multiplier;
    return {
      amount,
      absorbed: amount - reduced,
      total,
      exceedsThreshold: total > threshold,
    };
  }
}
