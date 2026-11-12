import { copy, list, number, record, key } from "./support.mjs";
export default class CardTool {
  present(
    card,
    {
      faceUp = card.faceUp !== false,
      fields = ["id", "name", "image", "description", "orientation"],
    } = {},
  ) {
    record(card);
    if (!faceUp) return { id: card.id, faceUp: false, back: card.back ?? null };
    const value = Object.fromEntries(
      list(fields)
        .filter((k) => Object.prototype.hasOwnProperty.call(card, key(k)))
        .map((k) => [k, copy(card[k])]),
    );
    return { ...value, faceUp: true };
  }
  orient(card, degrees) {
    record(card);
    number(degrees);
    return { ...copy(card), orientation: ((degrees % 360) + 360) % 360 };
  }
  flip(card, allowed = true) {
    record(card);
    if (!allowed) throw new Error("Flip is not allowed");
    return { ...copy(card), faceUp: card.faceUp === false };
  }
}
