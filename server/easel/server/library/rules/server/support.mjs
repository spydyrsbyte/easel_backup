export const copy = (value) =>
  JSON.parse(
    JSON.stringify(value, (_key, v) => {
      if (typeof v === "number" && !Number.isFinite(v))
        throw new RangeError("Nonfinite output");
      return v;
    }),
  );
export function list(value) {
  if (!Array.isArray(value)) throw new TypeError("Expected an array");
  return value;
}
export function number(value) {
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new TypeError("Expected a finite number");
  return value;
}
export function integer(value, min = 0, max = 1000000) {
  number(value);
  if (!Number.isSafeInteger(value) || value < min || value > max)
    throw new RangeError("Integer outside permitted range");
  return value;
}
export function record(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("Expected an object");
  return value;
}
export function key(value) {
  if (
    typeof value !== "string" ||
    !value ||
    ["__proto__", "prototype", "constructor"].includes(value)
  )
    throw new TypeError("Expected a safe nonempty key");
  return value;
}
export function unique(values) {
  list(values);
  if (new Set(values).size !== values.length)
    throw new Error("Duplicate members");
  return values;
}
export function bounded(value, min, max) {
  number(value);
  number(min);
  number(max);
  if (min > max) throw new RangeError("Invalid bounds");
  return Math.max(min, Math.min(max, value));
}
export function path(value, name) {
  return String(name)
    .split(".")
    .reduce((v, k) => (v == null ? undefined : v[k]), value);
}
export function point(p) {
  record(p);
  number(p.x);
  number(p.y);
  return p;
}
