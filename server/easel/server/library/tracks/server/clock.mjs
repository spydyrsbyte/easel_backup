import { integer, bounded } from "./support.mjs";
export default class ClockTool {
  set(filled, segments = 4) {
    integer(segments, 1, 1000);
    integer(filled, 0, segments);
    return { filled, segments, complete: filled === segments };
  }
  advance(clock, amount = 1) {
    integer(amount, -1000, 1000);
    return this.set(
      bounded(
        integer(clock.filled, 0, clock.segments) + amount,
        0,
        clock.segments,
      ),
      clock.segments,
    );
  }
}
