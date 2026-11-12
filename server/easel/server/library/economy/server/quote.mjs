import { number, record } from "./support.mjs";
export default class QuoteTool {
  calculate(unitPrice, quantity = 1, { discount = 0, tax = 0 } = {}) {
    [unitPrice, quantity, discount, tax].forEach(number);
    if (
      unitPrice < 0 ||
      quantity < 0 ||
      discount < 0 ||
      discount > 1 ||
      tax < 0
    )
      throw new RangeError("Invalid price inputs");
    const subtotal = unitPrice * quantity,
      net = subtotal * (1 - discount);
    return {
      unitPrice,
      quantity,
      subtotal,
      discount: subtotal - net,
      tax: net * tax,
      total: number(net * (1 + tax)),
    };
  }
  revalidate(quoted, current) {
    record(quoted);
    record(current);
    return (
      quoted.total === current.total &&
      quoted.quantity === current.quantity &&
      quoted.unitPrice === current.unitPrice
    );
  }
}
