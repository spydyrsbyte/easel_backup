import { list, number, integer } from "./support.mjs";
export default class CapacityTool {
  usage(
    items,
    {
      weight = Number.MAX_SAFE_INTEGER,
      volume = Number.MAX_SAFE_INTEGER,
      slots = Number.MAX_SAFE_INTEGER,
    } = {},
  ) {
    [weight, volume, slots].forEach(number);
    if (Math.min(weight, volume, slots) < 0)
      throw new RangeError("Negative capacity");
    const used = { weight: 0, volume: 0, slots: 0 };
    for (const item of list(items)) {
      const quantity = integer(item.quantity ?? 1, 0);
      for (const kind of Object.keys(used)) {
        const amount = number(item[kind] ?? (kind === "slots" ? 1 : 0));
        if (amount < 0) throw new RangeError("Negative usage");
        used[kind] += quantity * amount;
      }
    }
    return {
      used,
      overloaded:
        used.weight > weight || used.volume > volume || used.slots > slots,
    };
  }
}
