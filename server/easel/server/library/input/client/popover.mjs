import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";
export default class Popover extends Base {
  constructor() {
    super("easel.input.popover", ["body"]);
    document.addEventListener(
      "pointerdown",
      (e) => {
        if (
          this.element.isConnected &&
          this.props.open &&
          !this.element.contains(e.target)
        )
          this.emit("close", {});
      },
      { signal: this.life.signal },
    );
  }
  update(p) {
    this.begin(p);
    this.element.classList.add("kit-item");
    this.element.style.position = "absolute";
    this.element.style.left = Number(p.data.x ?? 0) + "px";
    this.element.style.top = Number(p.data.y ?? 0) + "px";
    this.content.append(
      this.text(p.text),
      this.slots.body,
      this.button("Dismiss", "close", {}),
    );
  }
}
