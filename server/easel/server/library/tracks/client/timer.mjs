import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";
export default class Timer extends Base {
  constructor() {
    super("easel.tracks.timer", []);
    this.interval = setInterval(() => {
      if (this.element.isConnected) this.refreshTimer?.();
    }, 250);
  }
  update(p) {
    this.begin(p);
    const label = this.text("", "output", "kit-label");
    this.timer = label;
    const display = () => {
      const now = this.props.now < 0 ? Date.now() : this.props.now;
      const ms =
        this.props.data.deadline !== undefined
          ? Math.max(0, this.props.data.deadline - now)
          : Math.max(0, now - Number(this.props.data.started ?? now));
      const seconds = Math.floor(ms / 1000);
      if (this.timer)
        this.timer.textContent =
          Math.floor(seconds / 60) +
          ":" +
          String(seconds % 60).padStart(2, "0");
    };
    display();
    this.refreshTimer = display;
    this.content.append(
      label,
      this.button("Start", "request", { action: "start", value: {} }),
      this.button("Pause", "request", { action: "pause", value: {} }),
      this.button("Reset", "request", { action: "reset", value: {} }),
    );
  }
}
