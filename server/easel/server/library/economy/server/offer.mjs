import { copy, number, integer, record, key } from "./support.mjs";
export default class OfferTool {
  validate(offer, now) {
    record(offer);
    key(offer.id);
    key(offer.seller);
    number(offer.price);
    integer(offer.quantity, 1);
    number(now);
    if (offer.price < 0) throw new RangeError("Negative price");
    if (offer.expires !== undefined && number(offer.expires) <= now)
      throw new Error("Offer expired");
    return copy(offer);
  }
  accept(offer, quantity, now) {
    this.validate(offer, now);
    integer(quantity, 1, offer.quantity);
    return {
      quantity,
      total: quantity * offer.price,
      remaining: { ...copy(offer), quantity: offer.quantity - quantity },
    };
  }
}
