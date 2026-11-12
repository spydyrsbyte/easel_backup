import { copy, record, key } from "./support.mjs";
export default class LookupTool {
  resolve(table, symbol, fallback = null) {
    record(table);
    key(symbol);
    return Object.prototype.hasOwnProperty.call(table, symbol)
      ? copy(table[symbol])
      : copy(fallback);
  }
}
