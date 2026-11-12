import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";
export default class Deck extends Base {
  constructor() {
    super("easel.cards.deck", []);
  }
  update(p) {
    this.begin(p);
    const card = this.card({
      ...p.data,
      count: p.count || p.data.count || 0,
      faceUp: false,
    });
    card.style.width = "130px";
    card.style.boxShadow =
      "2px 2px #d9d2c5,4px 4px #444,6px 6px #d9d2c5,8px 10px 12px #0008";
    this.draggable(card, p.data.id ?? "");
    this.dropzone(card, p.data.id ?? this.name);
    this.content.append(
      card,
      this.button("Draw", "request", {
        action: "draw",
        value: { id: String(p.data.id ?? ""), count: 1 },
      }),
      this.button("Shuffle", "request", {
        action: "shuffle",
        value: { id: String(p.data.id ?? "") },
      }),
    );
  }
}
