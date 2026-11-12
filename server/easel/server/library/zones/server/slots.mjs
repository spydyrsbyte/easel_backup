import { number, integer } from "./support.mjs";
export default class SlotsTool {
  layout(
    count,
    { columns = 5, width = 1, height = 1, gap = 0, x = 0, y = 0 } = {},
  ) {
    integer(count);
    integer(columns, 1);
    [width, height, gap, x, y].forEach(number);
    if (width <= 0 || height <= 0 || gap < 0)
      throw new RangeError("Invalid slot size");
    return Array.from({ length: count }, (_, i) => ({
      index: i,
      x: x + (i % columns) * (width + gap),
      y: y + Math.floor(i / columns) * (height + gap),
      width,
      height,
    }));
  }
}
