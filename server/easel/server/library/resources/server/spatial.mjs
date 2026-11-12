import { point, list } from "./support.mjs";
export function distance(a, b) {
  point(a);
  point(b);
  return Math.hypot(a.x - b.x, a.y - b.y);
}
export function inside(p, polygon) {
  point(p);
  list(polygon);
  let yes = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = point(polygon[i]),
      b = point(polygon[j]);
    if (
      a.y > p.y !== b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
    )
      yes = !yes;
  }
  return yes;
}
export function intersects(a, b, c, d) {
  [a, b, c, d].forEach(point);
  const cross = (p, q, r) =>
    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const on = (p, q, r) =>
    Math.abs(cross(p, q, r)) < 1e-9 &&
    r.x >= Math.min(p.x, q.x) &&
    r.x <= Math.max(p.x, q.x) &&
    r.y >= Math.min(p.y, q.y) &&
    r.y <= Math.max(p.y, q.y);
  return (
    (cross(a, b, c) * cross(a, b, d) < 0 &&
      cross(c, d, a) * cross(c, d, b) < 0) ||
    on(a, b, c) ||
    on(a, b, d) ||
    on(c, d, a) ||
    on(c, d, b)
  );
}
