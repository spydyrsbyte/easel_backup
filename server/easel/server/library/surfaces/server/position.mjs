import { copy, list, number, key, point } from "./support.mjs";
export default class PositionTool {
  get(values, id) {
    const value = list(values).find((v) => v.id === key(id));
    if (!value) throw new Error("Unknown positioned object");
    return {
      x: number(value.x),
      y: number(value.y),
      rotation: number(value.rotation ?? 0),
    };
  }
  update(values, id, position, allowed) {
    list(values);
    point(position);
    if (!list(allowed).includes(id))
      throw new Error("Position target not allowed");
    if (!values.some((v) => v.id === id))
      throw new Error("Unknown positioned object");
    return values.map((v) =>
      v.id === id
        ? {
            ...copy(v),
            x: position.x,
            y: position.y,
            rotation: number(position.rotation ?? v.rotation ?? 0),
          }
        : copy(v),
    );
  }
}
