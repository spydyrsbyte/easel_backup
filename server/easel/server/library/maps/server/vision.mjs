import { integer, copy, list, number, point } from "./support.mjs";
import { distance, intersects } from "./spatial.mjs";

const plain = (value) => Boolean(value && typeof value === "object" && !Array.isArray(value));

function cloneValue(value) {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (plain(value)) {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = cloneValue(v);
    return out;
  }
  return value;
}

function visionNumber(value, minimum = 0, maximum = Infinity) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new TypeError("Invalid vision number.");
  }
  return value;
}

function validName(value) {
  if (typeof value !== "string" || !/^[a-zA-Z][a-zA-Z0-9._-]{0,79}$/.test(value)) {
    throw new TypeError("Invalid hindrance or preset name.");
  }
  return value;
}

function base64(bytes) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let output = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index];
    const b = bytes[index + 1] ?? 0;
    const c = bytes[index + 2] ?? 0;
    output +=
      alphabet[a >> 2] +
      alphabet[((a & 3) << 4) | (b >> 4)] +
      (index + 1 < bytes.length ? alphabet[((b & 15) << 2) | (c >> 6)] : "=") +
      (index + 2 < bytes.length ? alphabet[c & 63] : "=");
  }
  return output;
}

export const SIGHT = Object.freeze({
  enabled: true,
  range: Object.freeze({ depth: 0, maximum: null }),
  luminance: Object.freeze({ minimum: 0, maximum: null }),
  transformation: null,
  hindered: Object.freeze({}),
});

export class VisionRegistry {
  #hindrances = new Set();
  #presets = new Map();
  #builtinPreset = false;

  constructor({ builtin = true } = {}) {
    this.#reset(builtin);
  }

  #reset(builtin = true) {
    this.#hindrances = new Set(["wall"]);
    this.#presets = new Map();
    this.#builtinPreset = false;
    if (builtin !== false) {
      this.#presets.set("sight", cloneValue(SIGHT));
      this.#builtinPreset = true;
    }
  }

  has(name) {
    return this.#presets.has(name);
  }

  catalog() {
    return {
      hindrances: [...this.#hindrances],
      presets: Object.fromEntries(
        [...this.#presets].map(([k, v]) => [k, cloneValue(v)]),
      ),
    };
  }

  register({ hindrances = [], presets = {}, builtin, reset = false } = {}) {
    if (!Array.isArray(hindrances) || !plain(presets)) {
      throw new TypeError("Register hindrances alongside vision presets.");
    }
    if (reset || builtin === false) {
      this.#reset(builtin !== false);
    }
    const previousHindrances = new Set(this.#hindrances);
    const previousPresets = new Map(this.#presets);
    const previousBuiltin = this.#builtinPreset;
    try {
      for (const k of hindrances) this.#hindrances.add(validName(k));
      const next = new Map(this.#presets);
      for (const [k, v] of Object.entries(presets)) {
        validName(k);
        if (next.has(k) && !(k === "sight" && this.#builtinPreset)) {
          throw new TypeError("Duplicate vision preset.");
        }
        next.set(k, this.vision(v));
        if (k === "sight") this.#builtinPreset = false;
      }
      this.#presets = next;
    } catch (error) {
      this.#hindrances = previousHindrances;
      this.#presets = previousPresets;
      this.#builtinPreset = previousBuiltin;
      throw error;
    }
    return this.catalog();
  }

  types(value = []) {
    if (
      !Array.isArray(value) ||
      value.length > 64 ||
      value.some((k) => !this.#hindrances.has(k))
    ) {
      throw new TypeError("Visibility must reference registered hindrances.");
    }
    return [...new Set(value)];
  }

  vision(value) {
    if (typeof value === "string") {
      if (!this.#presets.has(value)) throw new TypeError("Unknown vision preset.");
      return cloneValue(this.#presets.get(value));
    }
    if (!plain(value) || !plain(value.range) || !plain(value.luminance) || !plain(value.hindered)) {
      throw new TypeError("Invalid vision definition.");
    }
    const depth = visionNumber(value.range.depth);
    const maximum = value.range.maximum === null ? null : visionNumber(value.range.maximum, depth);
    const minimum = visionNumber(value.luminance.minimum);
    const lightMaximum =
      value.luminance.maximum === null ? null : visionNumber(value.luminance.maximum, minimum);
    if (value.enabled !== undefined && typeof value.enabled !== "boolean") {
      throw new TypeError("Vision enabled must be boolean.");
    }
    if (
      value.transformation != null &&
      (!plain(value.transformation) ||
        Object.keys(value.transformation).some((k) => k !== "saturation"))
    ) {
      throw new TypeError("Unsupported vision transformation.");
    }
    const transformation =
      value.transformation == null
        ? null
        : {
            saturation: visionNumber(value.transformation.saturation, 0, 1),
          };
    const hindered = Object.fromEntries(
      Object.entries(value.hindered).map(([k, amount]) => {
        this.types([k]);
        return [k, visionNumber(amount, 0, 1)];
      }),
    );
    return {
      enabled: value.enabled !== false,
      range: { depth, maximum },
      luminance: { minimum, maximum: lightMaximum },
      transformation,
      hindered,
    };
  }

  visibility(value = true) {
    if (typeof value === "boolean") return [{ calculate: value, types: [] }];
    const entries = Array.isArray(value) ? value : [value];
    if (entries.length > 64) throw new TypeError("Too many visibility entries.");
    return entries.map((entry) => {
      if (!plain(entry) || typeof entry.calculate !== "boolean") {
        throw new TypeError("Invalid visibility definition.");
      }
      const result = { calculate: entry.calculate, types: this.types(entry.types) };
      if (entry.angle !== undefined) {
        if (!plain(entry.angle)) throw new TypeError("Invalid visibility angle.");
        result.angle = {
          minimum: visionNumber(entry.angle.minimum, 0, 360),
          maximum: visionNumber(entry.angle.maximum, 0, 360),
        };
      }
      return result;
    });
  }

  presentation(value = {}) {
    if (
      !plain(value) ||
      Object.keys(value).some((k) => !["opacity", "luminance", "types"].includes(k))
    ) {
      throw new TypeError("Invalid token presentation response.");
    }
    const result = {};
    if (value.opacity !== undefined) result.opacity = visionNumber(value.opacity, 0, 1);
    if (value.types !== undefined) result.types = this.types(value.types);
    if (value.luminance !== undefined) {
      const light = value.luminance;
      if (!plain(light) || typeof light.hue !== "string" || !/^#[0-9a-f]{6}$/i.test(light.hue)) {
        throw new TypeError("Invalid token luminance.");
      }
      result.luminance = { strength: visionNumber(light.strength, 0, 100), hue: light.hue };
    }
    return result;
  }
}

export function angleMatches(angle, range) {
  if (!range || (range.minimum === 0 && range.maximum === 360)) return true;
  const normalized = ((Number(angle) % 360) + 360) % 360;
  const minimum = range.minimum % 360;
  const maximum = range.maximum % 360;
  return minimum <= maximum
    ? normalized >= minimum && normalized < maximum
    : normalized >= minimum || normalized < maximum;
}

export function hindrance(vision, visibility, angle = 0, typesOverride = undefined) {
  const entries = Array.isArray(visibility) ? visibility : [visibility];
  const applicable = entries.filter(
    (entry) => entry && entry.calculate && angleMatches(angle, entry.angle),
  );
  const types = typesOverride ?? applicable.flatMap((entry) => entry.types || []);
  if (!applicable.length) return 0;
  if (!types.length) return 0;
  const hinderedMap = vision?.hindered || {};
  const matches = types.filter((k) => Object.hasOwn(hinderedMap, k));
  return matches.length ? Math.min(...matches.map((k) => hinderedMap[k])) : 1;
}

export function combineHindrances(values = []) {
  list(values);
  return 1 - values.reduce((remaining, value) => remaining * (1 - visionNumber(value, 0, 1)), 1);
}

export function effectiveDistance(baseDistance, crossings = []) {
  visionNumber(baseDistance, 0);
  list(crossings);
  let previous = 0;
  let multiplier = 1;
  let total = 0;
  for (const crossing of [...crossings].sort((a, b) => a.distance - b.distance)) {
    if (crossing.distance >= baseDistance) break;
    total += Math.max(0, crossing.distance - previous) * multiplier;
    if (crossing.hindrance >= 1) return Infinity;
    multiplier /= 1 - crossing.hindrance;
    previous = crossing.distance;
  }
  return total + (baseDistance - previous) * multiplier;
}

export function detailAt(vision, dist, observerLuminance = 1) {
  const light = vision.luminance;
  if (
    !vision.enabled ||
    observerLuminance < light.minimum ||
    (light.maximum !== null && observerLuminance > light.maximum) ||
    !Number.isFinite(dist)
  ) {
    return 0;
  }
  const { depth, maximum } = vision.range;
  if (maximum !== null && dist >= maximum) return 0;
  if (maximum === null || dist <= depth) return 1;
  const t = (dist - depth) / (maximum - depth);
  return 1 - t * t * (3 - 2 * t);
}

const tokenPoint = (token) => token.position || { x: Number(token.x) || 0, y: Number(token.y) || 0 };
const tokenSize = (token) =>
  token.size
    ? {
        width: Number(token.size.width ?? token.size.w ?? 1) || 1,
        height: Number(token.size.height ?? token.size.h ?? 1) || 1,
      }
    : {
        width: Number(token.width ?? token.w ?? 1) || 1,
        height: Number(token.height ?? token.h ?? 1) || 1,
      };

export function inFieldOfView(token, at) {
  const fov = Number.isFinite(token.fov) ? token.fov : 360;
  const origin = tokenPoint(token);
  if (fov >= 359.9 || Math.hypot(at.x - origin.x, at.y - origin.y) < 1e-9) return true;
  const facing = ((Number(token.facing) || 0) * Math.PI) / 180 - Math.PI / 2;
  let difference = Math.atan2(at.y - origin.y, at.x - origin.x) - facing;
  difference = Math.atan2(Math.sin(difference), Math.cos(difference));
  return Math.abs(difference) <= (fov * Math.PI) / 360 + 1e-9;
}

function entryDistance(a, b, object) {
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  if (!length) return null;
  const isColumn = Boolean(object.column || object.kind === "column");
  const colCenter = object.center || (isColumn ? { x: Number(object.x) || 0, y: Number(object.y) || 0 } : null);
  if (isColumn && colCenter && object.radius > 0) {
    const dx = (b.x - a.x) / length;
    const dy = (b.y - a.y) / length;
    const ox = a.x - colCenter.x;
    const oy = a.y - colCenter.y;
    const projection = ox * dx + oy * dy;
    const discriminant = projection ** 2 - (ox ** 2 + oy ** 2 - object.radius ** 2);
    if (discriminant < 0) return null;
    const entry = -projection - Math.sqrt(discriminant);
    const exit = -projection + Math.sqrt(discriminant);
    return exit > 1e-7 && entry < length ? Math.max(0, entry) : null;
  }
  const segA = object.a || (object.x1 !== undefined ? { x: Number(object.x1) || 0, y: Number(object.y1) || 0 } : null);
  const segB = object.b || (object.x2 !== undefined ? { x: Number(object.x2) || 0, y: Number(object.y2) || 0 } : null);
  if (segA && segB) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const sx = segB.x - segA.x;
    const sy = segB.y - segA.y;
    const determinant = dx * sy - dy * sx;
    if (Math.abs(determinant) < 1e-9) return null;
    const ax = segA.x - a.x;
    const ay = segA.y - a.y;
    const t = (ax * sy - ay * sx) / determinant;
    const u = (ax * dy - ay * dx) / determinant;
    return t > 1e-7 && t < 1 && u >= 0 && u <= 1 ? t * length : null;
  }
  const center = tokenPoint(object);
  const extent = tokenSize(object);
  let low = 0;
  let high = 1;
  for (const [axis, span] of [
    ["x", extent.width],
    ["y", extent.height],
  ]) {
    const delta = b[axis] - a[axis];
    const minimum = center[axis] - span / 2;
    const maximum = center[axis] + span / 2;
    if (Math.abs(delta) < 1e-9) {
      if (a[axis] < minimum || a[axis] > maximum) return null;
    } else {
      const first = (minimum - a[axis]) / delta;
      const second = (maximum - a[axis]) / delta;
      low = Math.max(low, Math.min(first, second));
      high = Math.min(high, Math.max(first, second));
      if (low > high) return null;
    }
  }
  return high > 1e-7 && low < 1 ? Math.max(0, low) * length : null;
}

export function createVisionField(registryOrScene, maybeScene = {}, maybeOptions = {}) {
  const hasRegistry =
    registryOrScene &&
    typeof registryOrScene.visibility === "function" &&
    typeof registryOrScene.vision === "function";
  const registry = hasRegistry ? registryOrScene : new VisionRegistry();
  const scene = hasRegistry ? maybeScene : registryOrScene;
  const options = hasRegistry ? maybeOptions : maybeScene || {};
  const fallback = options.fallback ?? null;

  const objects = [
    ...(scene.walls || [])
      .filter((wall) => !((wall.door || wall.kind === "door") && wall.open))
      .map((wall) => ({
        ...wall,
        visibility: wall.visibility ?? { calculate: true, types: ["wall"] },
      })),
    ...(scene.tokens || []),
  ]
    .map((object) => ({ object, visibility: registry.visibility(object.visibility) }))
    .filter(({ object, visibility }) =>
      visibility.some(
        (entry) => entry.calculate && (object.presentation?.types ?? entry.types).length > 0,
      ),
    );

  const lights = [
    ...(scene.lights || [])
      .filter((light) => light.enabled !== false)
      .map((light) => ({
        position: tokenPoint(light),
        strength: light.intensity ?? light.bright ?? 1,
      })),
    ...(scene.tokens || [])
      .filter((token) => token.presentation?.luminance?.strength > 0)
      .map((token) => ({
        position: tokenPoint(token),
        strength: token.presentation.luminance.strength,
      })),
  ];

  const unit = scene.grid?.size || scene.grid?.cellSize || 5;
  const illumination = (at) =>
    (scene.ambient ?? 1) +
    lights.reduce((sum, light) => {
      if (
        objects.some(
          ({ object }) =>
            (object.a || object.x1 !== undefined) &&
            entryDistance(light.position, at, object) !== null,
        )
      ) {
        return sum;
      }
      return (
        sum +
        Math.max(
          0,
          light.strength / (1 + (Math.hypot(at.x - light.position.x, at.y - light.position.y) / unit) ** 2) -
            0.05,
        )
      );
    }, 0);

  const observers = (scene.tokens || [])
    .filter((token) => token.observer && !token.blind && (token.vision ?? fallback))
    .map((token) => ({
      token,
      senses: [token.vision ?? fallback].flat().map((v) => registry.vision(v)),
      luminance: illumination(tokenPoint(token)),
    }));

  const scale = Number.isFinite(scene.scale) && scene.scale > 0 ? scene.scale : 1;

  function sample(at, targetId = null) {
    let detail = 0;
    let saturation = 0;
    for (const observer of observers) {
      if (!inFieldOfView(observer.token, at)) continue;
      const origin = tokenPoint(observer.token);
      const angle = ((Math.atan2(at.y - origin.y, at.x - origin.x) * 180) / Math.PI + 360) % 360;
      for (const vision of observer.senses) {
        const crossings = [];
        for (const { object, visibility } of objects) {
          if (object === observer.token || (targetId !== null && object.id === targetId)) continue;
          const entry = entryDistance(origin, at, object);
          if (entry === null) continue;
          const amount = hindrance(vision, visibility, angle, object.presentation?.types);
          if (amount) crossings.push({ distance: entry * scale, hindrance: amount });
        }
        const value = detailAt(
          vision,
          effectiveDistance(Math.hypot(at.x - origin.x, at.y - origin.y) * scale, crossings),
          observer.luminance,
        );
        if (value > detail) {
          detail = value;
          saturation = vision.transformation?.saturation ?? 1;
        } else if (value === detail) {
          saturation = Math.max(saturation, vision.transformation?.saturation ?? 1);
        }
      }
    }
    return { detail, saturation };
  }

  function visible(token) {
    const at = tokenPoint(token);
    const extent = tokenSize(token);
    const eligible = registry
      .visibility(token.visibility)
      .some(
        (entry) =>
          entry.calculate &&
          observers.some((observer) =>
            angleMatches(
              ((Math.atan2(at.y - tokenPoint(observer.token).y, at.x - tokenPoint(observer.token).x) * 180) /
                Math.PI +
                360) %
                360,
              entry.angle,
            ),
          ),
      );
    if (!eligible || token.hidden || token.presentation?.opacity === 0) return false;
    for (const dx of [-0.49, 0, 0.49]) {
      for (const dy of [-0.49, 0, 0.49]) {
        if (
          sample({ x: at.x + extent.width * dx, y: at.y + extent.height * dy }, token.id).detail > 0
        ) {
          return true;
        }
      }
    }
    return false;
  }

  function mask() {
    const widthScene = Math.max(1, Number(scene.width) || 100);
    const heightScene = Math.max(1, Number(scene.height) || 100);
    const maskScale = Math.min(128 / widthScene, 128 / heightScene);
    const width = Math.max(2, Math.ceil(widthScene * maskScale));
    const height = Math.max(2, Math.ceil(heightScene * maskScale));
    const bytes = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const result = sample({
          x: ((x + 0.5) * widthScene) / width,
          y: ((y + 0.5) * heightScene) / height,
        });
        const offset = (y * width + x) * 4;
        bytes[offset] = Math.round(result.detail * 255);
        bytes[offset + 1] = Math.round((1 - result.saturation) * 255);
        bytes[offset + 3] = 255;
      }
    }
    return { width, height, rgba: base64(bytes) };
  }

  return { sample, visible, mask, luminanceAt: illumination };
}

export default class VisionTool {
  #registry = new VisionRegistry();

  register(options = {}) {
    return this.#registry.register(options);
  }

  catalog() {
    return this.#registry.catalog();
  }

  has(name) {
    return this.#registry.has(name);
  }

  types(value) {
    return this.#registry.types(value);
  }

  vision(value) {
    return this.#registry.vision(value);
  }

  visibility(value) {
    return this.#registry.visibility(value);
  }

  presentation(value) {
    return this.#registry.presentation(value);
  }

  angleMatches(angle, range) {
    return angleMatches(angle, range);
  }

  inFieldOfView(token, at) {
    return inFieldOfView(token, at);
  }

  hindrance(visionDef, visibilityDef, angle = 0, typesOverride = undefined) {
    return hindrance(visionDef, visibilityDef, angle, typesOverride);
  }

  combineHindrances(values = []) {
    return combineHindrances(values);
  }

  effectiveDistance(dist, crossings = []) {
    return effectiveDistance(dist, crossings);
  }

  detailAt(visionDef, dist, observerLuminance = 1) {
    return detailAt(visionDef, dist, observerLuminance);
  }

  createVisionField(registryOrScene, maybeScene, maybeOptions) {
    const hasRegistry =
      registryOrScene &&
      typeof registryOrScene.visibility === "function" &&
      typeof registryOrScene.vision === "function";
    if (hasRegistry) {
      return createVisionField(registryOrScene, maybeScene, maybeOptions);
    }
    return createVisionField(this.#registry, registryOrScene, maybeScene);
  }

  evaluateScene(
    scene,
    { hindrances = [], presets = {}, fallback, builtin = true, samplePoints = [] } = {},
  ) {
    const useBuiltin = builtin !== false && !Object.hasOwn(presets || {}, "sight");
    const reg = new VisionRegistry({ builtin: useBuiltin });
    reg.register({ hindrances, presets });
    const resolvedFallback =
      fallback !== undefined ? fallback : reg.has("sight") ? "sight" : null;
    const field = createVisionField(reg, scene, { fallback: resolvedFallback });
    const visibleTokens = (scene.tokens || []).filter(
      (token) => token.owned || field.visible(token),
    );
    const samples = (samplePoints || []).map((pt) => ({
      x: pt.x,
      y: pt.y,
      ...field.sample(pt),
    }));
    return {
      visionMask: field.mask(),
      tokens: visibleTokens.map(cloneValue),
      visibleTokenIds: visibleTokens.map((t) => t.id),
      samples,
    };
  }

  visible(
    observer,
    targets,
    { range = 10, walls = [], facing = 0, fov = 360 } = {},
  ) {
    point(observer);
    number(range);
    number(facing);
    number(fov);
    if (range < 0 || fov < 0 || fov > 360)
      throw new RangeError("Invalid vision bounds");
    return list(targets)
      .filter((t) => {
        point(t);
        if (distance(observer, t) > range) return false;
        const angle =
          (Math.atan2(t.y - observer.y, t.x - observer.x) * 180) / Math.PI;
        const delta = ((angle - facing + 540) % 360) - 180;
        return (
          Math.abs(delta) <= fov / 2 &&
          !list(walls).some((w) => !w.open && intersects(observer, t, w.a, w.b))
        );
      })
      .map(copy);
  }

  polygon(
    observer,
    { range = 10, walls = [], facing = 0, fov = 360, rays = 128 } = {},
  ) {
    point(observer);
    number(range);
    number(facing);
    number(fov);
    integer(rays, 4, 2048);
    if (range < 0 || fov <= 0 || fov > 360)
      throw new RangeError("Invalid vision bounds");
    const closed = list(walls).filter((w) => !w.open);
    for (const w of closed) {
      point(w.a);
      point(w.b);
    }
    const start = ((facing - fov / 2) * Math.PI) / 180,
      span = (fov * Math.PI) / 180;
    const relative = (angle) =>
      (((angle - start) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const angles = Array.from(
      { length: rays + (fov < 360 ? 1 : 0) },
      (_, i) => (i * span) / rays,
    );
    for (const w of closed)
      for (const p of [w.a, w.b])
        for (const offset of [-1e-7, 0, 1e-7]) {
          const a = relative(
            Math.atan2(p.y - observer.y, p.x - observer.x) + offset,
          );
          if (a <= span) angles.push(a);
        }
    angles.sort((a, b) => a - b);
    const result = angles.map((relativeAngle) => {
      const angle = start + relativeAngle,
        dx = Math.cos(angle),
        dy = Math.sin(angle);
      let length = range;
      for (const w of closed) {
        const sx = w.b.x - w.a.x,
          sy = w.b.y - w.a.y,
          den = dx * sy - dy * sx;
        if (Math.abs(den) < 1e-12) continue;
        const ox = w.a.x - observer.x,
          oy = w.a.y - observer.y,
          t = (ox * sy - oy * sx) / den,
          u = (ox * dy - oy * dx) / den;
        if (t >= 0 && t < length && u >= 0 && u <= 1) length = t;
      }
      return { x: observer.x + dx * length, y: observer.y + dy * length };
    });
    return fov < 360
      ? [
          { x: observer.x, y: observer.y },
          ...result,
          { x: observer.x, y: observer.y },
        ]
      : result;
  }
}
