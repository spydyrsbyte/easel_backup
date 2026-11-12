const EPSILON = 1e-4;

export function wallSegments(walls) {
  const segments = [];
  for (const wall of walls || []) {
    if (!wall) continue;
    if ((wall.door || wall.kind === "door") && wall.open) continue;
    if ((wall.column || wall.kind === "column") && Number(wall.radius) > 0) {
      const cx = Number(wall.center?.x ?? wall.x) || 0;
      const cy = Number(wall.center?.y ?? wall.y) || 0;
      const radius = Number(wall.radius);
      const sides = 12;
      for (let index = 0; index < sides; index++) {
        const a = (index / sides) * Math.PI * 2;
        const b = ((index + 1) / sides) * Math.PI * 2;
        segments.push({ ax: cx + Math.cos(a) * radius, ay: cy + Math.sin(a) * radius, bx: cx + Math.cos(b) * radius, by: cy + Math.sin(b) * radius });
      }
      continue;
    }
    const ax = Number(wall.a?.x ?? wall.x1);
    const ay = Number(wall.a?.y ?? wall.y1);
    const bx = Number(wall.b?.x ?? wall.x2);
    const by = Number(wall.b?.y ?? wall.y2);
    if ([ax, ay, bx, by].every(Number.isFinite) && (ax !== bx || ay !== by)) segments.push({ ax, ay, bx, by });
  }
  return segments;
}

function castRay(ox, oy, dx, dy, segments) {
  let nearest = Infinity;
  for (const segment of segments) {
    const sx = segment.bx - segment.ax;
    const sy = segment.by - segment.ay;
    const denominator = dx * sy - dy * sx;
    if (Math.abs(denominator) < 1e-12) continue;
    const t = ((segment.ax - ox) * sy - (segment.ay - oy) * sx) / denominator;
    if (t < EPSILON || t >= nearest) continue;
    const u = ((segment.ax - ox) * dy - (segment.ay - oy) * dx) / denominator;
    if (u < -1e-9 || u > 1 + 1e-9) continue;
    nearest = t;
  }
  return nearest;
}

export function visibilityPolygon(origin, segments, radius = 2000) {
  const ox = Number(origin.x) || 0;
  const oy = Number(origin.y) || 0;
  const reach = Math.max(1, Number(radius) || 2000);
  const near = [];
  const angles = [];
  const rim = 40;
  for (let index = 0; index < rim; index++) angles.push((index / rim) * Math.PI * 2 - Math.PI);
  for (const segment of segments) {
    const minX = Math.min(segment.ax, segment.bx) - reach;
    const maxX = Math.max(segment.ax, segment.bx) + reach;
    const minY = Math.min(segment.ay, segment.by) - reach;
    const maxY = Math.max(segment.ay, segment.by) + reach;
    if (ox < minX || ox > maxX || oy < minY || oy > maxY) continue;
    near.push(segment);
    for (const [x, y] of [
      [segment.ax, segment.ay],
      [segment.bx, segment.by],
    ]) {
      if (Math.hypot(x - ox, y - oy) > reach * 1.5) continue;
      const angle = Math.atan2(y - oy, x - ox);
      angles.push(angle - 2e-4, angle, angle + 2e-4);
    }
  }
  angles.sort((a, b) => a - b);
  const points = [];
  let previous = null;
  for (const angle of angles) {
    if (previous !== null && angle - previous < 1e-7) continue;
    previous = angle;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const distance = Math.min(reach, castRay(ox, oy, dx, dy, near));
    points.push({ x: ox + dx * distance, y: oy + dy * distance });
  }
  return points;
}

export function lineOfSight(from, to, segments) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length < EPSILON) return true;
  return castRay(from.x, from.y, dx / length, dy / length, segments) >= length - EPSILON;
}

export function insidePolygon(point, polygon) {
  let inside = false;
  for (let index = 0, last = polygon.length - 1; index < polygon.length; last = index++) {
    const a = polygon[index];
    const b = polygon[last];
    if (a.y > point.y !== b.y > point.y && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function pointToSegment(px, py, segment) {
  const dx = segment.bx - segment.ax;
  const dy = segment.by - segment.ay;
  const length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((px - segment.ax) * dx + (py - segment.ay) * dy) / length)) : 0;
  return Math.hypot(segment.ax + t * dx - px, segment.ay + t * dy - py);
}

function crosses(a, b, segment) {
  const cross = (ox, oy, px, py, qx, qy) => (px - ox) * (qy - oy) - (py - oy) * (qx - ox);
  const d1 = cross(segment.ax, segment.ay, segment.bx, segment.by, a.x, a.y);
  const d2 = cross(segment.ax, segment.ay, segment.bx, segment.by, b.x, b.y);
  const d3 = cross(a.x, a.y, b.x, b.y, segment.ax, segment.ay);
  const d4 = cross(a.x, a.y, b.x, b.y, segment.bx, segment.by);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

export function movementBlocked(from, to, segments, bodyRadius = 0) {
  const radius = Math.max(0, Number(bodyRadius) || 0);
  const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / Math.max(4, radius || 8)));
  for (const segment of segments) {
    if (crosses(from, to, segment)) return true;
    if (!radius) continue;
    const startDistance = pointToSegment(from.x, from.y, segment);
    if (startDistance <= radius) continue;
    for (let step = 1; step <= steps; step++) {
      const t = step / steps;
      if (pointToSegment(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t, segment) < radius) return true;
    }
  }
  return false;
}

export function tokenVisible(observers, target, segments, range = Infinity) {
  const half = Math.max(1, Math.min(Number(target.width) || 0, Number(target.height) || 0) * 0.35);
  const samples = [
    { x: target.x, y: target.y },
    { x: target.x - half, y: target.y - half },
    { x: target.x + half, y: target.y - half },
    { x: target.x + half, y: target.y + half },
    { x: target.x - half, y: target.y + half },
  ];
  for (const observer of observers) {
    const limit = Number.isFinite(observer.range) && observer.range > 0 ? observer.range : range;
    for (const sample of samples) {
      if (Math.hypot(sample.x - observer.x, sample.y - observer.y) > limit) continue;
      if (lineOfSight(observer, sample, segments)) return true;
    }
  }
  return false;
}

export function gridSnap(point, grid, mode = "center", size = null) {
  const cell = Number(grid?.size) || 100;
  const left = Number(grid?.offset?.left) || 0;
  const top = Number(grid?.offset?.top) || 0;
  if (grid?.type === "none") return { x: point.x, y: point.y };
  if (mode === "vertex") {
    const half = cell / 2;
    return { x: Math.round((point.x - left) / half) * half + left, y: Math.round((point.y - top) / half) * half + top };
  }
  const spanX = Math.max(1, Math.round((size?.width ?? cell) / cell));
  const spanY = Math.max(1, Math.round((size?.height ?? cell) / cell));
  const snapAxis = (value, offset, span) => {
    const shift = span % 2 ? cell / 2 : 0;
    return Math.round((value - offset - shift) / cell) * cell + offset + shift;
  };
  return { x: snapAxis(point.x, left, spanX), y: snapAxis(point.y, top, spanY) };
}

export function gridDistance(a, b, grid, rule = "chebyshev") {
  const cell = Number(grid?.size) || 100;
  const scale = Number(grid?.relativesize?.size ?? 5);
  if (grid?.type === "none" || rule === "euclidean") return (Math.hypot(b.x - a.x, b.y - a.y) / cell) * scale;
  const dx = Math.abs(Math.round((b.x - a.x) / cell));
  const dy = Math.abs(Math.round((b.y - a.y) / cell));
  if (rule === "manhattan") return (dx + dy) * scale;
  if (rule === "alternating") {
    const diagonal = Math.min(dx, dy);
    return (Math.max(dx, dy) + Math.floor(diagonal / 2)) * scale;
  }
  return Math.max(dx, dy) * scale;
}

export default class Sight {
  segments(walls) {
    return wallSegments(walls);
  }
  polygon(origin, walls, radius) {
    return visibilityPolygon(origin, wallSegments(walls), radius);
  }
  lineOfSight(from, to, walls) {
    return lineOfSight(from, to, wallSegments(walls));
  }
  visible(observers, target, walls, range) {
    return tokenVisible(observers, target, wallSegments(walls), range);
  }
  blocked(from, to, walls, bodyRadius) {
    return movementBlocked(from, to, wallSegments(walls), bodyRadius);
  }
  inside(point, polygon) {
    return insidePolygon(point, polygon);
  }
  snap(point, grid, mode, size) {
    return gridSnap(point, grid, mode, size);
  }
  distance(from, to, grid, rule) {
    return gridDistance(from, to, grid, rule);
  }
}