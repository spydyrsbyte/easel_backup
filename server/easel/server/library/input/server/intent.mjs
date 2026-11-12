import { copy, number, integer, record } from "./support.mjs";
export default class IntentTool {
  validate(intent, definition) {
    record(intent);
    record(definition);
    for (const k of Object.keys(intent))
      if (!Object.prototype.hasOwnProperty.call(definition, k))
        throw new Error("Undeclared intent field: " + k);
    for (const [k, rule] of Object.entries(definition)) {
      const spec = typeof rule === "string" ? { type: rule } : rule;
      if (intent[k] === undefined) {
        if (spec.optional) continue;
        throw new Error("Missing intent field: " + k);
      }
      const v = intent[k];
      if (
        spec.type === "array"
          ? !Array.isArray(v)
          : spec.type === "integer"
            ? !Number.isSafeInteger(v)
            : spec.type === "object"
              ? !v || typeof v !== "object" || Array.isArray(v)
              : typeof v !== spec.type
      )
        throw new TypeError("Invalid intent field: " + k);
      if (typeof v === "number") number(v);
      if (spec.values && !spec.values.includes(v))
        throw new Error("Invalid intent choice");
    }
    return copy(intent);
  }
}
