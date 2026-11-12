import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";
export default class Die extends Base {
  constructor() {
    super("easel.dice.die", []);
  }
  update(p) {
    this.begin(p);
    const die = this.button(String(p.value), "request", {
      action: "roll",
      value: { sides: p.sides },
    });
    die.style.width = "64px";
    die.style.height = "64px";
    die.style.fontSize = "26px";
    die.style.boxShadow = "3px 5px 8px #0009,inset 0 1px 0 #ffffff50";
    die.setAttribute("aria-label", "d" + p.sides + ": " + p.value);
    this.content.append(die);
  }
}
