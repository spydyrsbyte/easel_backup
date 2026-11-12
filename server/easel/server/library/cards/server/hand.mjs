import { copy, list, key, unique } from "./support.mjs";
export default class HandTool {
  reorder(members, order) {
    unique(list(members).map(key));
    unique(list(order).map(key));
    if (
      members.length !== order.length ||
      order.some((v) => !members.includes(v))
    )
      throw new Error("Order must preserve membership");
    return copy(order);
  }
  project(cards, owner, viewer) {
    return list(cards).map((c) =>
      owner != null && viewer != null && owner === viewer
        ? copy(c)
        : { id: c.id, faceUp: false, back: c.back ?? null },
    );
  }
}
