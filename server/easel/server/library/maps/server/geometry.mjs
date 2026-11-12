import { list, point } from "./support.mjs";
import { distance, inside, intersects } from "./spatial.mjs";

export const LAYER_TYPES = Object.freeze([
  "object",
  "drawing",
  "wall",
  "token",
  "light",
  "roof",
]);

export const LAYER_FEATURES = Object.freeze({
  ground: Object.freeze({
    shape: false,
    alphaMask: true,
    lightMask: false,
    height: true,
  }),
  object: Object.freeze({
    shape: true,
    alphaMask: true,
    lightMask: true,
    height: false,
  }),
  drawing: Object.freeze({
    shape: true,
    alphaMask: false,
    lightMask: false,
    height: false,
  }),
  wall: Object.freeze({
    shape: true,
    alphaMask: false,
    lightMask: false,
    height: false,
  }),
  token: Object.freeze({
    shape: true,
    alphaMask: false,
    lightMask: false,
    height: false,
  }),
  light: Object.freeze({
    shape: true,
    alphaMask: false,
    lightMask: true,
    height: false,
  }),
  roof: Object.freeze({
    shape: true,
    alphaMask: true,
    lightMask: false,
    height: false,
  }),
});

export const ITEM_KINDS = Object.freeze({
  object: "image",
  roof: "image",
  drawing: "drawing",
  wall: "wall",
  token: "token",
  light: "light",
});

export const LAYER_FOR_ITEM = Object.freeze({
  image: ["object", "roof"],
  drawing: ["drawing"],
  wall: ["wall"],
  door: ["wall"],
  column: ["wall"],
  token: ["token"],
  light: ["light"],
});

export const DEFAULT_GRID = Object.freeze({
  type: "square",
  size: 100,
  offset: Object.freeze({ left: 0, top: 0 }),
  relativesize: Object.freeze({ size: 5, label: "ft" }),
  color: "#ffffff40",
  visible: true,
});

export const BODY_ALLOWANCE = 0.8;

function segmentsCross(a, b, c, d) {
  const cross = (o, p, q) =>
    (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  return (
    ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
    ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
  );
}

function pointToSegment(pt, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = dx * dx + dy * dy;
  const t = length
    ? Math.max(0, Math.min(1, ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / length))
    : 0;
  return Math.hypot(a.x + t * dx - pt.x, a.y + t * dy - pt.y);
}

function segmentDistance(a, b, c, d) {
  if (segmentsCross(a, b, c, d)) return 0;
  return Math.min(
    pointToSegment(a, c, d),
    pointToSegment(b, c, d),
    pointToSegment(c, a, b),
    pointToSegment(d, a, b),
  );
}

function insidePolygonImpl(pt, polygon) {
  if (!pt || !Array.isArray(polygon) || polygon.length < 3) return false;
  let insideFlag = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if (
      a.y > pt.y !== b.y > pt.y &&
      pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x
    ) {
      insideFlag = !insideFlag;
    }
  }
  return insideFlag;
}

function createGridImpl(grid = {}) {
  return {
    ...JSON.parse(JSON.stringify(DEFAULT_GRID)),
    ...grid,
    offset: { ...DEFAULT_GRID.offset, ...grid?.offset },
    relativesize: { ...DEFAULT_GRID.relativesize, ...grid?.relativesize },
  };
}

function createGroundImpl(id = "ground", options = {}) {
  if (id && typeof id === "object") {
    const raw = id;
    return createGroundImpl(raw.id || "ground", raw);
  }
  return {
    id,
    type: "ground",
    name: options.name || "",
    visible: options.visible !== false,
    height: options.height ?? 0,
    image: options.image ?? null,
    alphaMask: options.alphaMask ?? null,
    grid: createGridImpl(options.grid),
    ambient: options.ambient ?? 1,
    gmBrightness: options.gmBrightness ?? 0.6,
    children: options.children || [],
  };
}

function createLayerImpl(id, type, options = {}) {
  if (id && typeof id === "object") {
    const raw = id;
    return createLayerImpl(raw.id || "layer", raw.type, raw);
  }
  const features = LAYER_FEATURES[type];
  if (!features || type === "ground") {
    throw new TypeError("Unknown battle map layer type.");
  }
  return {
    id,
    type,
    name: options.name || "",
    visible: options.visible !== false,
    shape: options.shape ?? null,
    ...(features.alphaMask ? { alphaMask: options.alphaMask ?? null } : {}),
    ...(features.lightMask ? { lightMask: options.lightMask ?? null } : {}),
    items: Array.isArray(options.items) ? [...options.items] : [],
  };
}

function emptyBattleMapImpl(createId = (prefix) => prefix) {
  const idFn =
    typeof createId === "function" ? createId : (prefix) => prefix;
  return {
    size: { width: 2000, height: 1400 },
    movementSnap: "grid",
    placementSnap: "grid",
    fogEnabled: true,
    fog: null,
    layers: [
      createGroundImpl(idFn("ground"), {
        children: ["object", "wall", "token", "light"].map((type) =>
          createLayerImpl(idFn(type), type),
        ),
      }),
    ],
  };
}

function mapSizeImpl(definition) {
  return {
    width: definition?.size?.width ?? definition?.width ?? 2000,
    height: definition?.size?.height ?? definition?.height ?? 1400,
  };
}

function unitsPerPixelImpl(ground) {
  return (
    (ground?.grid?.relativesize?.size ?? DEFAULT_GRID.relativesize.size) /
    (ground?.grid?.size || DEFAULT_GRID.size)
  );
}

function groundsImpl(definition) {
  return (definition?.layers || []).filter((layer) => layer.type === "ground");
}

function activeGroundImpl(definition, id) {
  const listGrounds = groundsImpl(definition);
  return (
    listGrounds.find((ground) => ground.id === id) || listGrounds[0] || null
  );
}

function findLayerImpl(definition, id) {
  if (Array.isArray(definition)) {
    for (let i = 0; i < definition.length; i++) {
      const layer = definition[i];
      if (layer?.id === id) return { layer, siblings: definition, index: i };
      if (Array.isArray(layer?.children)) {
        const nested = findLayerImpl(layer.children, id);
        if (nested) return nested;
      }
    }
    return null;
  }
  for (const ground of groundsImpl(definition)) {
    if (ground.id === id) {
      return { ground, layer: ground, siblings: definition.layers };
    }
    const layer = (ground.children || []).find((child) => child.id === id);
    if (layer) return { ground, layer, siblings: ground.children };
  }
  return null;
}

function itemKindImpl(layer, item = {}) {
  if (layer && LAYER_FEATURES[layer.type]) {
    const kind = ITEM_KINDS[layer.type];
    if (kind !== "wall") return kind;
    return item?.column ? "column" : item?.door ? "door" : "wall";
  }
  const obj = item && Object.keys(item).length ? item : layer || {};
  if (obj.column) return "column";
  if (obj.door) return "door";
  if (obj.a && obj.b) return "wall";
  return "token";
}

function findItemImpl(definition, id) {
  if (id == null) return null;
  for (const ground of groundsImpl(definition)) {
    for (const layer of ground.children || []) {
      const index = (layer.items || []).findIndex((item) => item.id === id);
      if (index >= 0) {
        return {
          ground,
          layer,
          item: layer.items[index],
          index,
          kind: itemKindImpl(layer, layer.items[index]),
        };
      }
    }
  }
  return null;
}

function targetLayerImpl(ground, kind, preferredId = null) {
  const types = LAYER_FOR_ITEM[kind] || [kind];
  const children = ground?.children || [];
  const preferred = children.find((layer) => layer.id === preferredId);
  if (preferred && types.includes(preferred.type)) return preferred;
  for (let index = children.length - 1; index >= 0; index--) {
    if (types.includes(children[index].type)) return children[index];
  }
  return null;
}

function moveLayerImpl(siblings, id, delta) {
  if (!Array.isArray(siblings)) return false;
  const index = siblings.findIndex((layer) => layer.id === id);
  const next = index + delta;
  if (index < 0 || next < 0 || next >= siblings.length) return false;
  if (!Object.isFrozen(siblings)) {
    [siblings[index], siblings[next]] = [siblings[next], siblings[index]];
  }
  return true;
}

function groundStackImpl(definition, groundId) {
  const listGrounds = groundsImpl(definition);
  const active = activeGroundImpl(definition, groundId);
  const index = listGrounds.indexOf(active);
  if (index < 0) return [];
  let low = index;
  while (low > 0 && listGrounds[low].alphaMask) low--;
  return listGrounds.slice(low, index + 1);
}

function roofCoveredByObserver(layer, observers) {
  if (!observers.length) return false;
  if (Array.isArray(layer.shape) && layer.shape.length >= 3) {
    if (observers.some((tok) => insidePolygonImpl(tok, layer.shape))) {
      return true;
    }
  }
  for (const item of layer.items || []) {
    if (item.autoHide === false) continue;
    if (Array.isArray(item.points) && item.points.length >= 3) {
      if (observers.some((tok) => insidePolygonImpl(tok, item.points))) {
        return true;
      }
    } else if (Number(item.width) > 0 && Number(item.height) > 0) {
      const ix = Number(item.x) || 0;
      const iy = Number(item.y) || 0;
      const iw = Number(item.width);
      const ih = Number(item.height);
      if (
        observers.some(
          (tok) =>
            tok.x >= ix &&
            tok.x <= ix + iw &&
            tok.y >= iy &&
            tok.y <= iy + ih,
        )
      ) {
        return true;
      }
    }
  }
  return false;
}

function visibleStackImpl(definition, levelId, tokens = null) {
  const stack = groundStackImpl(definition, levelId);
  const active = activeGroundImpl(definition, levelId);
  const activeId = active?.id ?? levelId;
  return stack
    .filter((ground) => ground.visible !== false)
    .map((ground) => {
      const isTargetLevel = ground.id === levelId || ground.id === activeId;
      const groundTokens = Array.isArray(tokens)
        ? tokens
        : (ground.children || [])
            .filter((l) => l.type === "token" && l.visible !== false)
            .flatMap((l) => l.items || []);
      const observers = groundTokens.filter(
        (t) => t && (t.observer || t.owned),
      );
      return {
        ...ground,
        children: (ground.children || [])
          .filter((layer) => {
            if (layer.visible === false) return false;
            if (!isTargetLevel && layer.type !== "object") return false;
            if (
              isTargetLevel &&
              layer.type === "roof" &&
              roofCoveredByObserver(layer, observers)
            ) {
              return false;
            }
            return true;
          })
          .map((layer) =>
            layer.type === "token" && tokens
              ? {
                  ...layer,
                  items: tokens.filter((token) => token.layer === layer.id),
                }
              : layer,
          ),
      };
    });
}

function battleViewImpl(definition, groundId, { includeHidden = false } = {}) {
  const ground = activeGroundImpl(definition, groundId);
  const shown = (layer) => includeHidden || layer.visible !== false;
  const items = (type) =>
    ground && shown(ground)
      ? (ground.children || [])
          .filter((layer) => layer.type === type && shown(layer))
          .flatMap((layer) =>
            (layer.items || []).map((item) => ({ ...item, layer: layer.id })),
          )
      : [];
  return {
    ground,
    levelId: ground?.id || null,
    grid: ground?.grid,
    scale: unitsPerPixelImpl(ground),
    ambient: ground?.ambient ?? 1,
    gmBrightness: ground?.gmBrightness ?? 0.6,
    tokens: items("token"),
    walls: items("wall"),
    lights: items("light"),
  };
}

function bodyRadiusImpl(size = {}) {
  if (typeof size === "number" && Number.isFinite(size) && size > 0) {
    return (size * BODY_ALLOWANCE) / 2;
  }
  const width = Number(size?.width ?? size?.w) || 0;
  const height = Number(size?.height ?? size?.h ?? width) || 0;
  return (Math.min(width, height) * BODY_ALLOWANCE) / 2;
}

function movementBlockedImpl(walls, from, to, size = {}) {
  if (!Array.isArray(walls) || !from || !to) return false;
  const radius = bodyRadiusImpl(size);
  return walls.some((wall) => {
    if (!wall) return false;
    if ((wall.door || wall.kind === "door") && wall.open) return false;
    if ((wall.column || wall.kind === "column") && (wall.center || wall.x !== undefined) && wall.radius > 0) {
      const center = wall.center || { x: Number(wall.x) || 0, y: Number(wall.y) || 0 };
      const reach = wall.radius + radius;
      if (Math.hypot(from.x - center.x, from.y - center.y) <= reach) {
        return (
          pointToSegment(center, from, to) <
          Math.hypot(from.x - center.x, from.y - center.y) - 1e-9
        );
      }
      return pointToSegment(center, from, to) <= reach;
    }
    const segA =
      wall.a ||
      (wall.x1 !== undefined ? { x: Number(wall.x1) || 0, y: Number(wall.y1) || 0 } : null);
    const segB =
      wall.b ||
      (wall.x2 !== undefined ? { x: Number(wall.x2) || 0, y: Number(wall.y2) || 0 } : null);
    if (!segA || !segB) return false;
    if (radius > 0 && segmentDistance(from, from, segA, segB) <= radius) {
      return segmentsCross(from, to, segA, segB);
    }
    return segmentDistance(from, to, segA, segB) <= radius;
  });
}

function plainStackImpl({ images = [], drawings = [], tokens = [] } = {}) {
  return [
    {
      ...createGroundImpl("plain", {
        grid: { type: "none", size: 5, visible: false },
      }),
      image: null,
      fill: true,
      children: [
        { ...createLayerImpl("plain-images", "object"), items: images },
        { ...createLayerImpl("plain-drawings", "drawing"), items: drawings },
        { ...createLayerImpl("plain-tokens", "token"), items: tokens },
      ],
    },
  ];
}

export default class GeometryTool {
  distance(a, b) {
    return distance(a, b);
  }

  lineOfSight(a, b, walls = []) {
    point(a);
    point(b);
    return !list(walls).some((w) => {
      if (w.open) return false;
      const segA = w.a || { x: Number(w.x1) || 0, y: Number(w.y1) || 0 };
      const segB = w.b || { x: Number(w.x2) || 0, y: Number(w.y2) || 0 };
      return intersects(a, b, segA, segB);
    });
  }

  contains(value, polygon) {
    return inside(value, polygon);
  }

  insidePolygon(value, polygon) {
    return insidePolygonImpl(value, polygon);
  }

  area(polygon) {
    list(polygon);
    return (
      Math.abs(
        polygon.reduce((sum, p, i) => {
          point(p);
          const n = point(polygon[(i + 1) % polygon.length]);
          return sum + p.x * n.y - n.x * p.y;
        }, 0),
      ) / 2
    );
  }

  bodyRadius(size) {
    return bodyRadiusImpl(size);
  }

  movementBlocked(walls, from, to, size) {
    return movementBlockedImpl(walls, from, to, size);
  }

  createGrid(grid = {}) {
    return createGridImpl(grid);
  }

  createGround(id, options = {}) {
    return createGroundImpl(id, options);
  }

  createLayer(id, type, options = {}) {
    return createLayerImpl(id, type, options);
  }

  layerFeatures(type) {
    return LAYER_FEATURES[type] || null;
  }

  emptyBattleMap(createId) {
    return emptyBattleMapImpl(createId);
  }

  grounds(map) {
    return groundsImpl(map);
  }

  activeGround(map, groundId) {
    return activeGroundImpl(map, groundId);
  }

  mapSize(map) {
    return mapSizeImpl(map);
  }

  unitsPerPixel(ground) {
    return unitsPerPixelImpl(ground);
  }

  findLayer(definition, id) {
    return findLayerImpl(definition, id);
  }

  findItem(definition, id) {
    return findItemImpl(definition, id);
  }

  itemKind(layer, item) {
    return itemKindImpl(layer, item);
  }

  targetLayer(ground, kind, preferredId = null) {
    return targetLayerImpl(ground, kind, preferredId);
  }

  moveLayer(siblings, id, delta) {
    return moveLayerImpl(siblings, id, delta);
  }

  groundStack(map, groundId) {
    return groundStackImpl(map, groundId);
  }

  visibleStack(map, groundId, tokens = null) {
    return visibleStackImpl(map, groundId, tokens);
  }

  battleView(map, groundId, options = {}) {
    return battleViewImpl(map, groundId, options);
  }

  plainStack(options = {}) {
    return plainStackImpl(options);
  }
}
