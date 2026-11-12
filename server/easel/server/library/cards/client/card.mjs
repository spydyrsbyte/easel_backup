import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";
export default class Card extends Base {
  constructor() {
    super("easel.cards.card", []);
  }
  update(p) {
    this.begin(p);
    this.content.append(this.card(p.data));
  }
}
