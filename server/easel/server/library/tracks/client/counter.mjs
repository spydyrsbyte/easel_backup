import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";
export default class Counter extends Base {
  constructor() {
    super("easel.tracks.counter", []);
  }
  update(p) {
    this.begin(p);
    const row = el("div", "kit-row");
    row.append(
      this.button(
        "Decrease",
        "change",
        { value: { value: Math.max(p.min, p.value - p.step) } },
        p.value <= p.min,
      ),
      this.text(p.text || String(p.value), "output", "kit-label"),
      this.button(
        "Increase",
        "change",
        { value: { value: Math.min(p.max, p.value + p.step) } },
        p.value >= p.max,
      ),
    );
    this.content.append(row);
  }
}
