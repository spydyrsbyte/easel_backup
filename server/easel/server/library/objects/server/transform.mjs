import { number, point } from "./support.mjs";
export default class TransformTool {
  rotate(value, degrees) {
    point(value);
    number(degrees);
    const a = (degrees * Math.PI) / 180;
    return {
      x: value.x * Math.cos(a) - value.y * Math.sin(a),
      y: value.x * Math.sin(a) + value.y * Math.cos(a),
    };
  }
  apply(value, transform = {}) {
    const p = this.rotate(
      {
        x: point(value).x * number(transform.scale ?? 1),
        y: value.y * number(transform.scale ?? 1),
      },
      transform.rotation ?? 0,
    );
    return {
      x: p.x + number(transform.x ?? 0),
      y: p.y + number(transform.y ?? 0),
    };
  }
  inverse(value, transform = {}) {
    const scale = number(transform.scale ?? 1);
    if (scale === 0) throw new RangeError("Singular transform");
    const p = this.rotate(
      {
        x: point(value).x - number(transform.x ?? 0),
        y: value.y - number(transform.y ?? 0),
      },
      -number(transform.rotation ?? 0),
    );
    return { x: p.x / scale, y: p.y / scale };
  }
}
