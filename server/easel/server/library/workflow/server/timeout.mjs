import { number } from "./support.mjs";
export default class TimeoutTool {
  deadline(start, duration) {
    number(start);
    number(duration);
    if (duration < 0) throw new RangeError("Negative timeout");
    return number(start + duration);
  }
  evaluate(deadline, now) {
    number(deadline);
    number(now);
    return { expired: now >= deadline, remaining: Math.max(0, deadline - now) };
  }
}
