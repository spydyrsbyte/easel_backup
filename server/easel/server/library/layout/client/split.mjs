import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";
export default class Split extends Base {
  constructor() {
    super("easel.layout.split", ["first", "second"]);
  }
  update(p) {
    this.begin(p);
    this.element.classList.add("kit-split");
    this.content.style.display = "contents";
    this.element.style.setProperty(
      "--kit-ratio",
      Math.max(0.05, Math.min(0.95, p.ratio)) * 100 + "%",
    );
    const divider = el("div", "kit-divider");
    divider.tabIndex = 0;
    divider.setAttribute("role", "separator");
    divider.setAttribute("aria-orientation", "vertical");
    divider.setAttribute("aria-valuenow", String(Math.round(p.ratio * 100)));
    const set = (ratio) => {
      ratio = Math.max(0.05, Math.min(0.95, ratio));
      this.element.style.setProperty("--kit-ratio", ratio * 100 + "%");
      this.emit("ratio", { ratio });
    };
    divider.onpointerdown = (e) => {
      divider.setPointerCapture(e.pointerId);
      divider.onpointermove = (ev) => {
        const b = this.element.getBoundingClientRect();
        set((ev.clientX - b.left) / b.width);
      };
      divider.onpointerup = () => (divider.onpointermove = null);
    };
    divider.onkeydown = (e) => {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        set(p.ratio + (e.key === "ArrowLeft" ? -0.05 : 0.05));
      }
    };
    this.content.append(this.slots.first, divider, this.slots.second);
  }
}
