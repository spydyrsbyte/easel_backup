import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";
export default class Track extends Base {
  constructor() {
    super("easel.tracks.track", []);
  }
  update(p) {
    this.begin(p);
    if (p.max - p.min > 500) throw new RangeError("Track too long");
    const row = el("div", "kit-row");
    for (let n = p.min; n <= p.max; n += Math.max(1, p.step)) {
      const b = this.button(String(n), "change", { value: { value: n } });
      b.setAttribute("aria-pressed", String(n === p.value));
      if (n === p.value) b.style.borderColor = "var(--kit-accent)";
      row.append(b);
    }
    this.content.append(row);
  }
}
