import { number, record, point } from "./support.mjs";
export default class GeometryTool {
  toWorld(value, camera = {}) {
    const scale = number(camera.zoom ?? 1);
    if (scale <= 0) throw new RangeError("Zoom must be positive");
    const p = {
        x: (point(value).x - number(camera.x ?? 0)) / scale,
        y: (value.y - number(camera.y ?? 0)) / scale,
      },
      a = (-number(camera.rotation ?? 0) * Math.PI) / 180;
    return {
      x: p.x * Math.cos(a) - p.y * Math.sin(a),
      y: p.x * Math.sin(a) + p.y * Math.cos(a),
    };
  }
  toScreen(value, camera = {}) {
    point(value);
    const scale = number(camera.zoom ?? 1);
    if (scale <= 0) throw new RangeError("Zoom must be positive");
    const a = (number(camera.rotation ?? 0) * Math.PI) / 180;
    return {
      x:
        (value.x * Math.cos(a) - value.y * Math.sin(a)) * scale +
        number(camera.x ?? 0),
      y:
        (value.x * Math.sin(a) + value.y * Math.cos(a)) * scale +
        number(camera.y ?? 0),
    };
  }
  contains(value, bounds) {
    point(value);
    record(bounds);
    return (
      value.x >= number(bounds.x) &&
      value.y >= number(bounds.y) &&
      value.x <= bounds.x + number(bounds.width) &&
      value.y <= bounds.y + number(bounds.height)
    );
  }
  snap(value, size = 1, kind = "square") {
    point(value);
    number(size);
    if (size <= 0) throw new RangeError("Size must be positive");
    if (kind === "square")
      return {
        x: Math.round(value.x / size) * size,
        y: Math.round(value.y / size) * size,
      };
    if (kind !== "hex") throw new Error("Unknown grid kind");
    const q = ((Math.sqrt(3) / 3) * value.x - value.y / 3) / size,
      r = ((2 / 3) * value.y) / size;
    let x = Math.round(q),
      z = Math.round(r),
      y = Math.round(-q - r);
    const dx = Math.abs(x - q),
      dy = Math.abs(y + q + r),
      dz = Math.abs(z - r);
    if (dx > dy && dx > dz) x = -y - z;
    else if (dy > dz) y = -x - z;
    else z = -x - y;
    return { x: size * Math.sqrt(3) * (x + z / 2), y: size * 1.5 * z };
  }
}
