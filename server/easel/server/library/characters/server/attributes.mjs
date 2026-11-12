import { copy, list, number, record, key } from "./support.mjs";
export default class AttributesTool {
  describe(values, definitions) {
    record(values);
    return list(definitions).map((d) => {
      key(d.id);
      const value = values[d.id] ?? d.default ?? 0;
      if (d.type === "text") {
        if (typeof value !== "string") throw new TypeError("Text required");
      } else number(value);
      return {
        id: d.id,
        label: d.label ?? d.id,
        value,
        min: d.min ?? null,
        max: d.max ?? null,
      };
    });
  }
  update(values, id, value, definition) {
    record(values);
    key(id);
    if (definition.id !== id) throw new Error("Unknown attribute");
    if (definition.type === "text") {
      if (typeof value !== "string") throw new TypeError("Text required");
    } else {
      number(value);
      if (
        value < (definition.min ?? -Infinity) ||
        value > (definition.max ?? Infinity)
      )
        throw new RangeError("Attribute bounds");
    }
    return { ...copy(values), [id]: value };
  }
}
