import { copy, list, number, point, record } from "./support.mjs";
import { distance, inside } from "./spatial.mjs";

function resolveOrigin(template) {
  record(template);
  if (template.origin) {
    point(template.origin);
    return { x: template.origin.x, y: template.origin.y };
  }
  number(template.x);
  number(template.y);
  return { x: template.x, y: template.y };
}

function resolveKind(template) {
  record(template);
  const kind = String(
    template.kind || template.shape || template.type || "circle",
  ).toLowerCase();
  if (!["circle", "burst", "cone", "ray", "line", "rect", "rectangle"].includes(kind)) {
    throw new TypeError(`Unsupported template kind: ${kind}`);
  }
  return kind;
}

function resolveDirectionRad(template, origin) {
  if (template.target && typeof template.target === "object") {
    point(template.target);
    return Math.atan2(template.target.y - origin.y, template.target.x - origin.x);
  }
  const deg = Number(template.direction ?? template.angleDeg ?? template.rotation ?? 0);
  number(deg);
  return (deg * Math.PI) / 180;
}

function scaleTemplateToGrid(template, grid) {
  if (!grid || typeof grid !== "object") return template;
  const cellPx = Number(grid.size ?? grid.cellSize ?? 0);
  const unitVal = Number(grid.relativesize?.size ?? grid.scale ?? 0);
  if (
    !Number.isFinite(cellPx) ||
    cellPx <= 0 ||
    !Number.isFinite(unitVal) ||
    unitVal <= 0
  ) {
    return template;
  }
  const pxPerUnit = cellPx / unitVal;
  if (template.radius !== undefined || template.length !== undefined) {
    return template;
  }
  const scaled = { ...template };
  if (scaled.range !== undefined) {
    scaled.radius = number(scaled.range) * pxPerUnit;
    scaled.length = scaled.radius;
  }
  if (scaled.width !== undefined) {
    scaled.width = number(scaled.width) * pxPerUnit;
  }
  if (scaled.height !== undefined) {
    scaled.height = number(scaled.height) * pxPerUnit;
  }
  return scaled;
}

export default class TemplateTool {
  polygon(template) {
    const kind = resolveKind(template);
    const origin = resolveOrigin(template);

    if (kind === "circle" || kind === "burst") {
      const radius = number(template.radius ?? template.length ?? template.range);
      if (radius <= 0) throw new RangeError("Template radius must be positive");
      const segments = Math.max(8, Math.min(128, Math.trunc(Number(template.segments || 32))));
      const pts = [];
      for (let i = 0; i < segments; i++) {
        const theta = (i / segments) * Math.PI * 2;
        pts.push({
          x: origin.x + Math.cos(theta) * radius,
          y: origin.y + Math.sin(theta) * radius,
        });
      }
      return pts;
    }

    if (kind === "cone") {
      const length = number(template.length ?? template.radius ?? template.range);
      if (length <= 0) throw new RangeError("Cone length must be positive");
      const arcDeg = Number(template.angle ?? template.arc ?? 90);
      number(arcDeg);
      if (arcDeg <= 0 || arcDeg > 360) throw new RangeError("Cone angle must be in (0, 360]");
      const dir = resolveDirectionRad(template, origin);
      const halfArc = ((arcDeg / 2) * Math.PI) / 180;
      const steps = Math.max(6, Math.min(64, Math.ceil((arcDeg / 360) * 32)));
      const pts = [];
      if (arcDeg < 360) pts.push({ x: origin.x, y: origin.y });
      for (let i = 0; i <= steps; i++) {
        const theta = dir - halfArc + (i / steps) * (halfArc * 2);
        pts.push({
          x: origin.x + Math.cos(theta) * length,
          y: origin.y + Math.sin(theta) * length,
        });
      }
      return pts;
    }

    if (kind === "ray" || kind === "line") {
      const length =
        template.target &&
        typeof template.target === "object" &&
        template.length === undefined &&
        template.range === undefined
          ? distance(origin, point(template.target))
          : number(template.length ?? template.radius ?? template.range);
      if (length <= 0) throw new RangeError("Ray length must be positive");
      const width = number(template.width ?? 5);
      if (width <= 0) throw new RangeError("Ray width must be positive");
      const dir = resolveDirectionRad(template, origin);
      const cos = Math.cos(dir);
      const sin = Math.sin(dir);
      const halfW = width / 2;
      const nx = -sin * halfW;
      const ny = cos * halfW;
      const ex = origin.x + cos * length;
      const ey = origin.y + sin * length;
      return [
        { x: origin.x + nx, y: origin.y + ny },
        { x: ex + nx, y: ey + ny },
        { x: ex - nx, y: ey - ny },
        { x: origin.x - nx, y: origin.y - ny },
      ];
    }

    const width = number(template.width ?? template.w);
    const height = number(template.height ?? template.h ?? width);
    if (width <= 0 || height <= 0) throw new RangeError("Rectangle dimensions must be positive");
    const rot = ((Number(template.rotation ?? template.direction ?? 0) || 0) * Math.PI) / 180;
    const corners = template.centered
      ? [
          { x: -width / 2, y: -height / 2 },
          { x: width / 2, y: -height / 2 },
          { x: width / 2, y: height / 2 },
          { x: -width / 2, y: height / 2 },
        ]
      : [
          { x: 0, y: 0 },
          { x: width, y: 0 },
          { x: width, y: height },
          { x: 0, y: height },
        ];
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    return corners.map((c) => ({
      x: origin.x + c.x * cos - c.y * sin,
      y: origin.y + c.x * sin + c.y * cos,
    }));
  }

  contains(template, target) {
    point(target);
    const kind = resolveKind(template);
    const origin = resolveOrigin(template);

    if (kind === "circle" || kind === "burst") {
      const radius = number(template.radius ?? template.length ?? template.range);
      if (radius <= 0) throw new RangeError("Template radius must be positive");
      return distance(origin, target) <= radius + 1e-9;
    }

    if (kind === "cone") {
      const length = number(template.length ?? template.radius ?? template.range);
      if (length <= 0) throw new RangeError("Cone length must be positive");
      const arcDeg = Number(template.angle ?? template.arc ?? 90);
      number(arcDeg);
      if (arcDeg <= 0 || arcDeg > 360) throw new RangeError("Cone angle must be in (0, 360]");
      const dist = distance(origin, target);
      if (dist > length + 1e-9) return false;
      if (dist <= 1e-9 || arcDeg >= 360) return true;
      const dir = resolveDirectionRad(template, origin);
      const angleToTarget = Math.atan2(target.y - origin.y, target.x - origin.x);
      const diff = Math.atan2(Math.sin(angleToTarget - dir), Math.cos(angleToTarget - dir));
      return Math.abs(diff) <= ((arcDeg / 2) * Math.PI) / 180 + 1e-9;
    }

    if (kind === "ray" || kind === "line") {
      const length =
        template.target &&
        typeof template.target === "object" &&
        template.length === undefined &&
        template.range === undefined
          ? distance(origin, point(template.target))
          : number(template.length ?? template.radius ?? template.range);
      if (length <= 0) throw new RangeError("Ray length must be positive");
      const width = number(template.width ?? 5);
      if (width <= 0) throw new RangeError("Ray width must be positive");
      const dir = resolveDirectionRad(template, origin);
      const dx = target.x - origin.x;
      const dy = target.y - origin.y;
      const along = dx * Math.cos(dir) + dy * Math.sin(dir);
      const perp = Math.abs(-dx * Math.sin(dir) + dy * Math.cos(dir));
      return along >= -1e-9 && along <= length + 1e-9 && perp <= width / 2 + 1e-9;
    }

    const poly = this.polygon(template);
    return inside(target, poly);
  }

  cells(template, grid = {}) {
    const resolved = scaleTemplateToGrid(template, grid);
    const poly = this.polygon(resolved);
    const cellSize = Number(grid?.cellSize ?? grid?.size ?? 64);
    if (!Number.isFinite(cellSize) || cellSize <= 0) {
      throw new RangeError("Grid cellSize must be positive");
    }
    const offsetX = Number(grid?.offsetX ?? grid?.offset?.left ?? 0) || 0;
    const offsetY = Number(grid?.offsetY ?? grid?.offset?.top ?? 0) || 0;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const pt of poly) {
      if (pt.x < minX) minX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y > maxY) maxY = pt.y;
    }
    const minCol = Math.floor((minX - offsetX) / cellSize);
    const maxCol = Math.floor((maxX - offsetX) / cellSize);
    const minRow = Math.floor((minY - offsetY) / cellSize);
    const maxRow = Math.floor((maxY - offsetY) / cellSize);
    const result = [];
    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        const cx = offsetX + (col + 0.5) * cellSize;
        const cy = offsetY + (row + 0.5) * cellSize;
        if (this.contains(resolved, { x: cx, y: cy })) {
          result.push({ col, row, x: cx, y: cy });
        }
      }
    }
    return result;
  }

  tokens(template, tokens = []) {
    list(tokens);
    this.polygon(template);
    return tokens
      .filter((tok) => {
        const center = tok?.position || { x: tok?.x, y: tok?.y };
        point(center);
        if (this.contains(template, center)) return true;
        const w = Number(tok?.w ?? tok?.width ?? tok?.size?.w ?? tok?.size?.width ?? 0);
        const h = Number(tok?.h ?? tok?.height ?? tok?.size?.h ?? tok?.size?.height ?? w);
        if (Number.isFinite(w) && w > 0 && Number.isFinite(h) && h > 0) {
          for (const dx of [-0.35, 0.35]) {
            for (const dy of [-0.35, 0.35]) {
              if (this.contains(template, { x: center.x + w * dx, y: center.y + h * dy })) {
                return true;
              }
            }
          }
        }
        return false;
      })
      .map(copy);
  }

  evaluate(template, scene = {}) {
    const resolved = scaleTemplateToGrid(template, scene?.grid);
    const poly = this.polygon(resolved);
    const affectedCells = scene?.grid ? this.cells(resolved, scene.grid) : [];
    const affectedTokens = Array.isArray(scene?.tokens)
      ? this.tokens(resolved, scene.tokens)
      : [];
    return {
      polygon: poly,
      cells: affectedCells,
      tokens: affectedTokens,
      tokenIds: affectedTokens.map((t) => t.id),
    };
  }
}
