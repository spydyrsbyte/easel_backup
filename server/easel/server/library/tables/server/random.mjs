import { copy, list, integer } from "./support.mjs";
export function random(source) {
  const r = source || globalThis.Easel?.Random;
  if (!r || typeof r.integer !== "function")
    throw new Error("Approved server random source required");
  return r;
}
export function shuffled(values, source) {
  const result = copy(list(values)),
    r = random(source);
  for (let i = result.length - 1; i > 0; i--) {
    const j = integer(r.integer(0, i + 1), 0, i);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
