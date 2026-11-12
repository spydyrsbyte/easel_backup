import { number, record } from "./support.mjs";
export default class DurationTool {
  remaining(effect, now) {
    record(effect);
    number(now);
    const start = number(effect.start),
      duration = number(effect.duration);
    if (duration < 0) throw new RangeError("Negative duration");
    return Math.max(0, start + duration - now);
  }
  expired(effect, now) {
    return this.remaining(effect, now) === 0;
  }
}
