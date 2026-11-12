import { copy, list, record, key } from "./support.mjs";

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

const SIGHT = Object.freeze({
  enabled: true,
  range: Object.freeze({ depth: 0, maximum: null }),
  luminance: Object.freeze({ minimum: 0, maximum: null }),
  transformation: null,
  hindered: Object.freeze({}),
});

class LocalVisionRegistry {
  #hindrances = new Set(["wall"]);
  #presets = new Map();

  constructor({ builtin = true } = {}) {
    if (builtin !== false) {
      this.#presets.set("sight", cloneValue(SIGHT));
    }
  }

  has(name) {
    return this.#presets.has(name);
  }

  register({ hindrances = [], presets = {} } = {}) {
    if (!Array.isArray(hindrances) || !plain(presets)) {
      throw new TypeError("Register hindrances alongside vision presets.");
    }
    const previous = new Set(this.#hindrances);
    const next = new Map(this.#presets);
    try {
      for (const k of hindrances) this.#hindrances.add(validName(k));
      for (const [k, v] of Object.entries(presets)) {
        validName(k);
        next.set(k, this.vision(v));
      }
      this.#presets = next;
    } catch (err) {
      this.#hindrances = previous;
      throw err;
    }
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
        : { saturation: visionNumber(value.transformation.saturation, 0, 1) };
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

function angleMatches(angle, range) {
  if (!range || (range.minimum === 0 && range.maximum === 360)) return true;
  const normalized = ((Number(angle) % 360) + 360) % 360;
  const minimum = range.minimum % 360;
  const maximum = range.maximum % 360;
  return minimum <= maximum
    ? normalized >= minimum && normalized < maximum
    : normalized >= minimum || normalized < maximum;
}

function hindrance(vision, visibility, angle, typesOverride) {
  const applicable = visibility.filter(
    (entry) => entry.calculate && angleMatches(angle, entry.angle),
  );
  const types = typesOverride ?? applicable.flatMap((entry) => entry.types);
  if (!applicable.length || !types.length) return 0;
  const matches = types.filter((k) => Object.hasOwn(vision.hindered, k));
  return matches.length ? Math.min(...matches.map((k) => vision.hindered[k])) : 1;
}

function effectiveDistance(baseDistance, crossings) {
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

function detailAt(vision, dist, observerLuminance) {
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

function inFieldOfView(token, at) {
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
  const colCenter =
    object.center || (isColumn ? { x: Number(object.x) || 0, y: Number(object.y) || 0 } : null);
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
  const segA =
    object.a ||
    (object.x1 !== undefined ? { x: Number(object.x1) || 0, y: Number(object.y1) || 0 } : null);
  const segB =
    object.b ||
    (object.x2 !== undefined ? { x: Number(object.x2) || 0, y: Number(object.y2) || 0 } : null);
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

function buildField(registry, scene, { fallback = null } = {}) {
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
          light.strength /
            (1 + (Math.hypot(at.x - light.position.x, at.y - light.position.y) / unit) ** 2) -
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
              ((Math.atan2(
                at.y - tokenPoint(observer.token).y,
                at.x - tokenPoint(observer.token).x,
              ) *
                180) /
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

  return { sample, visible, mask };
}

function computeObserverPolygon(observer, walls = [], maxRange = 2000) {
  const origin = tokenPoint(observer);
  const range = Math.max(10, Number(maxRange) || 2000);
  const fov = Number.isFinite(observer.fov) ? Math.min(360, Math.max(1, observer.fov)) : 360;
  const facing = Number(observer.facing) || 0;
  const closedSegments = [];
  for (const w of walls || []) {
    if (!w || ((w.door || w.kind === "door") && w.open)) continue;
    if ((w.column || w.kind === "column") && (w.center || w.x !== undefined) && w.radius > 0) {
      const cx = Number(w.center?.x ?? w.x) || 0;
      const cy = Number(w.center?.y ?? w.y) || 0;
      const r = Number(w.radius) || 1;
      const sides = 8;
      for (let i = 0; i < sides; i++) {
        const a0 = (i / sides) * Math.PI * 2;
        const a1 = ((i + 1) / sides) * Math.PI * 2;
        closedSegments.push({
          a: { x: cx + Math.cos(a0) * r, y: cy + Math.sin(a0) * r },
          b: { x: cx + Math.cos(a1) * r, y: cy + Math.sin(a1) * r },
        });
      }
      continue;
    }
    const segA =
      w.a || (w.x1 !== undefined ? { x: Number(w.x1) || 0, y: Number(w.y1) || 0 } : null);
    const segB =
      w.b || (w.x2 !== undefined ? { x: Number(w.x2) || 0, y: Number(w.y2) || 0 } : null);
    if (segA && segB) closedSegments.push({ a: segA, b: segB });
  }
  const rays = 64;
  const start = ((facing - fov / 2) * Math.PI) / 180;
  const span = (fov * Math.PI) / 180;
  const relative = (ang) => (((ang - start) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const angles = Array.from(
    { length: rays + (fov < 360 ? 1 : 0) },
    (_, i) => (i * span) / rays,
  );
  for (const seg of closedSegments) {
    for (const p of [seg.a, seg.b]) {
      for (const offset of [-1e-7, 0, 1e-7]) {
        const a = relative(Math.atan2(p.y - origin.y, p.x - origin.x) + offset);
        if (a <= span) angles.push(a);
      }
    }
  }
  angles.sort((a, b) => a - b);
  const pts = angles.map((rel) => {
    const angle = start + rel;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    let len = range;
    for (const seg of closedSegments) {
      const sx = seg.b.x - seg.a.x;
      const sy = seg.b.y - seg.a.y;
      const den = dx * sy - dy * sx;
      if (Math.abs(den) < 1e-12) continue;
      const ox = seg.a.x - origin.x;
      const oy = seg.a.y - origin.y;
      const t = (ox * sy - oy * sx) / den;
      const u = (ox * dy - oy * dx) / den;
      if (t >= 0 && t < len && u >= 0 && u <= 1) len = t;
    }
    return { x: origin.x + dx * len, y: origin.y + dy * len };
  });
  return fov < 360 ? [{ x: origin.x, y: origin.y }, ...pts, { x: origin.x, y: origin.y }] : pts;
}

function insidePoly(pt, polygon) {
  if (!pt || !Array.isArray(polygon) || polygon.length < 3) return false;
  let insideFlag = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if (
      a.y > pt.y !== b.y > pt.y &&
      pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y || 1e-12) + a.x
    ) {
      insideFlag = !insideFlag;
    }
  }
  return insideFlag;
}

function roofCovered(layer, observers) {
  if (!observers.length) return false;
  if (Array.isArray(layer.shape) && layer.shape.length >= 3) {
    if (observers.some((tok) => insidePoly(tokenPoint(tok), layer.shape))) return true;
  }
  for (const item of layer.items || []) {
    if (item.autoHide === false) continue;
    if (Array.isArray(item.points) && item.points.length >= 3) {
      if (observers.some((tok) => insidePoly(tokenPoint(tok), item.points))) return true;
    } else if (Number(item.width) > 0 && Number(item.height) > 0) {
      const ix = Number(item.x) || 0;
      const iy = Number(item.y) || 0;
      const iw = Number(item.width);
      const ih = Number(item.height);
      if (
        observers.some((tok) => {
          const p = tokenPoint(tok);
          return p.x >= ix && p.x <= ix + iw && p.y >= iy && p.y <= iy + ih;
        })
      ) {
        return true;
      }
    }
  }
  return false;
}

function resolveGroundLayers(scene, levelId, includeHidden = false) {
  const grounds = (scene.layers || []).filter((l) => l && l.type === "ground");
  if (!grounds.length) return null;
  const active = grounds.find((g) => g.id === levelId) || grounds[0];
  const index = grounds.indexOf(active);
  let low = index;
  while (low > 0 && grounds[low].alphaMask) low--;
  const stack = grounds.slice(low, index + 1);
  const shown = (layer) => includeHidden || layer.visible !== false;
  const collectItems = (type) =>
    shown(active)
      ? (active.children || [])
          .filter((l) => l.type === type && shown(l))
          .flatMap((l) => (l.items || []).map((item) => ({ ...item, layer: l.id })))
      : [];
  const grid = active.grid || scene.grid;
  const scale =
    (grid?.relativesize?.size ?? 5) / (grid?.size || grid?.cellSize || 100);
  return {
    active,
    levelId: active.id,
    stack,
    grid,
    scale,
    ambient: active.ambient ?? scene.ambient ?? 1,
    gmBrightness: active.gmBrightness ?? 0.6,
    tokens: collectItems("token"),
    walls: collectItems("wall"),
    lights: collectItems("light"),
  };
}

function buildVisibleGroundStack(stack, activeId, filteredTokens, gm = false) {
  const observers = (filteredTokens || []).filter((t) => t && (t.observer || t.owned));
  return stack
    .filter((ground) => gm || ground.visible !== false)
    .map((ground) => {
      const isTarget = ground.id === activeId;
      return {
        ...ground,
        children: (ground.children || [])
          .filter((layer) => {
            if (!gm && layer.visible === false) return false;
            if (!isTarget && layer.type !== "object") return false;
            if (!gm && isTarget && layer.type === "roof" && roofCovered(layer, observers)) {
              return false;
            }
            return true;
          })
          .map((layer) =>
            layer.type === "token"
              ? {
                  ...layer,
                  items: (filteredTokens || []).filter(
                    (tok) => !tok.layer || tok.layer === layer.id,
                  ),
                }
              : layer,
          ),
      };
    });
}

function stripNodePresentation(node) {
  if (Array.isArray(node)) return node.map(stripNodePresentation);
  if (!plain(node)) return node;
  const out = {};
  for (const [k, v] of Object.entries(node)) {
    if (k === "visionMask" || k === "presentation") continue;
    out[k] = stripNodePresentation(v);
  }
  return out;
}

export default class ProjectionTool {
  #cache = new Map();

  fields(value, names) {
    record(value);
    return Object.fromEntries(
      list(names)
        .filter((n) => Object.prototype.hasOwnProperty.call(value, key(n)))
        .map((n) => [n, copy(value[n])]),
    );
  }

  project(
    value,
    viewer,
    {
      public: publicFields = [],
      private: privateFields = [],
      ownerField = "owner",
    } = {},
  ) {
    const allowed = [
      ...publicFields,
      ...(viewer !== null &&
      viewer !== undefined &&
      value[ownerField] === viewer
        ? privateFields
        : []),
    ];
    return this.fields(value, allowed);
  }

  collection(values, viewer, options) {
    return list(values).map((v) => this.project(v, viewer, options));
  }

  sanitizeMap(map) {
    record(map);
    return stripNodePresentation(map);
  }

  projectBattlemap(
    map,
    viewer,
    {
      tokens: inputTokens = undefined,
      onTokenDraw = null,
      overrides = {},
      visionConfig = {},
      gm = false,
      levelId = undefined,
      useCache = true,
    } = {},
  ) {
    record(map);
    const viewerId = plain(viewer) ? viewer.id : viewer;
    const rawDefinition = plain(map.data?.definition)
      ? cloneValue(map.data.definition)
      : cloneValue(map);
    const baseScene = stripNodePresentation(rawDefinition);

    const mapId = map.id ?? map.mapid ?? baseScene.id ?? baseScene.mapid ?? "default";
    const revision = map.revision ?? baseScene.revision ?? 0;
    const groundInfo = resolveGroundLayers(
      baseScene,
      levelId ?? baseScene.levelId ?? baseScene.activeGroundId ?? null,
      Boolean(gm),
    );
    const resolvedLevelId =
      groundInfo?.levelId ?? levelId ?? baseScene.levelId ?? baseScene.activeGroundId ?? null;
    const cacheKey = JSON.stringify([
      viewerId ?? null,
      mapId,
      revision,
      Boolean(gm),
      resolvedLevelId,
    ]);

    if (useCache && this.#cache.has(cacheKey)) {
      return cloneValue(this.#cache.get(cacheKey).scene);
    }

    const useBuiltin =
      visionConfig?.builtin !== false &&
      !Object.hasOwn(visionConfig?.presets || {}, "sight");
    const reg = new LocalVisionRegistry({ builtin: useBuiltin });
    reg.register({
      hindrances: visionConfig?.hindrances || [],
      presets: visionConfig?.presets || {},
    });

    const sourceTokens = Array.isArray(inputTokens)
      ? inputTokens
      : Array.isArray(baseScene.tokens) && baseScene.tokens.length
        ? baseScene.tokens
        : groundInfo
          ? groundInfo.tokens
          : Array.isArray(baseScene.tokens)
            ? baseScene.tokens
            : [];
    const resolvedWalls =
      Array.isArray(baseScene.walls) && baseScene.walls.length
        ? baseScene.walls
        : groundInfo
          ? groundInfo.walls
          : baseScene.walls || [];
    const resolvedLights =
      Array.isArray(baseScene.lights) && baseScene.lights.length
        ? baseScene.lights
        : groundInfo
          ? groundInfo.lights
          : baseScene.lights || [];
    const resolvedGrid = baseScene.grid || groundInfo?.grid;
    const resolvedScale = baseScene.scale ?? groundInfo?.scale ?? 1;
    const resolvedAmbient = baseScene.ambient ?? groundInfo?.ambient ?? 1;
    const resolvedSize = {
      width: baseScene.size?.width ?? baseScene.width ?? 2000,
      height: baseScene.size?.height ?? baseScene.height ?? 1400,
    };

    const preparedTokens = [];
    for (const token of sourceTokens) {
      const basePresentation = {
        opacity: 1,
        luminance: token.luminance || { strength: 0, hue: "#ffffff" },
        ...reg.presentation(token.presentation || {}),
      };
      let adjusted = {};
      if (typeof onTokenDraw === "function") {
        const tokenRef = { id: token.id, map: mapId, parent: token.parent || null };
        const viewerRef = { metatype: "account", id: viewerId };
        const outcome = onTokenDraw(
          {
            ...tokenRef,
            token: tokenRef,
            viewer: viewerRef,
            presentation: cloneValue(basePresentation),
          },
          viewerRef,
        );
        if (outcome === false || (plain(outcome) && outcome.accepted === false)) {
          continue;
        }
        if (plain(outcome) && Array.isArray(outcome.responses)) {
          if (outcome.responses.length > 1) {
            throw new TypeError("TokenDraw requires one presentation authority.");
          }
          adjusted = reg.presentation(outcome.responses[0] ?? {});
        } else if (plain(outcome)) {
          adjusted = reg.presentation(outcome);
        }
      }
      if (plain(overrides) && Object.hasOwn(overrides, token.id)) {
        const ov = overrides[token.id];
        if (ov === false) continue;
        adjusted = { ...adjusted, ...reg.presentation(ov || {}) };
      }
      const owned =
        token.owned !== undefined
          ? Boolean(token.owned)
          : viewerId !== null &&
            viewerId !== undefined &&
            (token.owner === viewerId ||
              token.ownerId === viewerId ||
              (Array.isArray(token.owners) && token.owners.includes(viewerId)));
      const observer =
        token.observer !== undefined ? Boolean(token.observer) : owned;
      const cleanToken = stripNodePresentation(token);
      preparedTokens.push({
        ...cleanToken,
        owned,
        observer,
        presentation: { ...basePresentation, ...adjusted },
      });
    }

    const scene = {
      ...baseScene,
      width: resolvedSize.width,
      height: resolvedSize.height,
       ...(resolvedGrid ? { grid: resolvedGrid } : {}),
      scale: resolvedScale,
      ambient: resolvedAmbient,
      walls: resolvedWalls,
      lights: resolvedLights,
      mapid: mapId,
      levelId: resolvedLevelId,
      tokens: preparedTokens,
    };

    const sense =
      visionConfig?.fallback !== undefined
        ? visionConfig.fallback
        : reg.has("sight")
          ? "sight"
          : null;
    const observerTokens = scene.tokens.filter(
      (token) => token.observer && !token.blind && (token.vision ?? sense),
    );
    const observing = observerTokens.length > 0;
    const fogEnabled =
      scene.fogEnabled !== undefined
        ? scene.fogEnabled !== false
        : scene.fog !== undefined
          ? Boolean(scene.fog)
          : true;

    if (!gm && fogEnabled) {
      const field = buildField(reg, scene, { fallback: sense });
      scene.visionMask = field.mask();
      scene.tokens = scene.tokens.filter(
        (token) => token.owned || (observing && field.visible(token)),
      );
    } else if (observing) {
      scene.visionMask = buildField(reg, scene, { fallback: sense }).mask();
    }

    scene.tokens = scene.tokens.filter((token) =>
      reg.visibility(token.visibility).some((entry) => entry.calculate),
    );

    if (groundInfo) {
      const projectedStack = buildVisibleGroundStack(
        groundInfo.stack,
        groundInfo.levelId,
        scene.tokens,
        Boolean(gm),
      );
      scene.layers = projectedStack;
      scene.groundStack = projectedStack.map((g) => g.id);
    }

    const maxMapDim = Math.hypot(resolvedSize.width, resolvedSize.height);
    const visionPolygons = observerTokens.map((obs) => {
      const senses = [obs.vision ?? sense].flat().map((v) => reg.vision(v));
      let maxSenseRange = maxMapDim;
      let minSaturation = 1;
      for (const s of senses) {
        if (s.range?.maximum != null) {
          const pxRange = s.range.maximum / (resolvedScale || 1);
          maxSenseRange = Math.min(maxSenseRange, pxRange);
        }
        if (s.transformation?.saturation !== undefined) {
          minSaturation = Math.min(minSaturation, s.transformation.saturation);
        }
      }
      const pt = tokenPoint(obs);
      return {
        observerId: obs.id,
        x: pt.x,
        y: pt.y,
        range: maxSenseRange,
        fov: Number.isFinite(obs.fov) ? obs.fov : 360,
        facing: Number(obs.facing) || 0,
        saturation: minSaturation,
        polygon: computeObserverPolygon(obs, resolvedWalls, maxSenseRange),
      };
    });

    const lightSources = [
      ...(resolvedLights || [])
        .filter((l) => l && l.enabled !== false)
        .map((l, idx) => {
          const pt = tokenPoint(l);
          return {
            id: l.id ?? `light-${idx}`,
            x: pt.x,
            y: pt.y,
            strength: Number(l.intensity ?? l.bright ?? 1),
            radius: Number(l.dim ?? l.bright ?? l.radius ?? 120),
            color: l.color ?? "#ffe4a0",
            source: "light",
          };
        }),
      ...scene.tokens
        .filter((t) => t.presentation?.luminance?.strength > 0)
        .map((t) => {
          const pt = tokenPoint(t);
          return {
            id: t.id,
            x: pt.x,
            y: pt.y,
            strength: t.presentation.luminance.strength,
            radius: t.presentation.luminance.strength * (resolvedGrid?.size || 100),
            hue: t.presentation.luminance.hue || "#ffffff",
            source: "token",
          };
        }),
    ];

    scene.visionPolygons = visionPolygons;
    scene.lightSources = lightSources;
    const sceneSnapshot = cloneValue(scene);
    scene.scene = sceneSnapshot;

    if (useCache) {
      for (const oldKey of this.#cache.keys()) {
        const [v, m, , mode] = JSON.parse(oldKey);
        if (v === (viewerId ?? null) && m === mapId && mode === Boolean(gm)) {
          this.#cache.delete(oldKey);
        }
      }
      if (this.#cache.size >= 32) {
        this.#cache.delete(this.#cache.keys().next().value);
      }
      this.#cache.set(cacheKey, {
        scene: cloneValue(scene),
        viewerId: viewerId ?? null,
        mapId,
        revision,
        gm: Boolean(gm),
      });
    }

    return cloneValue(scene);
  }

  invalidate(viewer = undefined, { mapId = undefined } = {}) {
    const viewerId = plain(viewer) ? viewer.id : viewer;
    let count = 0;
    for (const [k, entry] of this.#cache.entries()) {
      const matchViewer = viewerId === undefined || entry.viewerId === viewerId;
      const matchMap = mapId === undefined || entry.mapId === mapId;
      if (matchViewer && matchMap) {
        this.#cache.delete(k);
        count++;
      }
    }
    return { invalidated: true, count };
  }

  diffProjection(previous, next) {
    record(previous);
    record(next);
    const before = new Map((previous.tokens || []).map((t) => [t.id, t]));
    const after = new Map((next.tokens || []).map((t) => [t.id, t]));
    const delta = {
      map: next.mapid ?? next.id ?? previous.mapid ?? previous.id ?? null,
      levelId: next.levelId ?? previous.levelId ?? null,
      tokens: [],
      added: [],
      removed: [],
    };
    for (const token of next.tokens || []) {
      if (!before.has(token.id)) {
        delta.added.push(cloneValue(token));
      } else if (
        JSON.stringify(before.get(token.id).presentation) !==
        JSON.stringify(token.presentation)
      ) {
        delta.tokens.push({
          id: token.id,
          presentation: cloneValue(token.presentation),
        });
      }
    }
    for (const id of before.keys()) {
      if (!after.has(id)) delta.removed.push(id);
    }
    if (JSON.stringify(previous.visionMask) !== JSON.stringify(next.visionMask)) {
      delta.visionMask = next.visionMask ? cloneValue(next.visionMask) : null;
    }
    delta.changed = Boolean(
      delta.tokens.length ||
        delta.added.length ||
        delta.removed.length ||
        Object.hasOwn(delta, "visionMask"),
    );
    return delta;
  }
}
