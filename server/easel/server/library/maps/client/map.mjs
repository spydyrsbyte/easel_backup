import { Base } from "./base.mjs";
import { element as el, safeImage } from "./safe.mjs";
import { base64ToBytes, bytesToBase64, packMap, unpackMap } from "./archive.mjs";

let boundEasel = null;

export function initialize({ Easel }) {
  boundEasel = Easel;
}

function getPixi() {
  const host = boundEasel || globalThis.Easel;
  return host?.Interfaces?.create("easel.graphics.pixi@1") || null;
}

const BODY_ALLOWANCE = 0.8;

function bodyRadius(size) {
  if (typeof size === "number" && Number.isFinite(size) && size > 0) {
    return size * 0.5 * BODY_ALLOWANCE;
  }
  const w = Number(size?.w ?? size?.width ?? 0);
  const h = Number(size?.h ?? size?.height ?? w);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return 0;
  return Math.min(w, h) * 0.5 * BODY_ALLOWANCE;
}

function pointToSegmentDistance(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq <= 1e-12) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function segmentsIntersect(ax, ay, bx, by, cx, cy, dx, dy) {
  const cross = (ox, oy, px, py, qx, qy) =>
    (px - ox) * (qy - oy) - (py - oy) * (qx - ox);
  const d1 = cross(cx, cy, dx, dy, ax, ay);
  const d2 = cross(cx, cy, dx, dy, bx, by);
  const d3 = cross(ax, ay, bx, by, cx, cy);
  const d4 = cross(ax, ay, bx, by, dx, dy);
  return (
    ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
    ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
  );
}

function segmentToSegmentDistance(ax, ay, bx, by, cx, cy, dx, dy) {
  if (segmentsIntersect(ax, ay, bx, by, cx, cy, dx, dy)) return 0;
  return Math.min(
    pointToSegmentDistance(ax, ay, cx, cy, dx, dy),
    pointToSegmentDistance(bx, by, cx, cy, dx, dy),
    pointToSegmentDistance(cx, cy, ax, ay, bx, by),
    pointToSegmentDistance(dx, dy, ax, ay, bx, by),
  );
}

function checkMovementBlocked(walls, from, to, size) {
  if (!Array.isArray(walls) || !from || !to) return false;
  const ax = Number(from.x) || 0;
  const ay = Number(from.y) || 0;
  const bx = Number(to.x) || 0;
  const by = Number(to.y) || 0;
  const radius = bodyRadius(size);
  for (const w of walls) {
    if (!w) continue;
    if ((w.kind === "door" || w.door) && w.open) continue;
    if ((w.kind === "column" || w.column) && (w.center || w.x !== undefined) && Number(w.radius) > 0) {
      const cx = Number(w.center?.x ?? w.x) || 0;
      const cy = Number(w.center?.y ?? w.y) || 0;
      const colRadius = Number(w.radius) || 1;
      const reach = colRadius + radius;
      const startDist = Math.hypot(ax - cx, ay - cy);
      if (startDist <= reach) {
        if (pointToSegmentDistance(cx, cy, ax, ay, bx, by) < startDist - 1e-9) {
          return true;
        }
        continue;
      }
      if (pointToSegmentDistance(cx, cy, ax, ay, bx, by) <= reach) return true;
      continue;
    }
    const x1 = Number(w.a?.x ?? w.x1) || 0;
    const y1 = Number(w.a?.y ?? w.y1) || 0;
    const x2 = Number(w.b?.x ?? w.x2) || 0;
    const y2 = Number(w.b?.y ?? w.y2) || 0;
    if (radius > 0 && segmentToSegmentDistance(ax, ay, ax, ay, x1, y1, x2, y2) <= radius) {
      if (segmentsIntersect(ax, ay, bx, by, x1, y1, x2, y2)) return true;
      continue;
    }
    if (segmentToSegmentDistance(ax, ay, bx, by, x1, y1, x2, y2) <= radius) return true;
  }
  return false;
}

function insidePolygon(pt, polygon) {
  if (!pt || !Array.isArray(polygon) || polygon.length < 3) return false;
  let flag = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = Number(polygon[i].x) || 0;
    const yi = Number(polygon[i].y) || 0;
    const xj = Number(polygon[j].x) || 0;
    const yj = Number(polygon[j].y) || 0;
    if (
      yi > pt.y !== yj > pt.y &&
      pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi || 1e-12) + xi
    ) {
      flag = !flag;
    }
  }
  return flag;
}

function computeObserverPolygon(observer, walls = [], maxRange = 1600) {
  const ox = Number(observer.x ?? observer.position?.x) || 0;
  const oy = Number(observer.y ?? observer.position?.y) || 0;
  const range = Math.max(10, Number(maxRange) || 1600);
  const fov = Number.isFinite(observer.fov) ? Math.min(360, Math.max(1, observer.fov)) : 360;
  const facing = Number(observer.facing) || 0;
  const closed = [];
  for (const w of walls || []) {
    if (!w || ((w.door || w.kind === "door") && w.open)) continue;
    if ((w.column || w.kind === "column") && (w.center || w.x !== undefined) && Number(w.radius) > 0) {
      const cx = Number(w.center?.x ?? w.x) || 0;
      const cy = Number(w.center?.y ?? w.y) || 0;
      const r = Number(w.radius) || 1;
      for (let i = 0; i < 8; i++) {
        const a0 = (i / 8) * Math.PI * 2;
        const a1 = ((i + 1) / 8) * Math.PI * 2;
        closed.push({
          a: { x: cx + Math.cos(a0) * r, y: cy + Math.sin(a0) * r },
          b: { x: cx + Math.cos(a1) * r, y: cy + Math.sin(a1) * r },
        });
      }
      continue;
    }
    const ax = Number(w.a?.x ?? w.x1);
    const ay = Number(w.a?.y ?? w.y1);
    const bx = Number(w.b?.x ?? w.x2);
    const by = Number(w.b?.y ?? w.y2);
    if (Number.isFinite(ax) && Number.isFinite(ay) && Number.isFinite(bx) && Number.isFinite(by)) {
      closed.push({ a: { x: ax, y: ay }, b: { x: bx, y: by } });
    }
  }
  const rays = 48;
  const start = ((facing - fov / 2) * Math.PI) / 180;
  const span = (fov * Math.PI) / 180;
  const relAngle = (ang) => (((ang - start) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const angles = Array.from({ length: rays + (fov < 360 ? 1 : 0) }, (_, i) => (i * span) / rays);
  for (const seg of closed) {
    for (const pt of [seg.a, seg.b]) {
      for (const delta of [-1e-7, 0, 1e-7]) {
        const a = relAngle(Math.atan2(pt.y - oy, pt.x - ox) + delta);
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
    for (const seg of closed) {
      const sx = seg.b.x - seg.a.x;
      const sy = seg.b.y - seg.a.y;
      const den = dx * sy - dy * sx;
      if (Math.abs(den) < 1e-12) continue;
      const rx = seg.a.x - ox;
      const ry = seg.a.y - oy;
      const t = (rx * sy - ry * sx) / den;
      const u = (rx * dy - ry * dx) / den;
      if (t >= 0 && t < len && u >= 0 && u <= 1) len = t;
    }
    return { x: ox + dx * len, y: oy + dy * len };
  });
  return fov < 360 ? [{ x: ox, y: oy }, ...pts, { x: ox, y: oy }] : pts;
}

export default class Map extends Base {
  constructor() {
    super("easel.maps.map", ["objects", "overlay"]);
    this.pixi = getPixi();
    this.canvasHost = el("div", "kit-map-canvas");
    this.canvasHost.style.position = "absolute";
    this.canvasHost.style.inset = "0";
    this.canvasHost.style.pointerEvents = "none";
    this.calibrationPoints = [];
    this.dragPreview = null;
    this.exploredFogCanvas = null;
    this.exploredFogTexture = null;
    this.roofAlpha = 1;
    this.app = null;
    this.element.style.height = "100%";
    this.element.style.position = "relative";
    this.element.style.minHeight = "0";
    this.content.style.height = "100%";
    this.content.style.minHeight = "0";
    this.content.style.display = "flex";
    this.content.style.flexDirection = "column";
    this.resizeObserver = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width <= 0 || height <= 0 || this.life.signal.aborted) return;
      this.viewportSize = { width, height };
      this.#ensureApp(width, height);
      this.#renderPixi(this.props);
    });

    if (this.pixi) {
      const { Container, Graphics, Sprite } = this.pixi;
      this.worldContainer = new Container();
      this.lowerGroundsContainer = new Container();
      this.activeGroundContainer = new Container();
      this.groundSprite = new Sprite();
      this.gridGraphics = new Graphics();
      this.objectLayerContainer = new Container();
      this.drawingLayerContainer = new Container();
      this.tokenLayerContainer = new Container();
      this.ghostPreviewGraphics = new Graphics();
      this.roofLayerContainer = new Container();
      this.lightingAndFogContainer = new Container();
      this.wallControlsContainer = new Container();
      this.templatesAndRulerContainer = new Container();

      this.activeGroundContainer.addChild(
        this.groundSprite,
        this.gridGraphics,
        this.objectLayerContainer,
        this.drawingLayerContainer,
        this.tokenLayerContainer,
        this.roofLayerContainer,
        this.lightingAndFogContainer,
        this.wallControlsContainer,
        this.templatesAndRulerContainer,
      );
      this.worldContainer.addChild(
        this.lowerGroundsContainer,
        this.activeGroundContainer,
      );
    }
  }

  #ensureApp(width, height) {
    if (!this.pixi) return;
    const { Application, RenderTexture } = this.pixi;
    if (!this.exploredFogTexture && RenderTexture?.create) {
      try {
        this.exploredFogTexture = RenderTexture.create({
          width: Math.max(2, Math.min(512, Math.round(width / 4))),
          height: Math.max(2, Math.min(512, Math.round(height / 4))),
        });
      } catch {}
    }
    if (!this.app) {
      this.app = new Application();
      this.boot = this.app
        .init({
          width: Math.max(1, width),
          height: Math.max(1, height),
          backgroundAlpha: 0,
          antialias: true,
        })
        .then(() => {
          if (this.life.signal.aborted || !this.app?.canvas) return;
          const size = this.viewportSize || { width, height };
          this.app.renderer.resize(Math.max(1, size.width), Math.max(1, size.height));
          this.app.stage.addChild(this.worldContainer);
          this.canvasHost.replaceChildren(this.app.canvas);
          this.#syncWorldTransform();
          this.#renderPixi(this.props);
        })
        .catch(() => {});
    } else if (this.app.renderer) {
      this.app.renderer.resize(Math.max(1, width), Math.max(1, height));
    }
  }

  #syncWorldTransform() {
    if (!this.worldContainer || !this.camera) return;
    this.worldContainer.x = this.camera.x;
    this.worldContainer.y = this.camera.y;
    this.worldContainer.scale.set(this.camera.zoom, this.camera.zoom);
    this.worldContainer.rotation = (this.camera.rotation * Math.PI) / 180;
  }

  #resolveSceneData(p) {
    const d = p.data && typeof p.data === "object" ? p.data : {};
    const rawLayers = Array.isArray(p.layers) && p.layers.length
      ? p.layers
      : Array.isArray(d.layers)
        ? d.layers
        : [];
    const groundLayers = rawLayers.filter((l) => l && l.type === "ground");
    const activeGroundId =
      p.activeGroundId || d.levelId || d.activeGroundId || (groundLayers[groundLayers.length - 1]?.id ?? "");
    const activeGround =
      groundLayers.find((g) => g.id === activeGroundId) ||
      groundLayers[groundLayers.length - 1] ||
      groundLayers[0] ||
      null;

    let groundStack = [];
    if (activeGround) {
      const idx = groundLayers.indexOf(activeGround);
      let low = idx;
      while (low > 0 && groundLayers[low].alphaMask) low--;
      groundStack = groundLayers.slice(low, idx + 1);
    } else if (Array.isArray(p.grounds) && p.grounds.length) {
      groundStack = p.grounds;
    } else if (Array.isArray(d.grounds) && d.grounds.length) {
      groundStack = d.grounds;
    }

    const shown = (layer) => Boolean(p.gm) || layer?.visible !== false;
    const childLayersOf = (ground, type) =>
      ground && shown(ground)
        ? (ground.children || []).filter((l) => l && l.type === type && shown(l))
        : [];
    const childItemsOf = (ground, type) =>
      childLayersOf(ground, type).flatMap((l) =>
        (l.items || []).map((item) => ({ ...item, layer: l.id })),
      );

    const activeGrid = activeGround?.grid || {};
    const mergedGrid = {
      type: "square",
      size: 100,
      offset: { left: 0, top: 0 },
      offsetX: 0,
      offsetY: 0,
      cellSize: 64,
      scale: 5,
      unit: "ft",
      snap: true,
      visible: true,
      color: 0xffffff,
      alpha: 0.18,
      calibrated: false,
      ...(d.grid || {}),
      ...activeGrid,
      ...(p.grid || {}),
    };
    const effectiveCellSize =
      Number(p.grid?.cellSize && p.grid.cellSize !== 64 ? p.grid.cellSize : 0) ||
      Number(p.grid?.size && p.grid.size !== 100 ? p.grid.size : 0) ||
      Number(activeGrid.size || activeGrid.cellSize || d.grid?.size || d.grid?.cellSize || p.grid?.cellSize || 64);
    const effectiveOffsetX =
      Number(p.grid?.offsetX || p.grid?.offset?.left || activeGrid.offset?.left || activeGrid.offsetX || d.grid?.offset?.left || d.grid?.offsetX || 0);
    const effectiveOffsetY =
      Number(p.grid?.offsetY || p.grid?.offset?.top || activeGrid.offset?.top || activeGrid.offsetY || d.grid?.offset?.top || d.grid?.offsetY || 0);
    const effectiveScale =
      Number(activeGrid.relativesize?.size ?? d.grid?.relativesize?.size ?? mergedGrid.scale ?? 5) || 5;
    const grid = {
      ...mergedGrid,
      size: effectiveCellSize,
      cellSize: effectiveCellSize,
      offset: { left: effectiveOffsetX, top: effectiveOffsetY },
      offsetX: effectiveOffsetX,
      offsetY: effectiveOffsetY,
      scale: effectiveScale,
    };

    const objects = [
      ...childItemsOf(activeGround, "object"),
      ...(Array.isArray(d.objects) ? d.objects : []),
    ];
    const tokens =
      Array.isArray(p.tokens) && p.tokens.length
        ? p.tokens
        : Array.isArray(p.items) && p.items.length
          ? p.items
          : Array.isArray(d.tokens) && d.tokens.length
            ? d.tokens
            : childItemsOf(activeGround, "token");
    const walls =
      Array.isArray(p.walls) && p.walls.length
        ? p.walls
        : Array.isArray(d.walls) && d.walls.length
          ? d.walls
          : childItemsOf(activeGround, "wall");
    const lights =
      Array.isArray(p.lights) && p.lights.length
        ? p.lights
        : Array.isArray(d.lights) && d.lights.length
          ? d.lights
          : childItemsOf(activeGround, "light");
    const drawings =
      Array.isArray(p.drawings) && p.drawings.length
        ? p.drawings
        : Array.isArray(d.drawings) && d.drawings.length
          ? d.drawings
          : childItemsOf(activeGround, "drawing");
    const roofLayers = childLayersOf(activeGround, "roof");
    const roofs = [
      ...(Array.isArray(p.roofs) && p.roofs.length ? p.roofs : d.roofs || []),
      ...roofLayers.flatMap((l) => {
        if (Array.isArray(l.shape) && l.shape.length >= 3) {
          return [{ id: l.id, points: l.shape, alphaMask: l.alphaMask || null, items: l.items || [] }];
        }
        return (l.items || []).map((item) => ({
          ...item,
          alphaMask: item.alphaMask || l.alphaMask || null,
        }));
      }),
    ];
    const templates =
      Array.isArray(p.templates) && p.templates.length ? p.templates : d.templates || [];
    const visionMask =
      p.visionMask && Object.keys(p.visionMask).length ? p.visionMask : d.visionMask || null;
    const visionPolygons =
      Array.isArray(p.visionPolygons) && p.visionPolygons.length
        ? p.visionPolygons
        : Array.isArray(d.visionPolygons)
          ? d.visionPolygons
          : [];
    const lightSources =
      Array.isArray(p.lightSources) && p.lightSources.length
        ? p.lightSources
        : Array.isArray(d.lightSources)
          ? d.lightSources
          : [];

    return {
      activeGround,
      activeGroundId: activeGround?.id || activeGroundId || "ground",
      groundStack,
      grid,
      objects,
      tokens,
      walls,
      lights,
      drawings,
      roofs,
      templates,
      visionMask,
      visionPolygons,
      lightSources,
    };
  }

  #drawGrid(grid, width, height) {
    this.gridGraphics.clear();
    if (grid.visible === false || grid.type === "none" || grid.type === "hidden") return;
    const cellSize = Math.max(8, Number(grid.cellSize || grid.size) || 64);
    const ox = ((Number(grid.offsetX ?? grid.offset?.left) || 0) % cellSize + cellSize) % cellSize;
    const oy = ((Number(grid.offsetY ?? grid.offset?.top) || 0) % cellSize + cellSize) % cellSize;
    const color =
      typeof grid.color === "string"
        ? Number.parseInt(grid.color.replace(/^#/, "").slice(0, 6), 16) || 0xffffff
        : Number.isFinite(Number(grid.color))
          ? Number(grid.color)
          : 0xffffff;
    const alpha = Number.isFinite(Number(grid.alpha))
      ? Math.max(0, Math.min(1, Number(grid.alpha)))
      : 0.18;

    if (grid.type === "hex-flat" || grid.type === "hex-pointy") {
      const r = cellSize / 2;
      const pointy = grid.type === "hex-pointy";
      const dx = pointy ? Math.sqrt(3) * r : 1.5 * r;
      const dy = pointy ? 1.5 * r : Math.sqrt(3) * r;
      for (let row = -1; row * dy <= height + cellSize; row++) {
        for (let col = -1; col * dx <= width + cellSize; col++) {
          const cx = ox + col * dx + (pointy && row % 2 !== 0 ? dx / 2 : 0);
          const cy = oy + row * dy + (!pointy && col % 2 !== 0 ? dy / 2 : 0);
          const pts = [];
          for (let i = 0; i < 6; i++) {
            const ang = ((60 * i - (pointy ? 30 : 0)) * Math.PI) / 180;
            pts.push(cx + r * Math.cos(ang), cy + r * Math.sin(ang));
          }
          this.gridGraphics.poly(pts);
        }
      }
      this.gridGraphics.stroke({ color, width: 1, alpha });
      return;
    }

    for (let x = ox; x <= width; x += cellSize) {
      this.gridGraphics.moveTo(x, 0).lineTo(x, height);
    }
    for (let y = oy; y <= height; y += cellSize) {
      this.gridGraphics.moveTo(0, y).lineTo(width, y);
    }
    this.gridGraphics.stroke({ color, width: 1, alpha });
  }

  #renderPixi(p) {
    if (!this.pixi || !this.worldContainer) return;
    const { Container, Graphics, Text, Sprite, Texture, BlurFilter, ColorMatrixFilter } = this.pixi;
    const width = Math.max(1, Number(p.width) || 1000);
    const height = Math.max(1, Number(p.height) || 700);
    const scene = this.#resolveSceneData(p);

    const background = safeImage(scene.activeGround?.image || p.data?.image || "");
    this.groundSprite.width = width;
    this.groundSprite.height = height;
    if (background !== this.backgroundSource) {
      this.backgroundSource = background;
      this.groundSprite.visible = false;
      if (background) this.pixi.Assets.load(background).then((texture) => {
        if (this.life.signal.aborted || this.backgroundSource !== background) return;
        this.groundSprite.texture = texture;
        this.groundSprite.width = width;
        this.groundSprite.height = height;
        this.groundSprite.visible = true;
      }).catch((error) => {
        if (!this.life.signal.aborted && this.backgroundSource === background) this.emit("resourceError", { message: "Unable to load the map background: " + error.message });
      });
    }

    this.lowerGroundsContainer.removeChildren();
    this.objectLayerContainer.removeChildren();
    this.drawingLayerContainer.removeChildren();
    this.tokenLayerContainer.removeChildren();
    this.roofLayerContainer.removeChildren();
    this.lightingAndFogContainer.removeChildren();
    this.wallControlsContainer.removeChildren();
    this.templatesAndRulerContainer.removeChildren();

    if (scene.groundStack.length > 1) {
      for (let i = 0; i < scene.groundStack.length - 1; i++) {
        const g = scene.groundStack[i];
        const lowerContainer = new Container();
        const depthAlpha = Math.max(0.3, 1 - (scene.groundStack.length - 1 - i) * 0.2);
        const lowerBg = new Graphics();
        lowerBg
          .rect(0, 0, Number(g.width) || width, Number(g.height) || height)
          .fill({ color: 0x161b22, alpha: depthAlpha });
        lowerContainer.addChild(lowerBg);

        const lowerObjects = (g.children || [])
          .filter((l) => l && l.type === "object" && l.visible !== false)
          .flatMap((l) => l.items || []);
        for (const obj of lowerObjects) {
          const og = new Graphics();
          og.rect(
            Number(obj.x) || 0,
            Number(obj.y) || 0,
            Number(obj.width) || 64,
            Number(obj.height) || 64,
          ).fill({ color: Number(obj.color ?? 0x3b4856), alpha: Number(obj.opacity ?? 0.85) });
          lowerContainer.addChild(og);
        }
        if (ColorMatrixFilter) {
          const depthFilter = new ColorMatrixFilter();
          depthFilter.brightness(0.65, false);
          lowerContainer.filters = [depthFilter];
        }
        this.lowerGroundsContainer.addChild(lowerContainer);
      }
    }

    this.#drawGrid(scene.grid, width, height);

    for (const obj of scene.objects) {
      const ox = Number(obj.x) || 0;
      const oy = Number(obj.y) || 0;
      const ow = Number(obj.width ?? obj.w) || scene.grid.cellSize || 64;
      const oh = Number(obj.height ?? obj.h) || ow;
      const og = new Graphics();
      og.rect(ox, oy, ow, oh)
        .fill({ color: Number(obj.color ?? 0x425264), alpha: Number(obj.opacity ?? 0.9) })
        .stroke({ color: 0x1f2630, width: 1 });
      this.objectLayerContainer.addChild(og);
    }

    const drawGraphics = new Graphics();
    for (const d of scene.drawings) {
      const pts = (d.points || []).flatMap((pt) => [Number(pt.x) || 0, Number(pt.y) || 0]);
      if (pts.length >= 6) {
        drawGraphics
          .poly(pts)
          .fill({ color: Number(d.fill ?? 0x4a90e2), alpha: Number(d.alpha ?? 0.35) })
          .stroke({ color: Number(d.stroke ?? d.color ?? 0x4a90e2), width: Number(d.strokeWidth ?? 2) });
      } else if (pts.length >= 4) {
        drawGraphics.moveTo(pts[0], pts[1]);
        for (let i = 2; i < pts.length; i += 2) drawGraphics.lineTo(pts[i], pts[i + 1]);
        drawGraphics.stroke({ color: Number(d.stroke ?? d.color ?? 0x4a90e2), width: Number(d.strokeWidth ?? 2) });
      }
    }
    this.drawingLayerContainer.addChild(drawGraphics);

    for (const tok of scene.tokens) {
      const tx = Number(tok.x ?? tok.position?.x) || 0;
      const ty = Number(tok.y ?? tok.position?.y) || 0;
      const tw = Number(tok.w ?? tok.width ?? tok.size?.w ?? tok.size?.width ?? scene.grid.cellSize) || 64;
      const th = Number(tok.h ?? tok.height ?? tok.size?.h ?? tok.size?.height ?? tw) || tw;
      const radius = Math.min(tw, th) * 0.42;
      const opacity = Number(tok.presentation?.opacity ?? tok.opacity ?? 1);
      if (opacity <= 0 && !p.gm) continue;

      const tokContainer = new Container();
      const g = new Graphics();
      const isSelected = p.selectedTokenId && String(tok.id) === String(p.selectedTokenId);
      g.circle(tx, ty, radius)
        .fill({ color: Number(tok.color ?? 0xd6ae65), alpha: Math.max(0.15, Math.min(1, opacity)) })
        .stroke({
          color: isSelected ? 0xffffff : 0x15191f,
          width: isSelected ? 3 : 1.5,
        });
      tokContainer.addChild(g);

      const hpCurrent = Number(tok.hp?.current ?? tok.hp);
      const hpMax = Number(tok.hp?.max ?? tok.maxHp);
      if (Number.isFinite(hpCurrent) && Number.isFinite(hpMax) && hpMax > 0) {
        const ratio = Math.max(0, Math.min(1, hpCurrent / hpMax));
        const barW = radius * 1.8;
        const barH = 5;
        const barX = tx - barW / 2;
        const barY = ty - radius - 8;
        const hpBar = new Graphics();
        hpBar
          .rect(barX, barY, barW, barH)
          .fill({ color: 0x1a1f26, alpha: 0.85 })
          .rect(barX, barY, barW * ratio, barH)
          .fill({ color: ratio > 0.5 ? 0x52c41a : ratio > 0.25 ? 0xfaad14 : 0xd9534f, alpha: 0.95 });
        tokContainer.addChild(hpBar);
      }

      const conditions = Array.isArray(tok.conditions)
        ? tok.conditions
        : Array.isArray(tok.statuses)
          ? tok.statuses
          : [];
      if (conditions.length > 0) {
        const badgeGraphics = new Graphics();
        conditions.slice(0, 4).forEach((cond, idx) => {
          const bx = tx + radius * 0.65;
          const by = ty - radius * 0.65 + idx * 10;
          badgeGraphics
            .circle(bx, by, 4)
            .fill({ color: Number(cond?.color ?? 0xe056fd), alpha: 0.95 })
            .stroke({ color: 0x11151c, width: 1 });
        });
        tokContainer.addChild(badgeGraphics);
      }

      if ((tok.name || tok.label) && Text) {
        const label = new Text({
          text: String(tok.name || tok.label),
          style: { fontSize: 11, fill: 0xffffff },
        });
        label.x = tx - radius;
        label.y = ty + radius + 2;
        tokContainer.addChild(label);
      }
      this.tokenLayerContainer.addChild(tokContainer);
    }

    this.ghostPreviewGraphics.clear();
    if (this.dragPreview) {
      const { from, to, size, blocked } = this.dragPreview;
      const ghostRadius = Math.max(8, bodyRadius(size));
      const highlightColor = blocked ? 0xd9534f : 0x52c41a;
      this.ghostPreviewGraphics
        .moveTo(from.x, from.y)
        .lineTo(to.x, to.y)
        .stroke({ color: highlightColor, width: 2, alpha: 0.85 })
        .circle(to.x, to.y, ghostRadius)
        .fill({ color: highlightColor, alpha: 0.32 })
        .stroke({ color: highlightColor, width: 2.5, alpha: 0.95 });
    }
    this.tokenLayerContainer.addChild(this.ghostPreviewGraphics);

    const observers = scene.tokens.filter((t) => t && (t.observer || t.owned || p.selectedTokenId === String(t.id)));
    const observerList = observers.length ? observers : scene.tokens;
    const roofGraphics = new Graphics();
    let anyRoofCovered = false;
    for (const roof of scene.roofs) {
      const pts = Array.isArray(roof.points)
        ? roof.points
        : Array.isArray(roof.shape)
          ? roof.shape
          : Number(roof.width) > 0 && Number(roof.height) > 0
            ? [
                { x: Number(roof.x) || 0, y: Number(roof.y) || 0 },
                { x: (Number(roof.x) || 0) + Number(roof.width), y: Number(roof.y) || 0 },
                { x: (Number(roof.x) || 0) + Number(roof.width), y: (Number(roof.y) || 0) + Number(roof.height) },
                { x: Number(roof.x) || 0, y: (Number(roof.y) || 0) + Number(roof.height) },
              ]
            : [];
      if (pts.length < 3) continue;
      const covered =
        roof.hidden ||
        (roof.autoHide !== false &&
          observerList.some((t) =>
            insidePolygon(
              { x: Number(t.x ?? t.position?.x) || 0, y: Number(t.y ?? t.position?.y) || 0 },
              pts,
            ),
          ));
      if (covered) anyRoofCovered = true;
      if (covered && !p.gm) continue;
      const flat = pts.flatMap((pt) => [Number(pt.x) || 0, Number(pt.y) || 0]);
      roofGraphics
        .poly(flat)
        .fill({ color: Number(roof.color ?? 0x3b2f2f), alpha: covered ? 0.25 : 0.9 });
    }
    const targetRoofAlpha = anyRoofCovered ? (p.gm ? 0.25 : 0) : 1;
    this.roofAlpha += (targetRoofAlpha - this.roofAlpha) * 0.5;
    this.roofLayerContainer.alpha = Math.abs(this.roofAlpha - targetRoofAlpha) < 0.05 ? targetRoofAlpha : this.roofAlpha;
    this.roofLayerContainer.addChild(roofGraphics);

    const lightGraphics = new Graphics();
    for (const light of scene.lights) {
      if (light.enabled === false) continue;
      const lx = Number(light.x ?? light.position?.x) || 0;
      const ly = Number(light.y ?? light.position?.y) || 0;
      const r = Number(light.dim ?? light.bright ?? light.radius ?? 120) || 120;
      lightGraphics.circle(lx, ly, r).fill({ color: Number(light.color ?? 0xffe4a0), alpha: 0.14 });
    }
    this.lightingAndFogContainer.addChild(lightGraphics);

    const polygonsToRender =
      scene.visionPolygons.length > 0
        ? scene.visionPolygons
        : observerList
            .filter((t) => t.observer || t.owned)
            .map((obs) => ({
              observerId: obs.id,
              saturation: obs.vision?.transformation?.saturation ?? 1,
              polygon: computeObserverPolygon(obs, scene.walls, Math.hypot(width, height)),
            }));

    for (const vp of polygonsToRender) {
      if (!Array.isArray(vp.polygon) || vp.polygon.length < 3) continue;
      const polyGraphics = new Graphics();
      const flat = vp.polygon.flatMap((pt) => [Number(pt.x) || 0, Number(pt.y) || 0]);
      polyGraphics.poly(flat).fill({ color: 0xffffff, alpha: 0.06 });
      if (vp.saturation === 0 && ColorMatrixFilter) {
        const dvFilter = new ColorMatrixFilter();
        dvFilter.desaturate();
        polyGraphics.filters = [dvFilter];
      }
      this.lightingAndFogContainer.addChild(polyGraphics);
    }

    if (scene.visionMask && Number(scene.visionMask.width) > 0 && scene.visionMask.rgba) {
      const mw = Math.max(1, Math.trunc(Number(scene.visionMask.width)));
      const mh = Math.max(1, Math.trunc(Number(scene.visionMask.height)));
      const raw = base64ToBytes(scene.visionMask.rgba);
      if (typeof document !== "undefined" && typeof document.createElement === "function") {
        const canvas = document.createElement("canvas");
        canvas.width = mw;
        canvas.height = mh;
        const ctx = typeof canvas.getContext === "function" ? canvas.getContext("2d") : null;
        if (ctx && typeof ctx.createImageData === "function") {
          if (!this.exploredFogCanvas || this.exploredFogCanvas.width !== mw || this.exploredFogCanvas.height !== mh) {
            this.exploredFogCanvas = document.createElement("canvas");
            this.exploredFogCanvas.width = mw;
            this.exploredFogCanvas.height = mh;
          }
          const expCtx = this.exploredFogCanvas.getContext?.("2d");
          const expData = expCtx?.getImageData ? expCtx.getImageData(0, 0, mw, mh) : null;
          const imgData = ctx.createImageData(mw, mh);
          const fogAlpha = p.gm ? 0.45 : 0.92;
          let hasDarkvision = false;
          for (let i = 0; i < mw * mh; i++) {
            const offset = i * 4;
            const detail = raw[offset] ?? 0;
            const desat = raw[offset + 1] ?? 0;
            if (desat > 128) hasDarkvision = true;
            const previouslyExplored = expData ? expData.data[offset] : 0;
            const nowExplored = Math.max(previouslyExplored, detail);
            if (expData) {
              expData.data[offset] = nowExplored;
              expData.data[offset + 3] = 255;
            }
            const unexploredFactor = detail > 0 ? 255 - detail : nowExplored > 0 ? 165 : 255;
            imgData.data[offset] = 8;
            imgData.data[offset + 1] = 13;
            imgData.data[offset + 2] = 20;
            imgData.data[offset + 3] = Math.round(unexploredFactor * fogAlpha);
          }
          if (expCtx && expData) expCtx.putImageData(expData, 0, 0);
          ctx.putImageData(imgData, 0, 0);
          if (Sprite && Texture?.from) {
            let tex = Texture.WHITE;
            try {
              tex = Texture.from(canvas);
            } catch {
              tex = Texture.WHITE;
            }
            const fogSprite = new Sprite(tex);
            fogSprite.width = width;
            fogSprite.height = height;
            const filters = [];
            if (BlurFilter) filters.push(new BlurFilter({ strength: 2 }));
            if (hasDarkvision && ColorMatrixFilter) {
              const dv = new ColorMatrixFilter();
              dv.desaturate();
              filters.push(dv);
            }
            if (filters.length) fogSprite.filters = filters;
            this.lightingAndFogContainer.addChild(fogSprite);
          }
        }
      }
    }

    const wallGraphics = new Graphics();
    for (const w of scene.walls) {
      if (w.kind === "column" || w.column) {
        const cx = Number(w.center?.x ?? w.x) || 0;
        const cy = Number(w.center?.y ?? w.y) || 0;
        const cr = Math.max(4, Number(w.radius) || 20);
        wallGraphics.circle(cx, cy, cr).fill({ color: 0x8b95a5, alpha: 0.7 });
        continue;
      }
      const x1 = Number(w.a?.x ?? w.x1) || 0;
      const y1 = Number(w.a?.y ?? w.y1) || 0;
      const x2 = Number(w.b?.x ?? w.x2) || 0;
      const y2 = Number(w.b?.y ?? w.y2) || 0;
      const isDoor = w.kind === "door" || w.door;
      const color = isDoor ? (w.open ? 0x52c41a : 0xfaad14) : 0xd9534f;
      if (p.gm || isDoor) {
        wallGraphics
          .moveTo(x1, y1)
          .lineTo(x2, y2)
          .stroke({ color, width: isDoor ? 4 : 2, alpha: 0.85 });
      }
    }
    this.wallControlsContainer.addChild(wallGraphics);

    const tplGraphics = new Graphics();
    for (const tpl of scene.templates) {
      const ox = Number(tpl.origin?.x ?? tpl.x) || 0;
      const oy = Number(tpl.origin?.y ?? tpl.y) || 0;
      const r = Number(tpl.radius ?? tpl.length ?? 64) || 64;
      tplGraphics
        .circle(ox, oy, r)
        .fill({ color: Number(tpl.color ?? 0xe07a38), alpha: 0.25 })
        .stroke({ color: Number(tpl.color ?? 0xe07a38), width: 2, alpha: 0.75 });
    }
    this.templatesAndRulerContainer.addChild(tplGraphics);
  }

  calibrateClick(worldPoint) {
    this.calibrationPoints.push({ x: Number(worldPoint.x) || 0, y: Number(worldPoint.y) || 0 });
    if (this.calibrationPoints.length >= 2) {
      const [p1, p2] = this.calibrationPoints.splice(0, 2);
      const dx = Math.abs(p2.x - p1.x);
      const dy = Math.abs(p2.y - p1.y);
      const cellSize = Math.max(8, Math.round(Math.max(dx, dy)));
      const offsetX = Math.round(((Math.min(p1.x, p2.x) % cellSize) + cellSize) % cellSize);
      const offsetY = Math.round(((Math.min(p1.y, p2.y) % cellSize) + cellSize) % cellSize);
      const offset = { left: offsetX, top: offsetY };
      const scene = this.#resolveSceneData(this.props);
      const nextGrid = {
        ...scene.grid,
        size: cellSize,
        cellSize,
        offset,
        offsetX,
        offsetY,
        calibrated: true,
      };
      this.emit("gridCalibrated", { size: cellSize, offset, grid: nextGrid });
      return nextGrid;
    }
    return null;
  }

  toggleDoor(doorId) {
    const scene = this.#resolveSceneData(this.props);
    const door = scene.walls.find(
      (w) => String(w.id) === String(doorId) && (w.kind === "door" || w.door),
    );
    const nextOpen = door ? !door.open : true;
    const idStr = String(doorId);
    this.emit("doorToggleRequest", { id: idStr, wallId: idStr, open: nextOpen });
    return nextOpen;
  }

  requestTokenMove(tokenId, toPoint, groundId = undefined) {
    const scene = this.#resolveSceneData(this.props);
    const token = scene.tokens.find((t) => String(t.id) === String(tokenId));
    const from = token
      ? { x: Number(token.x ?? token.position?.x) || 0, y: Number(token.y ?? token.position?.y) || 0 }
      : { x: 0, y: 0 };
    const to = { x: Number(toPoint?.x) || 0, y: Number(toPoint?.y) || 0 };
    if (scene.grid.snap && !String(scene.grid.type).startsWith("hex")) {
      const cell = Number(scene.grid.cellSize) || 64;
      const x = Number(scene.grid.offsetX) || 0;
      const y = Number(scene.grid.offsetY) || 0;
      to.x = Math.round((to.x - x - cell / 2) / cell) * cell + x + cell / 2;
      to.y = Math.round((to.y - y - cell / 2) / cell) * cell + y + cell / 2;
    }
    const size = token
      ? {
          w: Number(token.w ?? token.width ?? token.size?.w ?? token.size?.width ?? scene.grid.cellSize) || 64,
          h: Number(token.h ?? token.height ?? token.size?.h ?? token.size?.height ?? scene.grid.cellSize) || 64,
        }
      : { w: scene.grid.cellSize || 64, h: scene.grid.cellSize || 64 };
    const blocked = checkMovementBlocked(scene.walls, from, to, size);
    const pixelDist = Math.hypot(to.x - from.x, to.y - from.y);
    const unitsPerPx = (Number(scene.grid.scale) || 5) / (Number(scene.grid.cellSize) || 64);
    const distance = Math.round(pixelDist * unitsPerPx * 100) / 100;
    const idStr = String(tokenId);
    const resolvedGroundId = String(groundId ?? scene.activeGroundId ?? "ground");
    const payload = {
      id: idStr,
      tokenId: idStr,
      groundId: resolvedGroundId,
      from,
      to,
      blocked,
      distance,
    };
    this.emit("tokenMoveRequest", payload);
    return payload;
  }

  exportArchive(assets = {}) {
    const scene = this.#resolveSceneData(this.props);
    const bytes = packMap(
      {
        id: this.props.data?.id || "battlemap",
        name: this.props.title || this.props.data?.name || "BattleMap",
        width: this.props.width,
        height: this.props.height,
        grid: scene.grid,
        grounds: scene.groundStack,
        layers: this.props.layers?.length ? this.props.layers : this.props.data?.layers,
        tokens: scene.tokens,
        walls: scene.walls,
        lights: scene.lights,
        drawings: scene.drawings,
        roofs: scene.roofs,
      },
      assets,
    );
    const archive = bytesToBase64(bytes);
    const name = `${(this.props.title || "battlemap").replace(/\s+/g, "_")}.map`;
    this.emit("exportMap", { name, archive });
    return { name, archive, bytes };
  }

  importArchive(archiveBytes) {
    const { map, assets } = unpackMap(archiveBytes);
    this.emit("importMap", { map });
    this.emit("mapEditChange", { map, action: "import" });
    return { map, assets };
  }

  update(p) {
    this.begin({ ...p, title: "" });
    const signature = JSON.stringify(p.camera);
    if (signature !== this.cameraSignature) {
      this.cameraSignature = signature;
      this.camera = { x: 0, y: 0, zoom: 1, rotation: 0, ...p.camera };
    }
    const viewport = el("div", "kit-surface");
    viewport.style.height = Math.max(160, p.height) + "px";
    viewport.style.flex = "1 1 auto";
    viewport.style.minHeight = "0";
    this.resizeObserver.disconnect();
    this.resizeObserver.observe(viewport);
    viewport.tabIndex = 0;
    viewport.setAttribute("aria-label", p.title || "Tabletop");
    const world = el("div", "kit-world");
    world.style.width = Math.max(1, p.width) + "px";
    world.style.height = Math.max(1, p.height) + "px";
    const apply = () => {
      const c = this.camera;
      world.style.transform =
        "translate(" +
        c.x +
        "px," +
        c.y +
        "px) rotate(" +
        c.rotation +
        "deg) scale(" +
        c.zoom +
        ")";
      this.#syncWorldTransform();
    };
    const emit = () => {
      apply();
      this.emit("cameraChanged", { camera: { ...this.camera } });
    };
    const point = (x, y) => {
      const c = this.camera,
        a = (-c.rotation * Math.PI) / 180,
        dx = (x - c.x) / c.zoom,
        dy = (y - c.y) / c.zoom;
      return {
        x: dx * Math.cos(a) - dy * Math.sin(a),
        y: dx * Math.sin(a) + dy * Math.cos(a),
      };
    };
    viewport.ondragover = (event) => {
      if (!p.disabled) event.preventDefault();
    };
    viewport.ondrop = (event) => {
      if (p.disabled) return;
      event.preventDefault();
      const encoded = event.dataTransfer?.getData("application/x-easel-kit");
      const id = event.dataTransfer?.getData("text/plain");
      let data;
      try { data = encoded ? JSON.parse(encoded) : { id }; } catch { return; }
      if (!data || typeof data !== "object" || Array.isArray(data) || (!encoded && !id)) return;
      const rect = viewport.getBoundingClientRect();
      this.emit("dropRequest", { data, position: point(event.clientX - rect.left, event.clientY - rect.top), groundId: String(this.#resolveSceneData(p).activeGroundId || "") });
    };
    viewport.onwheel = (e) => {
      e.preventDefault();
      const rect = viewport.getBoundingClientRect(),
        x = e.clientX - rect.left,
        y = e.clientY - rect.top,
        before = point(x, y);
      this.camera.zoom = Math.max(
        0.05,
        Math.min(20, this.camera.zoom * (e.deltaY > 0 ? 0.9 : 1 / 0.9)),
      );
      const a = (this.camera.rotation * Math.PI) / 180;
      this.camera.x =
        x -
        (before.x * Math.cos(a) - before.y * Math.sin(a)) * this.camera.zoom;
      this.camera.y =
        y -
        (before.x * Math.sin(a) + before.y * Math.cos(a)) * this.camera.zoom;
      emit();
    };
    viewport.oncontextmenu = (e) => e.preventDefault();
    viewport.onpointerdown = (e) => {
      if (
        e.target.closest?.("button,input,select,[draggable=true],[data-token-id],[data-door-id]") ||
        p.disabled
      )
        return;
      const rect = viewport.getBoundingClientRect();
      const worldPt = point(e.clientX - rect.left, e.clientY - rect.top);
      if (p.tool === "calibrate") {
        this.calibrateClick(worldPt);
        return;
      }
      const start = {
        x: e.clientX,
        y: e.clientY,
        cx: this.camera.x,
        cy: this.camera.y,
      };
      viewport.setPointerCapture?.(e.pointerId);
      viewport.onpointermove = (ev) => {
        this.camera.x = start.cx + ev.clientX - start.x;
        this.camera.y = start.cy + ev.clientY - start.y;
        apply();
      };
      viewport.onpointerup = () => {
        viewport.onpointermove = null;
        emit();
      };
      viewport.onpointercancel = () => (viewport.onpointermove = null);
    };
    viewport.onkeydown = (e) => {
      if (e.key === "[" || e.key === "]") {
        e.preventDefault();
        const rect = viewport.getBoundingClientRect(),
          x = rect.width / 2,
          y = rect.height / 2,
          before = point(x, y);
        this.camera.rotation += e.key === "[" ? -45 : 45;
        const a = (this.camera.rotation * Math.PI) / 180;
        this.camera.x =
          x -
          (before.x * Math.cos(a) - before.y * Math.sin(a)) * this.camera.zoom;
        this.camera.y =
          y -
          (before.x * Math.sin(a) + before.y * Math.cos(a)) * this.camera.zoom;
        emit();
      }
    };
    apply();
    viewport.append(this.canvasHost, world);
    this.content.append(viewport);

    if (p.gm) {
      const gmBar = el("div", "kit-row");
      gmBar.style.position = "absolute";
      gmBar.style.top = "8px";
      gmBar.style.right = "8px";
      gmBar.style.zIndex = "2";
      const exportBtn = el("button", "kit-button", "Export .map");
      exportBtn.type = "button";
      exportBtn.dataset.action = "export-map";
      exportBtn.disabled = Boolean(p.disabled);
      exportBtn.onclick = () => this.exportArchive();
      gmBar.append(exportBtn);
      this.content.append(gmBar);
    }

    if (
      Number.isFinite(p.focus?.x) &&
      Number.isFinite(p.focus?.y) &&
      this.focusSignature !== JSON.stringify(p.focus)
    ) {
      this.focusSignature = JSON.stringify(p.focus);
      cancelAnimationFrame(this.frame);
      this.frame = requestAnimationFrame(() => {
        if (this.life.signal.aborted) return;
        const rect = viewport.getBoundingClientRect(),
          angle = (this.camera.rotation * Math.PI) / 180;
        this.camera.x =
          rect.width / 2 -
          (p.focus.x * Math.cos(angle) - p.focus.y * Math.sin(angle)) *
            this.camera.zoom;
        this.camera.y =
          rect.height / 2 -
          (p.focus.x * Math.sin(angle) + p.focus.y * Math.cos(angle)) *
            this.camera.zoom;
        emit();
      });
    }
    for (const layer of p.layers || []) {
      if (layer.hidden || layer.type === "ground") continue;
      const node = el("div", "kit-layer");
      node.style.opacity = String(
        Math.max(0, Math.min(1, Number(layer.opacity ?? 1))),
      );
      if (layer.image) {
        const image = this.image(layer.image, layer.label ?? "Map layer");
        image.style.position = "absolute";
        image.style.left = Number(layer.x ?? 0) + "px";
        image.style.top = Number(layer.y ?? 0) + "px";
        image.style.width = Number(layer.width ?? p.width) + "px";
        image.style.height = Number(layer.height ?? p.height) + "px";
        node.append(image);
      }
      world.append(node);
    }

    const scene = this.#resolveSceneData(p);
    for (const tok of scene.tokens) {
      const opacity = Number(tok.presentation?.opacity ?? tok.opacity ?? 1);
      if (opacity <= 0 && !p.gm) continue;
      const tid = String(tok.id ?? "");
      const node = el("button", "kit-piece", tok.label ?? tok.name ?? tid);
      node.type = "button";
      node.dataset.tokenId = tid;
      const tx = Number(tok.x ?? tok.position?.x) || 0;
      const ty = Number(tok.y ?? tok.position?.y) || 0;
      const tw = Number(tok.w ?? tok.width ?? tok.size?.w ?? tok.size?.width ?? scene.grid.cellSize) || 64;
      const th = Number(tok.h ?? tok.height ?? tok.size?.h ?? tok.size?.height ?? tw) || tw;
      node.style.position = "absolute";
      node.style.left = tx - tw / 2 + "px";
      node.style.top = ty - th / 2 + "px";
      node.style.width = tw + "px";
      node.style.height = th + "px";
      node.onclick = () => this.emit("tokenSelect", { id: tid, tokenId: tid });
      node.onpointerdown = (e) => {
        if (p.disabled || tok.canControl === false) return;
        e.stopPropagation();
        const startWorld = { x: tx, y: ty };
        let moved = false;
        node.setPointerCapture?.(e.pointerId);
        node.onpointermove = (ev) => {
          const rect = viewport.getBoundingClientRect();
          const curWorld = point(ev.clientX - rect.left, ev.clientY - rect.top);
          if (Math.hypot(curWorld.x - startWorld.x, curWorld.y - startWorld.y) > 3) {
            moved = true;
            const blocked = checkMovementBlocked(scene.walls, startWorld, curWorld, { w: tw, h: th });
            this.dragPreview = {
              tokenId: tid,
              from: startWorld,
              to: curWorld,
              size: { w: tw, h: th },
              blocked,
            };
            this.#renderPixi(this.props);
          }
        };
        node.onpointerup = (ev) => {
          node.onpointermove = null;
          node.onpointerup = null;
          if (moved && this.dragPreview) {
            const targetPt = this.dragPreview.to;
            this.dragPreview = null;
            this.#renderPixi(this.props);
            this.requestTokenMove(tid, targetPt, scene.activeGroundId);
          } else {
            this.dragPreview = null;
            const rect = viewport.getBoundingClientRect();
            if (ev && Number.isFinite(ev.clientX) && Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) > 4) {
              const targetPt = point(ev.clientX - rect.left, ev.clientY - rect.top);
              this.requestTokenMove(tid, targetPt, scene.activeGroundId);
            }
          }
        };
      };
      world.append(node);
    }

    for (const w of scene.walls) {
      if (w.kind === "door" || w.door) {
        const did = String(w.id ?? "");
        const x1 = Number(w.a?.x ?? w.x1) || 0;
        const y1 = Number(w.a?.y ?? w.y1) || 0;
        const x2 = Number(w.b?.x ?? w.x2) || 0;
        const y2 = Number(w.b?.y ?? w.y2) || 0;
        const doorBtn = el("button", "kit-badge", w.open ? "Open Door" : "Closed Door");
        doorBtn.type = "button";
        doorBtn.dataset.doorId = did;
        doorBtn.style.position = "absolute";
        doorBtn.style.left = (x1 + x2) / 2 - 20 + "px";
        doorBtn.style.top = (y1 + y2) / 2 - 12 + "px";
        doorBtn.onclick = () => this.toggleDoor(did);
        world.append(doorBtn);
      }
    }

    world.append(this.slots.objects, this.slots.overlay);
    this.#ensureApp(p.width, p.height);
    this.#renderPixi(p);
  }

  destroy() {
    this.resizeObserver.disconnect();
    if (this.exploredFogTexture) {
      try {
        this.exploredFogTexture.destroy(true);
      } catch {}
      this.exploredFogTexture = null;
    }
    if (this.app) {
      const app = this.app;
      this.app = null;
      if (this.boot) {
        this.boot.then(() => {
          try {
            app.destroy(true, { children: true });
          } catch {}
        });
      }
    }
    super.destroy();
  }
}
