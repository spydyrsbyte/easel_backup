import { Component, h, icon, iconButton, clamp, typing, safeUrl, sameJSON } from "./ui.mjs";
import { wallSegments, visibilityPolygon, movementBlocked, gridSnap, gridDistance } from "./sight.mjs";

let boundEasel = null;

export function initialize({ Easel }) {
  boundEasel = Easel;
}

const DISPOSITION = { friendly: 0x43d9c0, neutral: 0x9aa7c7, hostile: 0xff6b7a, secret: 0xc792ea };
const PRIMARY = 0x8b9dff;
const EDIT_TOOLS = new Set(["wall", "door", "column", "light"]);
const textures = new Map();

function parseColor(value, fallback = 0xffffff, fallbackAlpha = 1) {
  if (typeof value === "number" && Number.isFinite(value)) return { color: value & 0xffffff, alpha: fallbackAlpha };
  if (typeof value !== "string") return { color: fallback, alpha: fallbackAlpha };
  let text = value.trim().replace(/^#/, "");
  if (text.length === 3 || text.length === 4) text = [...text].map((part) => part + part).join("");
  if (!/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(text)) return { color: fallback, alpha: fallbackAlpha };
  return { color: parseInt(text.slice(0, 6), 16), alpha: text.length === 8 ? parseInt(text.slice(6), 16) / 255 : fallbackAlpha };
}

function imageSource(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  return value.ref || value.src || value.url || value.image || "";
}

function newId(prefix) {
  return prefix + "-" + Math.random().toString(36).slice(2, 10);
}

function distanceToSegment(point, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = dx * dx + dy * dy;
  const t = length ? clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / length, 0, 1) : 0;
  return Math.hypot(a.x + t * dx - point.x, a.y + t * dy - point.y);
}

function insidePoints(point, polygon) {
  let inside = false;
  for (let index = 0, last = polygon.length - 1; index < polygon.length; last = index++) {
    const a = polygon[index];
    const b = polygon[last];
    if (a.y > point.y !== b.y > point.y && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export default class BattleMap extends Component {
  constructor() {
    super("easel.maps.map", "div");
    this.element.classList.add("ez-map");
    this.element.tabIndex = 0;
    this.element.dataset.cursor = "grab";
    this.camera = { x: 1000, y: 700, zoom: 0.5 };
    this.map = {};
    this.views = new Map();
    this.pointers = new Map();
    this.history = [];
    this.future = [];
    this.selection = null;
    this.chain = null;
    this.gesture = null;
    this.explored = [];
    this.seenPings = new Set();
    this.pingViews = [];
    this.readout = h("div", { class: "ez-map-readout ez-glass", hidden: true });
    this.dropHint = h("div", { class: "ez-map-drop", hidden: true, text: "Drop to place on the map" });
    this.empty = h("div", { class: "ez-map-empty", hidden: true });
    this.zoomValue = h("span", { class: "ez-zoom-value", text: "100%" });
    this.zoom = h(
      "div",
      { class: "ez-zoom ez-glass" },
      iconButton("zoomOut", "Zoom out", () => this.zoomBy(1 / 1.25)),
      this.zoomValue,
      iconButton("zoomIn", "Zoom in", () => this.zoomBy(1.25)),
      iconButton("fit", "Fit the map to the view", () => {
        this.autoFit = true;
        this.fit(true);
      }),
    );
    this.hud = h("div", { class: "ez-map-hud" }, this.empty, this.dropHint, this.readout, this.zoom);
    this.element.append(this.hud);
    this.ready = this.start();
    this.bind();
  }

  async start() {
    const host = boundEasel || globalThis.Easel;
    this.P = host.Interfaces.create("easel.graphics.pixi@1");
    const P = this.P;
    const app = new P.Application();
    await app.init({ background: 0x07090d, antialias: true, autoDensity: true, resolution: Math.min(2, globalThis.devicePixelRatio || 1), width: 300, height: 200, preference: "webgl" });
    if (this.signal.aborted) {
      app.destroy(true);
      return;
    }
    this.app = app;
    this.element.prepend(app.canvas);
    this.world = new P.Container();
    this.layers = {};
    for (const name of ["backdrop", "grounds", "grid", "drawings", "tokens", "roofs", "light", "fog", "edit", "doors", "overlay"]) {
      this.layers[name] = new P.Container();
      this.world.addChild(this.layers[name]);
    }
    this.backdrop = new P.Graphics();
    this.layers.backdrop.addChild(this.backdrop);
    this.gridGraphics = new P.Graphics();
    this.layers.grid.addChild(this.gridGraphics);
    this.drawGraphics = new P.Graphics();
    this.layers.drawings.addChild(this.drawGraphics);
    this.editGraphics = new P.Graphics();
    this.layers.edit.addChild(this.editGraphics);
    this.overlayGraphics = new P.Graphics();
    this.layers.overlay.addChild(this.overlayGraphics);
    app.stage.addChild(this.world);
    this.lightTexture = this.makeLightTexture();
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(this.element);
    this.resize();
    app.ticker.add((ticker) => this.tick(ticker.deltaMS));
    this.fitted = false;
    this.apply(this.props, {});
  }

  makeLightTexture() {
    const size = 256;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const context = canvas.getContext("2d");
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    for (const [stop, alpha] of [
      [0, 1],
      [0.25, 0.86],
      [0.5, 0.52],
      [0.75, 0.2],
      [1, 0],
    ])
      gradient.addColorStop(stop, "rgba(255,255,255," + alpha + ")");
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
    return this.P.Texture.from(canvas);
  }

  texture(source) {
    const url = safeUrl(imageSource(source));
    if (!url) return Promise.resolve(null);
    if (!textures.has(url)) {
      textures.set(
        url,
        new Promise((resolve) => {
          const image = new Image();
          if (!url.startsWith(location.origin) && !url.startsWith("blob:") && !url.startsWith("data:")) image.crossOrigin = "anonymous";
          image.onload = () => resolve(this.P.Texture.from(image));
          image.onerror = () => {
            textures.delete(url);
            resolve(null);
          };
          image.src = url;
        }),
      );
    }
    return textures.get(url);
  }

  get insets() {
    const value = this.props.insets || {};
    return { top: Number(value.top) || 0, right: Number(value.right) || 0, bottom: Number(value.bottom) || 0, left: Number(value.left) || 0 };
  }

  size() {
    return { width: Number(this.map?.size?.width) || 2000, height: Number(this.map?.size?.height) || 1400 };
  }

  grounds() {
    return (this.map?.layers || []).filter((layer) => layer?.type === "ground");
  }

  ground() {
    const grounds = this.grounds();
    return grounds.find((ground) => ground.id === this.props.groundId) || grounds[0] || null;
  }

  grid() {
    return this.ground()?.grid || { type: "square", size: 100, offset: { left: 0, top: 0 }, relativesize: { size: 5, label: "ft" }, color: "#ffffff40", visible: true };
  }

  items(type) {
    const ground = this.ground();
    if (!ground) return [];
    return (ground.children || []).filter((layer) => layer.type === type && (layer.visible !== false || this.props.editing)).flatMap((layer) => (layer.items || []).map((item) => ({ ...item, layerId: layer.id })));
  }

  walls() {
    return this.items("wall");
  }

  render(props, previous) {
    if (!sameJSON(props.map, previous.map)) {
      this.map = props.map || {};
      if (previous.map && props.sceneKey !== previous.sceneKey) {
        this.history = [];
        this.future = [];
      }
    }
    this.props = props;
    if (this.app) this.apply(props, previous);
  }

  apply(props, previous) {
    const mapChanged = this.mapDirty || !sameJSON(props.map, previous.map) || props.groundId !== previous.groundId || props.editing !== previous.editing || props.gm !== previous.gm;
    this.mapDirty = false;
    if (props.sceneKey !== previous.sceneKey) {
      this.explored = [];
      this.fitted = false;
      this.selection = null;
      this.chain = null;
    }
    if (mapChanged) this.drawStatic();
    this.syncTokens(props.tokens || []);
    this.syncPings(props.pings || []);
    if (mapChanged || !sameJSON(props.tokens, previous.tokens) || props.fog !== previous.fog) {
      this.lightDirty = true;
      this.fogDirty = true;
    }
    if (!sameJSON(props.insets, previous.insets)) this.placeHud();
    if (!this.fitted || props.fitKey !== previous.fitKey || (this.autoFit !== false && !sameJSON(props.insets, previous.insets))) {
      this.autoFit = true;
      this.fit(false);
      this.fitted = true;
    }
    this.element.dataset.tool = props.tool || "select";
    this.cursor();
    this.drawEdit();
    this.drawOverlay();
    const hasMap = this.grounds().length > 0;
    this.empty.hidden = hasMap;
    if (!hasMap && !this.empty.firstChild) this.empty.append(h("div", { class: "ez-empty" }, icon("map", 34), h("strong", { text: "No scene is showing" }), h("span", { text: props.gm ? "Create a scene to get started." : "The game master has not shown a scene yet." })));
  }

  placeHud() {
    const inset = this.insets;
    this.zoom.style.right = inset.right + 12 + "px";
    this.zoom.style.bottom = inset.bottom + 12 + "px";
    this.readout.style.marginLeft = (inset.left - inset.right) / 2 + "px";
    this.readout.style.bottom = inset.bottom + 12 + "px";
  }

  resize() {
    if (!this.app) return;
    const width = Math.max(1, this.element.clientWidth);
    const height = Math.max(1, this.element.clientHeight);
    this.app.renderer.resize(width, height);
    this.placeHud();
    if (this.autoFit !== false) this.fit(false);
    else this.place();
  }

  place() {
    if (!this.world) return;
    const inset = this.insets;
    const width = this.element.clientWidth;
    const height = this.element.clientHeight;
    const cx = inset.left + (width - inset.left - inset.right) / 2;
    const cy = inset.top + (height - inset.top - inset.bottom) / 2;
    this.world.scale.set(this.camera.zoom);
    this.world.position.set(cx - this.camera.x * this.camera.zoom, cy - this.camera.y * this.camera.zoom);
    this.zoomValue.textContent = Math.round(this.camera.zoom * 100) + "%";
    this.drawEdit();
    this.drawOverlay();
    for (const view of this.views.values()) this.styleToken(view);
  }

  fit(animate) {
    const size = this.size();
    const inset = this.insets;
    const width = Math.max(50, this.element.clientWidth - inset.left - inset.right);
    const height = Math.max(50, this.element.clientHeight - inset.top - inset.bottom);
    const target = { x: size.width / 2, y: size.height / 2, zoom: clamp(Math.min(width / size.width, height / size.height) * 0.94, 0.03, 6) };
    if (animate) this.glide = { from: { ...this.camera }, to: target, time: 0 };
    else {
      this.camera = target;
      this.place();
    }
  }

  zoomBy(factor, anchor) {
    this.autoFit = false;
    const before = anchor ? this.toWorld(anchor.x, anchor.y) : null;
    this.camera.zoom = clamp(this.camera.zoom * factor, 0.03, 8);
    if (before) {
      this.place();
      const after = this.toWorld(anchor.x, anchor.y);
      this.camera.x += before.x - after.x;
      this.camera.y += before.y - after.y;
    }
    this.place();
    this.announceCamera();
  }

  announceCamera() {
    clearTimeout(this.cameraTimer);
    this.cameraTimer = setTimeout(() => this.emit("cameraChange", { camera: { ...this.camera } }), 250);
  }

  toWorld(clientX, clientY) {
    const bounds = this.element.getBoundingClientRect();
    return { x: (clientX - bounds.left - this.world.position.x) / this.camera.zoom, y: (clientY - bounds.top - this.world.position.y) / this.camera.zoom };
  }

  toScreen(point) {
    return { x: point.x * this.camera.zoom + this.world.position.x, y: point.y * this.camera.zoom + this.world.position.y };
  }

  drawStatic() {
    const P = this.P;
    const size = this.size();
    const ground = this.ground();
    this.backdrop.clear();
    if (ground) {
      this.backdrop.rect(-6, -6, size.width + 12, size.height + 12).fill({ color: 0x000000, alpha: 0.5 });
      this.backdrop.rect(0, 0, size.width, size.height).fill({ color: 0x12161f });
    }
    for (const child of this.layers.grounds.removeChildren()) child.destroy({ children: true });
    for (const child of this.layers.roofs.removeChildren()) child.destroy({ children: true });
    this.roofViews = [];
    const grounds = this.grounds();
    const index = grounds.indexOf(ground);
    let low = index;
    while (low > 0 && grounds[low].alphaMask) low--;
    const token = (this.drawToken = (this.drawToken || 0) + 1);
    for (let position = Math.max(0, low); position <= index; position++) {
      const level = grounds[position];
      if (!level || (level.visible === false && !this.props.editing)) continue;
      const container = new P.Container();
      this.layers.grounds.addChild(container);
      const art = imageSource(level.image);
      if (art) {
        const sprite = new P.Sprite();
        container.addChild(sprite);
        this.texture(art).then((texture) => {
          if (!texture || token !== this.drawToken) return;
          sprite.texture = texture;
          const image = typeof level.image === "object" ? level.image : {};
          sprite.position.set(Number(image.position?.x ?? image.x) || 0, Number(image.position?.y ?? image.y) || 0);
          sprite.width = Number(image.size?.width ?? image.width) || texture.width;
          sprite.height = Number(image.size?.height ?? image.height) || texture.height;
        });
      }
      if (position !== index && position >= low) container.alpha = 0.85;
      for (const layer of level.children || []) {
        if (layer.type !== "object" && layer.type !== "roof") continue;
        if (layer.visible === false && !this.props.editing) continue;
        const target = layer.type === "roof" && position === index ? new P.Container() : container;
        if (target !== container) {
          this.layers.roofs.addChild(target);
          this.roofViews.push({ layer, container: target });
        }
        for (const item of layer.items || []) {
          const sprite = new P.Sprite();
          sprite.alpha = (layer.visible === false ? 0.35 : 1) * clamp(Number(item.opacity ?? 1), 0, 1);
          target.addChild(sprite);
          this.texture(item.image).then((texture) => {
            if (!texture || token !== this.drawToken) return;
            sprite.texture = texture;
            const width = Number(item.width) || texture.width;
            const height = Number(item.height) || texture.height;
            sprite.anchor.set(0.5);
            sprite.position.set((Number(item.x) || 0) + width / 2, (Number(item.y) || 0) + height / 2);
            sprite.width = width;
            sprite.height = height;
            sprite.rotation = ((Number(item.rotation) || 0) * Math.PI) / 180;
          });
        }
      }
    }
    this.gridGraphics.clear();
    const grid = this.grid();
    if (ground && grid.visible !== false && grid.type !== "none") {
      const cell = Math.max(4, Number(grid.size) || 100);
      const left = ((Number(grid.offset?.left) || 0) % cell + cell) % cell;
      const top = ((Number(grid.offset?.top) || 0) % cell + cell) % cell;
      const { color, alpha } = parseColor(grid.color, 0xffffff, 0.25);
      for (let x = left; x <= size.width + 0.5; x += cell) this.gridGraphics.moveTo(x, 0).lineTo(x, size.height);
      for (let y = top; y <= size.height + 0.5; y += cell) this.gridGraphics.moveTo(0, y).lineTo(size.width, y);
      this.gridGraphics.stroke({ color, alpha, width: 1, pixelLine: true });
    }
    this.drawGraphics.clear();
    for (const drawing of this.items("drawing")) {
      const points = drawing.points || [];
      if (points.length < 2) continue;
      this.drawGraphics.moveTo(points[0].x, points[0].y);
      for (const point of points.slice(1)) this.drawGraphics.lineTo(point.x, point.y);
      const { color, alpha } = parseColor(drawing.color, 0xffd166, 1);
      this.drawGraphics.stroke({ color, alpha, width: Number(drawing.strokeWidth) || 4, cap: "round", join: "round" });
    }
    for (const child of this.layers.doors.removeChildren()) child.destroy();
    this.doorViews = [];
    for (const wall of this.walls()) {
      if (!(wall.door || wall.kind === "door") || !wall.a || !wall.b) continue;
      const marker = new P.Graphics();
      this.layers.doors.addChild(marker);
      this.doorViews.push({ wall, marker, x: (wall.a.x + wall.b.x) / 2, y: (wall.a.y + wall.b.y) / 2 });
    }
    this.segments = wallSegments(this.walls());
    this.lightDirty = true;
    this.fogDirty = true;
  }

  viewerTokens() {
    return (this.props.tokens || []).filter((token) => token.controllable && !token.hidden && token.sight !== false);
  }

  syncTokens(tokens) {
    const P = this.P;
    const seen = new Set();
    const ground = this.ground();
    for (const token of tokens) {
      if (ground && token.groundId && token.groundId !== ground.id) continue;
      seen.add(token.id);
      let view = this.views.get(token.id);
      if (!view) {
        const root = new P.Container();
        const glow = new P.Graphics();
        const base = new P.Graphics();
        const picture = new P.Sprite();
        picture.anchor.set(0.5);
        const mask = new P.Graphics();
        const ring = new P.Graphics();
        const bars = new P.Graphics();
        const letters = new P.Text({ text: "", style: { fontFamily: "Segoe UI, system-ui, sans-serif", fontWeight: "700", fontSize: 32, fill: 0x0d1017 } });
        letters.anchor.set(0.5);
        const label = new P.Text({ text: "", style: { fontFamily: "Segoe UI, system-ui, sans-serif", fontWeight: "600", fontSize: 26, fill: 0xffffff, stroke: { color: 0x05070b, width: 5, join: "round" } } });
        label.anchor.set(0.5, 0);
        label.resolution = 2;
        picture.mask = mask;
        root.addChild(glow, base, picture, mask, letters, ring, bars, label);
        this.layers.tokens.addChild(root);
        view = { root, glow, base, picture, mask, ring, bars, letters, label, x: token.x, y: token.y, image: null };
        root.position.set(token.x, token.y);
        this.views.set(token.id, view);
      }
      const moved = view.token && (view.token.x !== token.x || view.token.y !== token.y);
      view.token = token;
      if (!view.dragging) {
        if (moved) view.tween = { fromX: view.root.position.x, fromY: view.root.position.y, time: 0 };
        else if (!view.tween) view.root.position.set(token.x, token.y);
      }
      this.styleToken(view);
    }
    for (const [id, view] of this.views) {
      if (seen.has(id)) continue;
      view.root.destroy({ children: true });
      this.views.delete(id);
    }
  }

  styleToken(view) {
    const token = view.token;
    if (!token) return;
    const width = Math.max(8, Number(token.width) || 64);
    const height = Math.max(8, Number(token.height) || 64);
    const radius = Math.min(width, height) / 2;
    const selected = (this.props.selectedTokenIds || []).includes(token.id);
    const tone = token.color ? parseColor(token.color).color : DISPOSITION[token.disposition] ?? DISPOSITION.neutral;
    const key = [width, height, selected, tone, token.image, token.name, token.hidden, JSON.stringify(token.bars || []), token.defeated, token.rotation, token.current, this.hover === token.id, Math.round(this.camera.zoom * 20)].join("|");
    if (view.key === key) return;
    view.key = key;
    const inner = radius * 0.9;
    view.base.clear().circle(0, 0, inner).fill({ color: tone, alpha: 0.95 });
    view.mask.clear().circle(0, 0, inner).fill({ color: 0xffffff });
    view.ring.clear().circle(0, 0, inner).stroke({ color: tone, width: Math.max(2, radius * 0.09), alpha: 1 });
    if (token.current) view.ring.circle(0, 0, radius * 1.08).stroke({ color: 0xf2b45a, width: Math.max(2, radius * 0.07), alpha: 0.95 });
    view.glow.clear();
    if (selected) {
      view.glow.circle(0, 0, radius * 1.16).fill({ color: PRIMARY, alpha: 0.22 });
      view.glow.circle(0, 0, radius * 1.05).stroke({ color: PRIMARY, width: Math.max(2, 3 / this.camera.zoom), alpha: 1 });
    } else if (this.hover === token.id) {
      view.glow.circle(0, 0, radius * 1.05).stroke({ color: 0xffffff, width: Math.max(1.5, 2 / this.camera.zoom), alpha: 0.7 });
    }
    view.root.alpha = token.hidden ? 0.45 : token.defeated ? 0.6 : 1;
    const words = String(token.name || "?").trim().split(/\s+/);
    view.letters.text = ((words[0]?.[0] || "?") + (words.length > 1 ? words[words.length - 1][0] : "")).toUpperCase();
    view.letters.style.fontSize = Math.max(10, inner * 0.8);
    if (view.image !== token.image) {
      view.image = token.image;
      view.picture.visible = false;
      view.letters.visible = true;
      const wanted = token.image;
      this.texture(wanted).then((texture) => {
        if (!texture || view.image !== wanted || view.root.destroyed) return;
        view.picture.texture = texture;
        view.picture.visible = true;
        view.letters.visible = false;
        view.key = "";
        this.styleToken(view);
      });
    }
    if (view.picture.visible && view.picture.texture) {
      const scale = (inner * 2) / Math.min(view.picture.texture.width, view.picture.texture.height);
      view.picture.scale.set(scale);
      view.picture.rotation = ((Number(token.rotation) || 0) * Math.PI) / 180;
    }
    const scaleUp = clamp(1 / this.camera.zoom, 0.5, 3.2);
    const fontSize = clamp(13 * scaleUp, 9, 64);
    view.label.text = token.name || "";
    view.label.style.fontSize = fontSize;
    view.label.style.stroke = { color: 0x05070b, width: fontSize * 0.28, join: "round" };
    view.label.position.set(0, radius + fontSize * 0.25);
    view.label.visible = !!token.name && (selected || this.hover === token.id || token.showName !== false);
    view.bars.clear();
    const bars = Array.isArray(token.bars) ? token.bars.slice(0, 2) : [];
    bars.forEach((bar, index) => {
      const max = Number(bar.max) || 0;
      if (max <= 0) return;
      const ratio = clamp((Number(bar.value) || 0) / max, 0, 1);
      const barWidth = radius * 1.7;
      const barHeight = Math.max(3, radius * 0.13);
      const y = -radius - barHeight * (1.6 + index * 1.5);
      view.bars.roundRect(-barWidth / 2, y, barWidth, barHeight, barHeight / 2).fill({ color: 0x05070b, alpha: 0.75 });
      if (ratio > 0) view.bars.roundRect(-barWidth / 2, y, barWidth * ratio, barHeight, barHeight / 2).fill({ color: bar.color ? parseColor(bar.color).color : ratio > 0.5 ? 0x5fd38d : ratio > 0.25 ? 0xf2b45a : 0xff6b7a });
    });
  }

  syncPings(pings) {
    const P = this.P;
    for (const ping of pings) {
      if (this.seenPings.has(ping.id)) continue;
      this.seenPings.add(ping.id);
      const graphic = new P.Graphics();
      graphic.position.set(ping.x, ping.y);
      this.layers.overlay.addChild(graphic);
      this.pingViews.push({ graphic, time: 0, color: parseColor(ping.color, PRIMARY).color });
    }
    if (this.seenPings.size > 400) this.seenPings = new Set(pings.map((ping) => ping.id));
  }

  tick(delta) {
    if (this.glide) {
      this.glide.time = Math.min(1, this.glide.time + delta / 260);
      const ease = 1 - Math.pow(1 - this.glide.time, 3);
      for (const key of ["x", "y", "zoom"]) this.camera[key] = this.glide.from[key] + (this.glide.to[key] - this.glide.from[key]) * ease;
      this.place();
      if (this.glide.time >= 1) this.glide = null;
    }
    for (const view of this.views.values()) {
      if (!view.tween || view.dragging) continue;
      view.tween.time = Math.min(1, view.tween.time + delta / 220);
      const ease = 1 - Math.pow(1 - view.tween.time, 3);
      view.root.position.set(view.tween.fromX + (view.token.x - view.tween.fromX) * ease, view.tween.fromY + (view.token.y - view.tween.fromY) * ease);
      this.lightDirty = this.lightDirty || !!view.token.light;
      this.fogDirty = this.fogDirty || !!view.token.controllable;
      if (view.tween.time >= 1) view.tween = null;
    }
    for (let index = this.pingViews.length - 1; index >= 0; index--) {
      const ping = this.pingViews[index];
      ping.time += delta;
      const life = 2200;
      const scale = 1 / this.camera.zoom;
      ping.graphic.clear();
      for (let ring = 0; ring < 3; ring++) {
        const phase = ((ping.time + ring * 260) % 900) / 900;
        ping.graphic.circle(0, 0, (10 + phase * 46) * scale).stroke({ color: ping.color, width: 3 * scale, alpha: (1 - phase) * (1 - ping.time / life) });
      }
      ping.graphic.circle(0, 0, 6 * scale).fill({ color: ping.color, alpha: 1 - ping.time / life });
      if (ping.time >= life) {
        ping.graphic.destroy();
        this.pingViews.splice(index, 1);
      }
    }
    if (this.lightDirty) this.drawLight();
    if (this.fogDirty) this.drawFog();
    this.updateRoofs();
  }

  textureScale() {
    const size = this.size();
    return Math.min(1, 2048 / Math.max(size.width, size.height));
  }

  target(name) {
    const P = this.P;
    const size = this.size();
    const scale = this.textureScale();
    const width = Math.max(2, Math.ceil(size.width * scale));
    const height = Math.max(2, Math.ceil(size.height * scale));
    const existing = this.targets?.[name];
    if (existing && existing.width === width && existing.height === height) return existing;
    existing?.destroy(true);
    this.targets = this.targets || {};
    this.targets[name] = P.RenderTexture.create({ width, height, resolution: 1 });
    return this.targets[name];
  }

  lightRadius(light) {
    if (Number(light.radius) > 0) return Number(light.radius);
    const cell = Number(this.grid().size) || 100;
    const intensity = Math.max(0.06, Number(light.intensity ?? 1));
    return cell * Math.sqrt(Math.max(0.2, intensity / 0.05 - 1));
  }

  drawLight() {
    this.lightDirty = false;
    const P = this.P;
    const ground = this.ground();
    for (const child of this.layers.light.removeChildren()) child.destroy();
    if (!ground) return;
    const size = this.size();
    let ambient = clamp(Number(ground.ambient ?? 1), 0, 1);
    if (this.props.gm) ambient = Math.max(ambient, clamp(Number(ground.gmBrightness ?? 0.6), 0, 1));
    const lights = this.items("light").filter((light) => light.enabled !== false);
    for (const view of this.views.values()) {
      const carried = view.token.light;
      if (carried && Number(carried.radius) > 0) lights.push({ x: view.root.position.x, y: view.root.position.y, radius: Number(carried.radius), color: carried.color || "#ffe2b0", intensity: 1 });
    }
    if (ambient >= 0.995) return;
    const scale = this.textureScale();
    const scene = new P.Container();
    scene.scale.set(scale);
    const shade = Math.round(ambient * 255);
    scene.addChild(new P.Graphics().rect(0, 0, size.width, size.height).fill({ color: (shade << 16) | (shade << 8) | shade }));
    for (const light of lights) {
      const radius = this.lightRadius(light);
      const polygon = visibilityPolygon(light, this.segments, radius);
      if (polygon.length < 3) continue;
      const sprite = new P.Sprite(this.lightTexture);
      sprite.anchor.set(0.5);
      sprite.position.set(light.x, light.y);
      sprite.width = sprite.height = radius * 2;
      sprite.tint = parseColor(light.color, 0xfff1d6).color;
      sprite.alpha = clamp(Number(light.intensity ?? 1), 0.1, 1);
      sprite.blendMode = "add";
      const mask = new P.Graphics().poly(polygon.flatMap((point) => [point.x, point.y])).fill({ color: 0xffffff });
      scene.addChild(mask);
      sprite.mask = mask;
      scene.addChild(sprite);
    }
    const target = this.target("light");
    this.app.renderer.render({ container: scene, target, clear: true });
    scene.destroy({ children: true });
    const sprite = new P.Sprite(target);
    sprite.width = size.width;
    sprite.height = size.height;
    sprite.blendMode = "multiply";
    this.layers.light.addChild(sprite);
  }

  drawFog() {
    this.fogDirty = false;
    const P = this.P;
    for (const child of this.layers.fog.removeChildren()) child.destroy();
    const ground = this.ground();
    const enabled = ground && this.props.fog !== false && this.map.fogEnabled !== false && !this.props.gm;
    if (!enabled) return;
    const size = this.size();
    const scale = this.textureScale();
    const reach = Math.hypot(size.width, size.height);
    const current = [];
    for (const view of this.views.values()) {
      const token = view.token;
      if (!token.controllable || token.hidden || token.sight === false) continue;
      const origin = { x: view.root.position.x, y: view.root.position.y };
      const polygon = visibilityPolygon(origin, this.segments, Number(token.sightRange) > 0 ? Number(token.sightRange) : reach);
      if (polygon.length >= 3) current.push(polygon);
    }
    for (const polygon of current) this.explored.push(polygon);
    if (this.explored.length > 160) this.explored = this.explored.slice(-160);
    const build = (polygons, alpha, name) => {
      const scene = new P.Container();
      scene.scale.set(scale);
      scene.addChild(new P.Graphics().rect(0, 0, size.width, size.height).fill({ color: 0x000000 }));
      for (const polygon of polygons) {
        const hole = new P.Graphics().poly(polygon.flatMap((point) => [point.x, point.y])).fill({ color: 0xffffff });
        hole.blendMode = "erase";
        scene.addChild(hole);
      }
      const target = this.target(name);
      this.app.renderer.render({ container: scene, target, clear: true });
      scene.destroy({ children: true });
      const sprite = new P.Sprite(target);
      sprite.width = size.width;
      sprite.height = size.height;
      sprite.alpha = alpha;
      sprite.filters = [new P.BlurFilter({ strength: 6, quality: 2 })];
      this.layers.fog.addChild(sprite);
    };
    build(this.explored, 1, "explored");
    build(current, 0.6, "vision");
    this.drawEdit();
  }

  updateRoofs() {
    if (!this.roofViews?.length) return;
    const watchers = [...this.views.values()].filter((view) => view.token.controllable).map((view) => ({ x: view.root.position.x, y: view.root.position.y }));
    for (const roof of this.roofViews) {
      const under = watchers.some((point) =>
        Array.isArray(roof.layer.shape) && roof.layer.shape.length >= 3
          ? insidePoints(point, roof.layer.shape)
          : (roof.layer.items || []).some((item) => point.x >= item.x && point.x <= item.x + (Number(item.width) || 0) && point.y >= item.y && point.y <= item.y + (Number(item.height) || 0)),
      );
      const wanted = this.props.editing ? 0.45 : under ? 0 : roof.layer.visible === false ? 0 : 1;
      roof.container.alpha += (wanted - roof.container.alpha) * 0.18;
    }
  }

  drawEdit() {
    if (!this.editGraphics) return;
    const g = this.editGraphics;
    g.clear();
    const zoom = this.camera.zoom;
    const px = 1 / zoom;
    const editing = !!this.props.editing;
    for (const door of this.doorViews || []) {
      const wall = door.wall;
      door.marker.clear();
      if (wall.secret && !this.props.gm) continue;
      door.seen = this.doorSeen(door);
      if (!door.seen) continue;
      const size = 11 * px;
      const color = wall.locked ? 0xff6b7a : wall.open ? 0x5fd38d : 0xf2b45a;
      door.marker.position.set(door.x, door.y);
      door.marker.roundRect(-size, -size, size * 2, size * 2, 4 * px).fill({ color: 0x0d1017, alpha: 0.88 });
      door.marker.roundRect(-size, -size, size * 2, size * 2, 4 * px).stroke({ color, width: 1.6 * px });
      if (wall.open) door.marker.rect(-size * 0.5, -size * 0.6, size * 0.35, size * 1.2).fill({ color });
      else door.marker.rect(-size * 0.5, -size * 0.6, size, size * 1.2).fill({ color });
      door.marker.circle(wall.open ? -size * 0.05 : size * 0.22, 0, size * 0.12).fill({ color: 0x0d1017 });
      door.marker.alpha = this.hoverDoor === wall.id ? 1 : 0.86;
    }
    if (!editing) return;
    const selected = this.selection;
    for (const wall of this.walls()) {
      const active = selected?.id === wall.id;
      if ((wall.column || wall.kind === "column") && wall.center) {
        g.circle(wall.center.x, wall.center.y, Number(wall.radius) || 10).fill({ color: 0x6cc6ff, alpha: 0.25 });
        g.circle(wall.center.x, wall.center.y, Number(wall.radius) || 10).stroke({ color: active ? PRIMARY : 0x6cc6ff, width: (active ? 3 : 2) * px });
        continue;
      }
      if (!wall.a || !wall.b) continue;
      const door = wall.door || wall.kind === "door";
      const color = active ? PRIMARY : door ? (wall.open ? 0x5fd38d : 0xf2b45a) : 0xf5f0e1;
      g.moveTo(wall.a.x, wall.a.y).lineTo(wall.b.x, wall.b.y).stroke({ color, width: (active ? 4.5 : 3) * px, cap: "round" });
      for (const end of [wall.a, wall.b]) {
        g.circle(end.x, end.y, (active ? 5.5 : 4) * px).fill({ color: 0x0d1017 });
        g.circle(end.x, end.y, (active ? 5.5 : 4) * px).stroke({ color, width: 1.6 * px });
      }
    }
    for (const light of this.items("light")) {
      const active = selected?.id === light.id;
      const color = parseColor(light.color, 0xffd27a).color;
      if (active) g.circle(light.x, light.y, this.lightRadius(light)).stroke({ color, width: 1.2 * px, alpha: 0.5 });
      g.circle(light.x, light.y, 11 * px).fill({ color: 0x0d1017, alpha: 0.9 });
      g.circle(light.x, light.y, 11 * px).stroke({ color: active ? PRIMARY : color, width: 2 * px });
      g.circle(light.x, light.y, 4.5 * px).fill({ color, alpha: light.enabled === false ? 0.3 : 1 });
    }
    if (selected?.kind === "image") {
      const found = this.findItem(selected.id);
      if (found) {
        const item = found.item;
        const width = Number(item.width) || 100;
        const height = Number(item.height) || 100;
        g.rect(item.x, item.y, width, height).stroke({ color: PRIMARY, width: 2 * px });
        for (const corner of this.corners(item)) {
          g.rect(corner.x - 5 * px, corner.y - 5 * px, 10 * px, 10 * px).fill({ color: 0x0d1017 });
          g.rect(corner.x - 5 * px, corner.y - 5 * px, 10 * px, 10 * px).stroke({ color: PRIMARY, width: 1.6 * px });
        }
      }
    }
  }

  doorSeen(door) {
    if (this.props.gm || this.props.fog === false || this.map.fogEnabled === false) return true;
    const wall = door.wall;
    const dx = wall.b.x - wall.a.x;
    const dy = wall.b.y - wall.a.y;
    const length = Math.hypot(dx, dy) || 1;
    const nx = (-dy / length) * 16;
    const ny = (dx / length) * 16;
    const sides = [
      { x: door.x + nx, y: door.y + ny },
      { x: door.x - nx, y: door.y - ny },
    ];
    return this.explored.some((polygon) => sides.some((point) => insidePoints(point, polygon)));
  }

  corners(item) {
    const width = Number(item.width) || 100;
    const height = Number(item.height) || 100;
    return [
      { x: item.x, y: item.y, sx: -1, sy: -1 },
      { x: item.x + width, y: item.y, sx: 1, sy: -1 },
      { x: item.x + width, y: item.y + height, sx: 1, sy: 1 },
      { x: item.x, y: item.y + height, sx: -1, sy: 1 },
    ];
  }

  drawOverlay() {
    if (!this.overlayGraphics) return;
    const g = this.overlayGraphics;
    g.clear();
    const px = 1 / this.camera.zoom;
    const path = (points, color, dashed) => {
      if (points.length < 2) return;
      g.moveTo(points[0].x, points[0].y);
      for (const point of points.slice(1)) g.lineTo(point.x, point.y);
      g.stroke({ color: 0x05070b, width: 6 * px, alpha: 0.55, cap: "round", join: "round" });
      g.moveTo(points[0].x, points[0].y);
      for (const point of points.slice(1)) g.lineTo(point.x, point.y);
      g.stroke({ color, width: 2.6 * px, cap: "round", join: "round", alpha: dashed ? 0.8 : 1 });
      for (const point of points) {
        g.circle(point.x, point.y, 5 * px).fill({ color: 0x05070b });
        g.circle(point.x, point.y, 5 * px).stroke({ color, width: 2 * px });
      }
    };
    for (const ruler of this.props.rulers || []) path(ruler.points || [], parseColor(ruler.color, 0x43d9c0).color, true);
    const gesture = this.gesture;
    if (gesture?.kind === "ruler") path([gesture.from, gesture.to], 0x43d9c0);
    if (gesture?.kind === "token" && gesture.moved) path([gesture.origin, gesture.to], gesture.blocked ? 0xff6b7a : PRIMARY);
    if (gesture?.kind === "draw" && gesture.points.length > 1) {
      g.moveTo(gesture.points[0].x, gesture.points[0].y);
      for (const point of gesture.points.slice(1)) g.lineTo(point.x, point.y);
      g.stroke({ color: parseColor(this.props.drawColor, 0xffd166).color, width: Number(this.props.drawWidth) || 4, cap: "round", join: "round" });
    }
    if (this.chain?.cursor && this.chain.last) {
      g.moveTo(this.chain.last.x, this.chain.last.y).lineTo(this.chain.cursor.x, this.chain.cursor.y).stroke({ color: this.props.tool === "door" ? 0xf2b45a : 0xf5f0e1, width: 3 * px, alpha: 0.8 });
      g.circle(this.chain.cursor.x, this.chain.cursor.y, 4 * px).fill({ color: PRIMARY });
    } else if (this.props.editing && EDIT_TOOLS.has(this.props.tool) && this.cursorPoint) {
      g.circle(this.cursorPoint.x, this.cursorPoint.y, 4 * px).fill({ color: PRIMARY });
    }
  }

  cursor() {
    const tool = this.props.tool || "select";
    let cursor = "grab";
    if (this.gesture?.kind === "pan") cursor = "grabbing";
    else if (["ruler", "ping", "draw", "wall", "door", "column", "light"].includes(tool)) cursor = "crosshair";
    else if (this.hover || this.hoverDoor) cursor = "pointer";
    else if (this.hoverItem) cursor = "move";
    this.element.dataset.cursor = cursor;
  }

  findItem(id) {
    for (const ground of this.grounds()) {
      for (const layer of ground.children || []) {
        const index = (layer.items || []).findIndex((item) => item.id === id);
        if (index >= 0) return { ground, layer, item: layer.items[index], index };
      }
    }
    return null;
  }

  commit(action, mutate) {
    const next = structuredClone(this.map || {});
    const before = structuredClone(this.map || {});
    const view = {
      map: next,
      ground: () => (next.layers || []).filter((layer) => layer.type === "ground").find((ground) => ground.id === this.ground()?.id),
      layer: (type) => {
        const ground = view.ground();
        if (!ground) return null;
        ground.children = ground.children || [];
        const preferred = ground.children.find((layer) => layer.id === this.props.layerId && layer.type === type);
        if (preferred) return preferred;
        for (let index = ground.children.length - 1; index >= 0; index--) if (ground.children[index].type === type) return ground.children[index];
        const created = { id: newId(type), type, name: "", visible: true, shape: null, items: [] };
        ground.children.push(created);
        return created;
      },
      find: (id) => {
        for (const ground of (next.layers || []).filter((layer) => layer.type === "ground"))
          for (const layer of ground.children || []) {
            const index = (layer.items || []).findIndex((item) => item.id === id);
            if (index >= 0) return { layer, item: layer.items[index], index };
          }
        return null;
      },
    };
    if (mutate(view) === false) return;
    this.history.push(before);
    if (this.history.length > 80) this.history.shift();
    this.future = [];
    this.adopt(next, action);
  }

  adopt(map, action) {
    this.map = map;
    this.mapDirty = true;
    this.apply(this.props, this.props);
    this.emit("mapChange", { map, action });
  }

  undo() {
    if (!this.history.length) return;
    this.future.push(structuredClone(this.map));
    this.adopt(this.history.pop(), "undo");
  }

  redo() {
    if (!this.future.length) return;
    this.history.push(structuredClone(this.map));
    this.adopt(this.future.pop(), "redo");
  }

  select(selection) {
    this.selection = selection;
    this.drawEdit();
    this.emit("select", { kind: selection?.kind || "", id: selection?.id || "" });
  }

  snap(point, event, mode) {
    const snapSetting = mode === "vertex" ? this.map.placementSnap : this.map.movementSnap;
    if (event?.shiftKey || snapSetting === "none") return point;
    return gridSnap(point, this.grid(), mode);
  }

  hitToken(point) {
    const views = [...this.views.values()].reverse();
    for (const view of views) {
      const token = view.token;
      const radius = Math.min(Number(token.width) || 64, Number(token.height) || 64) / 2;
      if (Math.hypot(point.x - view.root.position.x, point.y - view.root.position.y) <= Math.max(radius, 10 / this.camera.zoom)) return view;
    }
    return null;
  }

  hitDoor(point) {
    const reach = 13 / this.camera.zoom;
    return (this.doorViews || []).find((door) => Math.abs(point.x - door.x) <= reach && Math.abs(point.y - door.y) <= reach && !(door.wall.secret && !this.props.gm) && door.seen !== false) || null;
  }

  hitEdit(point) {
    const reach = 9 / this.camera.zoom;
    if (this.selection?.kind === "image") {
      const found = this.findItem(this.selection.id);
      if (found) {
        const corner = this.corners(found.item).find((entry) => Math.hypot(entry.x - point.x, entry.y - point.y) <= reach);
        if (corner) return { kind: "image", id: found.item.id, corner };
      }
    }
    for (const light of this.items("light")) if (Math.hypot(light.x - point.x, light.y - point.y) <= 13 / this.camera.zoom) return { kind: "light", id: light.id };
    for (const wall of this.walls()) {
      if ((wall.column || wall.kind === "column") && wall.center) {
        if (Math.hypot(wall.center.x - point.x, wall.center.y - point.y) <= (Number(wall.radius) || 10) + reach) return { kind: "wall", id: wall.id, part: "column" };
        continue;
      }
      if (!wall.a || !wall.b) continue;
      if (Math.hypot(wall.a.x - point.x, wall.a.y - point.y) <= reach) return { kind: "wall", id: wall.id, part: "a" };
      if (Math.hypot(wall.b.x - point.x, wall.b.y - point.y) <= reach) return { kind: "wall", id: wall.id, part: "b" };
    }
    for (const wall of this.walls()) if (wall.a && wall.b && distanceToSegment(point, wall.a, wall.b) <= reach) return { kind: "wall", id: wall.id, part: "body" };
    const ground = this.ground();
    const layers = [...(ground?.children || [])].reverse().filter((layer) => layer.type === "object" || layer.type === "roof");
    const order = this.props.layerId ? [...layers.filter((layer) => layer.id === this.props.layerId), ...layers.filter((layer) => layer.id !== this.props.layerId)] : layers;
    for (const layer of order)
      for (const item of [...(layer.items || [])].reverse()) {
        const width = Number(item.width) || 100;
        const height = Number(item.height) || 100;
        if (point.x >= item.x && point.x <= item.x + width && point.y >= item.y && point.y <= item.y + height) return { kind: "image", id: item.id };
      }
    return null;
  }

  bind() {
    const node = this.element;
    this.on(node, "contextmenu", (event) => event.preventDefault());
    this.on(node, "wheel", (event) => {
      if (!this.world) return;
      event.preventDefault();
      this.glide = null;
      this.zoomBy(Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.0016)), { x: event.clientX, y: event.clientY });
    }, { passive: false });
    this.on(node, "pointerdown", (event) => this.down(event));
    this.on(node, "pointermove", (event) => this.move(event));
    this.on(node, "pointerup", (event) => this.up(event));
    this.on(node, "pointercancel", (event) => this.up(event, true));
    this.on(node, "pointerleave", () => {
      if (this.gesture) return;
      this.hover = null;
      this.hoverDoor = null;
      this.cursorPoint = null;
      for (const view of this.views.values()) this.styleToken(view);
      this.drawOverlay();
    });
    this.on(node, "dblclick", (event) => {
      if (!this.world || event.target.closest(".ez-zoom")) return;
      if (this.chain) {
        this.chain = null;
        this.drawOverlay();
        return;
      }
      const view = this.hitToken(this.toWorld(event.clientX, event.clientY));
      if (view) this.emit("tokenOpen", { id: view.token.id });
    });
    this.on(node, "keydown", (event) => this.key(event));
    this.on(node, "dragover", (event) => {
      event.preventDefault();
      this.dropHint.hidden = false;
    });
    this.on(node, "dragleave", (event) => {
      if (!node.contains(event.relatedTarget)) this.dropHint.hidden = true;
    });
    this.on(node, "drop", (event) => {
      event.preventDefault();
      this.dropHint.hidden = true;
      if (!this.world) return;
      const point = this.toWorld(event.clientX, event.clientY);
      let data = {};
      try {
        data = JSON.parse(event.dataTransfer.getData("application/x-easel-kit") || "{}");
      } catch {}
      const files = [...(event.dataTransfer.files || [])];
      if (files.length) data = { ...data, kind: "files", files };
      if (!Object.keys(data).length) return;
      const snapped = this.snap(point, event, "center");
      this.emit("drop", { data, x: snapped.x, y: snapped.y, groundId: this.ground()?.id || "" });
    });
  }

  down(event) {
    if (!this.world || event.target.closest(".ez-zoom")) return;
    this.element.focus({ preventScroll: true });
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    try {
      this.element.setPointerCapture(event.pointerId);
    } catch {}
    this.glide = null;
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.gesture = { kind: "pinch", distance: Math.hypot(a.x - b.x, a.y - b.y), zoom: this.camera.zoom };
      return;
    }
    const point = this.toWorld(event.clientX, event.clientY);
    const start = { x: event.clientX, y: event.clientY };
    const pan = () => (this.gesture = { kind: "pan", start, camera: { ...this.camera }, button: event.button, moved: false, point });
    if (event.button !== 0) return pan();
    const tool = this.props.tool || "select";
    if (event.altKey || tool === "ping") {
      this.emit("ping", { x: point.x, y: point.y });
      this.gesture = { kind: "none" };
      return;
    }
    if (tool === "ruler") {
      const from = this.snap(point, event, "center");
      this.gesture = { kind: "ruler", from, to: from };
      return;
    }
    if (tool === "draw") {
      this.gesture = { kind: "draw", points: [point] };
      return;
    }
    if (this.props.editing && EDIT_TOOLS.has(tool)) {
      this.gesture = { kind: "place", start, point, moved: false, camera: { ...this.camera } };
      return;
    }
    if (this.props.editing) {
      const hit = this.hitEdit(point);
      if (hit) {
        this.select({ kind: hit.kind, id: hit.id });
        const found = this.findItem(hit.id);
        this.gesture = { kind: "item", hit, start: point, original: structuredClone(found.item), moved: false };
        return;
      }
    } else {
      const door = this.hitDoor(point);
      if (door) {
        this.gesture = { kind: "door", door, start };
        return;
      }
    }
    const view = this.hitToken(point);
    if (view) {
      const token = view.token;
      const selected = new Set(this.props.selectedTokenIds || []);
      let ids;
      if (event.shiftKey || event.ctrlKey || event.metaKey) {
        if (selected.has(token.id)) selected.delete(token.id);
        else selected.add(token.id);
        ids = [...selected];
      } else ids = selected.has(token.id) ? [...selected] : [token.id];
      this.emit("tokenSelect", { ids });
      if (token.controllable) {
        const moving = ids.map((id) => this.views.get(id)).filter((entry) => entry?.token.controllable);
        this.gesture = { kind: "token", view, moving, start: point, origin: { x: view.root.position.x, y: view.root.position.y }, to: { x: view.root.position.x, y: view.root.position.y }, offsets: moving.map((entry) => ({ x: entry.root.position.x - view.root.position.x, y: entry.root.position.y - view.root.position.y })), moved: false };
      } else this.gesture = { kind: "none" };
      return;
    }
    pan();
    this.gesture.clear = true;
  }

  move(event) {
    if (!this.world) return;
    if (this.pointers.has(event.pointerId)) this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const point = this.toWorld(event.clientX, event.clientY);
    const gesture = this.gesture;
    if (gesture?.kind === "pinch" && this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const before = this.toWorld(middle.x, middle.y);
      this.camera.zoom = clamp((gesture.zoom * Math.hypot(a.x - b.x, a.y - b.y)) / Math.max(1, gesture.distance), 0.03, 8);
      this.place();
      const after = this.toWorld(middle.x, middle.y);
      this.camera.x += before.x - after.x;
      this.camera.y += before.y - after.y;
      this.place();
      return;
    }
    if (gesture?.kind === "pan" || gesture?.kind === "place") {
      const dx = event.clientX - gesture.start.x;
      const dy = event.clientY - gesture.start.y;
      if (!gesture.moved && Math.hypot(dx, dy) < 4) return;
      gesture.moved = true;
      this.autoFit = false;
      this.camera.x = gesture.camera.x - dx / this.camera.zoom;
      this.camera.y = gesture.camera.y - dy / this.camera.zoom;
      this.place();
      this.element.dataset.cursor = "grabbing";
      return;
    }
    if (gesture?.kind === "ruler") {
      gesture.to = this.snap(point, event, "center");
      this.showDistance(gesture.from, gesture.to);
      this.drawOverlay();
      this.sendRuler([gesture.from, gesture.to]);
      return;
    }
    if (gesture?.kind === "draw") {
      const last = gesture.points[gesture.points.length - 1];
      if (Math.hypot(point.x - last.x, point.y - last.y) > 3 / this.camera.zoom) gesture.points.push(point);
      this.drawOverlay();
      return;
    }
    if (gesture?.kind === "token") {
      if (!gesture.moved && Math.hypot(point.x - gesture.start.x, point.y - gesture.start.y) < 5 / this.camera.zoom) return;
      gesture.moved = true;
      const raw = { x: gesture.origin.x + point.x - gesture.start.x, y: gesture.origin.y + point.y - gesture.start.y };
      const token = gesture.view.token;
      const to = event.shiftKey || this.map.movementSnap === "none" ? raw : gridSnap(raw, this.grid(), "center", token);
      gesture.to = to;
      gesture.blocked = !this.props.gm && movementBlocked(gesture.origin, to, this.segments, Math.min(Number(token.width) || 64, Number(token.height) || 64) * 0.4);
      gesture.moving.forEach((entry, index) => {
        entry.dragging = true;
        entry.root.position.set(to.x + gesture.offsets[index].x, to.y + gesture.offsets[index].y);
        entry.root.alpha = 0.8;
      });
      this.fogDirty = true;
      this.lightDirty = gesture.moving.some((entry) => entry.token.light);
      this.showDistance(gesture.origin, to);
      this.drawOverlay();
      return;
    }
    if (gesture?.kind === "item") {
      const dx = point.x - gesture.start.x;
      const dy = point.y - gesture.start.y;
      if (!gesture.moved && Math.hypot(dx, dy) < 3 / this.camera.zoom) return;
      gesture.moved = true;
      const found = this.findItem(gesture.hit.id);
      if (!found) return;
      this.shape(found.item, gesture, point, event);
      this.segments = wallSegments(this.walls());
      this.lightDirty = true;
      this.fogDirty = true;
      if (gesture.hit.kind === "image") this.drawStatic();
      this.drawEdit();
      return;
    }
    if (this.chain) {
      this.chain.cursor = this.snap(point, event, "vertex");
      this.drawOverlay();
      return;
    }
    if (this.props.editing && EDIT_TOOLS.has(this.props.tool)) {
      this.cursorPoint = this.snap(point, event, "vertex");
      this.drawOverlay();
      return;
    }
    const view = this.hitToken(point);
    const door = this.props.editing ? null : this.hitDoor(point);
    const hover = view?.token.id || null;
    const item = this.props.editing && (this.props.tool || "select") === "select" ? this.hitEdit(point) : null;
    if (hover !== this.hover || (door?.wall.id || null) !== this.hoverDoor || !!item !== !!this.hoverItem) {
      this.hover = hover;
      this.hoverDoor = door?.wall.id || null;
      this.hoverItem = item;
      for (const entry of this.views.values()) this.styleToken(entry);
      this.drawEdit();
      this.cursor();
    }
  }

  shape(item, gesture, point, event) {
    const original = gesture.original;
    const dx = point.x - gesture.start.x;
    const dy = point.y - gesture.start.y;
    const hit = gesture.hit;
    if (hit.kind === "light") {
      const next = this.snap({ x: original.x + dx, y: original.y + dy }, event, "vertex");
      item.x = next.x;
      item.y = next.y;
    } else if (hit.kind === "wall") {
      if (hit.part === "a" || hit.part === "b") item[hit.part] = this.snap(point, event, "vertex");
      else if (hit.part === "column") item.center = this.snap({ x: original.center.x + dx, y: original.center.y + dy }, event, "vertex");
      else {
        const a = this.snap({ x: original.a.x + dx, y: original.a.y + dy }, event, "vertex");
        item.a = a;
        item.b = { x: original.b.x + (a.x - original.a.x), y: original.b.y + (a.y - original.a.y) };
      }
    } else if (hit.kind === "image") {
      const width = Number(original.width) || 100;
      const height = Number(original.height) || 100;
      if (hit.corner) {
        const fixed = { x: hit.corner.sx < 0 ? original.x + width : original.x, y: hit.corner.sy < 0 ? original.y + height : original.y };
        let nextWidth = Math.max(8, Math.abs(point.x - fixed.x));
        let nextHeight = Math.max(8, Math.abs(point.y - fixed.y));
        if (!event.shiftKey) {
          const ratio = Math.max(nextWidth / width, nextHeight / height);
          nextWidth = width * ratio;
          nextHeight = height * ratio;
        }
        item.width = nextWidth;
        item.height = nextHeight;
        item.x = hit.corner.sx < 0 ? fixed.x - nextWidth : fixed.x;
        item.y = hit.corner.sy < 0 ? fixed.y - nextHeight : fixed.y;
      } else {
        item.x = original.x + dx;
        item.y = original.y + dy;
      }
    }
  }

  up(event, cancelled = false) {
    if (!this.world) return;
    this.pointers.delete(event.pointerId);
    try {
      this.element.releasePointerCapture(event.pointerId);
    } catch {}
    const gesture = this.gesture;
    this.gesture = null;
    this.readout.hidden = true;
    if (!gesture) return;
    const point = this.toWorld(event.clientX, event.clientY);
    if (gesture.kind === "pinch") {
      this.announceCamera();
    } else if (gesture.kind === "pan") {
      if (gesture.moved) this.announceCamera();
      else if (gesture.button === 2) this.context(event, point);
      else if (gesture.clear && !cancelled) {
        if ((this.props.selectedTokenIds || []).length) this.emit("tokenSelect", { ids: [] });
        if (this.selection) this.select(null);
      }
    } else if (gesture.kind === "ruler") {
      this.sendRuler([]);
    } else if (gesture.kind === "draw") {
      if (!cancelled && gesture.points.length > 1) {
        const drawing = { id: newId("drawing"), points: gesture.points.map((entry) => ({ x: Math.round(entry.x), y: Math.round(entry.y) })), color: this.props.drawColor || "#ffd166", strokeWidth: Number(this.props.drawWidth) || 4 };
        if (this.props.editing) this.commit("draw", (view) => void view.layer("drawing")?.items.push(drawing));
        else this.emit("draw", { drawing, groundId: this.ground()?.id || "" });
      }
    } else if (gesture.kind === "door") {
      if (!cancelled && Math.hypot(event.clientX - gesture.start.x, event.clientY - gesture.start.y) < 6) this.emit("doorToggle", { id: gesture.door.wall.id, open: !gesture.door.wall.open });
    } else if (gesture.kind === "token") {
      for (const entry of gesture.moving) {
        entry.dragging = false;
        entry.key = "";
      }
      if (gesture.moved && !cancelled && !gesture.blocked) {
        gesture.moving.forEach((entry, index) => {
          const x = gesture.to.x + gesture.offsets[index].x;
          const y = gesture.to.y + gesture.offsets[index].y;
          entry.token = { ...entry.token, x, y };
          this.emit("tokenMove", { id: entry.token.id, x, y, groundId: this.ground()?.id || "" });
        });
      } else if (gesture.moved) {
        for (const entry of gesture.moving) entry.tween = { fromX: entry.root.position.x, fromY: entry.root.position.y, time: 0 };
        if (gesture.blocked) this.emit("notice", { message: "Something is in the way." });
      }
      for (const entry of gesture.moving) this.styleToken(entry);
      this.fogDirty = true;
    } else if (gesture.kind === "item") {
      if (gesture.moved && !cancelled) {
        const found = this.findItem(gesture.hit.id);
        const changed = structuredClone(found.item);
        Object.assign(found.item, gesture.original);
        for (const key of Object.keys(found.item)) if (!(key in gesture.original)) delete found.item[key];
        this.commit("move", (view) => {
          const target = view.find(gesture.hit.id);
          if (!target) return false;
          target.layer.items[target.index] = changed;
        });
      } else if (gesture.moved) {
        const found = this.findItem(gesture.hit.id);
        if (found) Object.assign(found.item, gesture.original);
        this.mapDirty = true;
        this.apply(this.props, this.props);
      }
    } else if (gesture.kind === "place") {
      if (gesture.moved) this.announceCamera();
      else if (!cancelled) this.placeAt(this.snap(gesture.point, event, "vertex"), event);
    }
    this.drawOverlay();
    this.cursor();
  }

  placeAt(point, event) {
    const tool = this.props.tool;
    if (tool === "light") {
      const light = { id: newId("light"), x: point.x, y: point.y, intensity: 1, color: "#ffe2b0", enabled: true };
      this.commit("light", (view) => void view.layer("light")?.items.push(light));
      this.select({ kind: "light", id: light.id });
      return;
    }
    if (tool === "column") {
      const column = { id: newId("column"), column: true, kind: "column", center: point, radius: (Number(this.grid().size) || 100) / 4 };
      this.commit("column", (view) => void view.layer("wall")?.items.push(column));
      this.select({ kind: "wall", id: column.id });
      return;
    }
    if (!this.chain) {
      this.chain = { last: point, cursor: point };
      return;
    }
    const from = this.chain.last;
    if (Math.hypot(point.x - from.x, point.y - from.y) < 2) {
      this.chain = null;
      return;
    }
    const wall = { id: newId(tool === "door" ? "door" : "wall"), a: from, b: point, ...(tool === "door" ? { door: true, kind: "door", open: false } : { kind: "wall" }) };
    this.commit(tool, (view) => void view.layer("wall")?.items.push(wall));
    this.chain = tool === "door" && !event.ctrlKey ? null : { last: point, cursor: point };
  }

  context(event, point) {
    const view = this.hitToken(point);
    if (view) {
      this.emit("tokenContext", { id: view.token.id, clientX: event.clientX, clientY: event.clientY });
      return;
    }
    const hit = this.props.editing ? this.hitEdit(point) : null;
    if (hit) this.select({ kind: hit.kind, id: hit.id });
    this.emit("context", { x: point.x, y: point.y, clientX: event.clientX, clientY: event.clientY, kind: hit?.kind || "", id: hit?.id || "" });
  }

  showDistance(from, to) {
    const grid = this.grid();
    const value = gridDistance(from, to, grid, this.props.distanceRule || "chebyshev");
    const label = grid.relativesize?.label ?? "ft";
    this.readout.textContent = (Math.round(value * 10) / 10).toLocaleString() + " " + label;
    this.readout.hidden = false;
  }

  sendRuler(points) {
    const now = performance.now();
    if (points.length && now - (this.rulerSent || 0) < 80) return;
    this.rulerSent = now;
    this.emit("ruler", { points: points.map((point) => ({ x: Math.round(point.x), y: Math.round(point.y) })) });
  }

  key(event) {
    if (typing(event) || !this.world) return;
    const control = event.ctrlKey || event.metaKey;
    if (event.key === "Escape") {
      if (this.chain) this.chain = null;
      else if (this.selection) this.select(null);
      else if ((this.props.selectedTokenIds || []).length) this.emit("tokenSelect", { ids: [] });
      else return;
      this.drawOverlay();
      event.preventDefault();
      return;
    }
    if (this.props.editing && control && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) this.redo();
      else this.undo();
      return;
    }
    if (this.props.editing && control && event.key.toLowerCase() === "y") {
      event.preventDefault();
      this.redo();
      return;
    }
    if ((event.key === "Delete" || event.key === "Backspace") && this.props.editing && this.selection) {
      event.preventDefault();
      const id = this.selection.id;
      this.selection = null;
      this.commit("delete", (view) => {
        const target = view.find(id);
        if (!target) return false;
        target.layer.items.splice(target.index, 1);
      });
      this.emit("select", { kind: "", id: "" });
      return;
    }
    if ((event.key === "Delete" || event.key === "Backspace") && !this.props.editing && (this.props.selectedTokenIds || []).length) {
      event.preventDefault();
      this.emit("tokenDelete", { ids: [...this.props.selectedTokenIds] });
      return;
    }
    if (event.key === "+" || event.key === "=") return void this.zoomBy(1.2);
    if (event.key === "-") return void this.zoomBy(1 / 1.2);
    if (event.key === "0") {
      this.autoFit = true;
      return void this.fit(true);
    }
    const step = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0] }[event.key.length === 1 ? event.key.toLowerCase() : event.key];
    if (!step || control) return;
    const ids = this.props.selectedTokenIds || [];
    const moving = ids.map((id) => this.views.get(id)).filter((view) => view?.token.controllable);
    if (!moving.length) {
      const pan = 60 / this.camera.zoom;
      this.camera.x += step[0] * pan;
      this.camera.y += step[1] * pan;
      this.place();
      event.preventDefault();
      return;
    }
    event.preventDefault();
    const cell = event.shiftKey ? 1 : Number(this.grid().size) || 100;
    for (const view of moving) {
      const from = { x: view.token.x, y: view.token.y };
      const to = { x: from.x + step[0] * cell, y: from.y + step[1] * cell };
      if (!this.props.gm && movementBlocked(from, to, this.segments, Math.min(Number(view.token.width) || 64, Number(view.token.height) || 64) * 0.4)) continue;
      this.emit("tokenMove", { id: view.token.id, x: to.x, y: to.y, groundId: this.ground()?.id || "" });
    }
  }

  destroy() {
    clearTimeout(this.cameraTimer);
    this.observer?.disconnect();
    for (const target of Object.values(this.targets || {})) target.destroy(true);
    try {
      this.app?.destroy(true, { children: true });
    } catch {}
    this.app = null;
    this.world = null;
    super.destroy();
  }
}
