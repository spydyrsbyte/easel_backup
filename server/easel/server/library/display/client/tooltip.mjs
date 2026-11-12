import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";
export default class Tooltip extends Base {
  constructor() {
    super("easel.display.tooltip", []);
  }
  update(p) {
    this.begin(p);
    this.element.classList.add("kit-tooltip");
    this.element.setAttribute("role", "tooltip");
    this.content.append(this.text(p.text));
  }
}
