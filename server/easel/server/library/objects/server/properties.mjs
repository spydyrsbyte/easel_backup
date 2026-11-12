import { copy, list, record, key } from "./support.mjs";
export default class PropertiesTool {
  read(value, names) {
    record(value);
    return Object.fromEntries(
      list(names)
        .filter((n) => Object.prototype.hasOwnProperty.call(value, key(n)))
        .map((n) => [n, copy(value[n])]),
    );
  }
  update(value, patch, allowed) {
    record(value);
    record(patch);
    list(allowed);
    for (const k of Object.keys(patch))
      if (!allowed.includes(key(k)))
        throw new Error("Property is not editable: " + k);
    return { ...copy(value), ...copy(patch) };
  }
}
