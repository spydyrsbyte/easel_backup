import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";
export default class Meter extends Base {
  constructor() {
    super("easel.tracks.meter", []);
  }
  update(p) {
    this.begin(p);
    const track = el("div", "kit-progress");
    track.setAttribute("role", "meter");
    track.setAttribute("aria-valuenow", String(p.value));
    track.setAttribute("aria-valuemin", String(p.min));
    track.setAttribute("aria-valuemax", String(p.max));
    track.setAttribute("aria-label", p.title || "Resource");
    const fill = el("span");
    fill.style.width =
      Math.max(0, Math.min(1, (p.value - p.min) / (p.max - p.min || 1))) * 100 +
      "%";
    track.append(fill);
    this.content.append(track, this.text(p.value + " / " + p.max));
  }
}
