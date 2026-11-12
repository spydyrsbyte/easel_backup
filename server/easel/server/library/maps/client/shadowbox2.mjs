import { Component, h, icon, clamp, typing, safeUrl, sameJSON } from "./ui.mjs";

let boundEasel = null;

export function initialize({ Easel }) {
  boundEasel = Easel;
}

const PRIMARY = 0x8b9dff;
const sources = new Map();

function parseColor(value, fallback = 0xffffff) {
  if (typeof value === "number" && Number.isFinite(value)) return value & 0xffffff;
  if (typeof value !== "string") return fallback;
  let text = value.trim().replace(/^#/, "");
  if (text.length === 3) text = [...text].map((part) => part + part).join("");
  return /^[0-9a-f]{6}/i.test(text) ? parseInt(text.slice(0, 6), 16) : fallback;
}

function loadImage(url) {
  if (!sources.has(url)) {
    sources.set(
      url,
      new Promise((resolve) => {
        const image = new Image();
        if (!url.startsWith(location.origin) && !url.startsWith("blob:") && !url.startsWith("data:")) image.crossOrigin = "anonymous";
        image.onload = () => resolve(image);
        image.onerror = () => {
          sources.delete(url);
          resolve(null);
        };
        image.src = url;
      }),
    );
  }
  return sources.get(url);
}

function keyOut(image, keys) {
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  let pixels;
  try {
    pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  } catch {
    return image;
  }
  const data = pixels.data;
  const parsed = keys.slice(0, 8).map((key) => {
    const color = parseColor(key.color, 0);
    return { r: (color >> 16) & 255, g: (color >> 8) & 255, b: color & 255, tolerance: clamp(Number(key.tolerance ?? 0.1), 0, 1) };
  });
  for (let index = 0; index < data.length; index += 4) {
    let alpha = data[index + 3] / 255;
    for (const key of parsed) {
      const distance = Math.hypot(data[index] - key.r, data[index + 1] - key.g, data[index + 2] - key.b) / 441.673;
      const edge = clamp((distance - key.tolerance) / 0.04, 0, 1);
      alpha *= edge * edge * (3 - 2 * edge);
    }
    data[index + 3] = Math.round(alpha * 255);
  }
  context.putImageData(pixels, 0, 0);
  return canvas;
}

function flatten(elements, visible = true, depth = [], out = []) {
  for (let index = (elements || []).length - 1; index >= 0; index--) {
    const element = elements[index];
    if (!element) continue;
    const shown = visible && element.visible !== false;
    if (element.kind === "group") flatten(element.children, shown, [...depth, element.id], out);
    else out.push({ element, shown });
  }
  return out;
}

function findElement(elements, id, parent = null) {
  for (let index = 0; index < (elements || []).length; index++) {
    const element = elements[index];
    if (element.id === id) return { element, siblings: elements, index, parent };
    if (element.kind === "group") {
      const nested = findElement(element.children, id, element);
      if (nested) return nested;
    }
  }
  return null;
}

export default class ShadowBox extends Component {
  constructor() {
    super("easel.maps.shadowbox", "div");
    this.element.classList.add("ez-shadowbox");
    this.element.tabIndex = 0;
    this.views = new Map();
    this.history = [];
    this.future = [];
    this.box = {};
    this.toggles = h("div", { class: "ez-shadowbox-toggles ez-glass", hidden: true });
    this.empty = h("div", { class: "ez-map-empty", hidden: true });
    this.element.append(this.empty, this.toggles);
    this.ready = this.start();
    this.bind();
  }

  async start() {
    const host = boundEasel || globalThis.Easel;
    this.P = host.Interfaces.create("easel.graphics.pixi@1");
    const P = this.P;
    const app = new P.Application();
    await app.init({ background: 0x000000, antialias: true, autoDensity: true, resolution: Math.min(2, globalThis.devicePixelRatio || 1), width: 300, height: 200, preference: "webgl" });
    if (this.signal.aborted) {
      app.destroy(true);
      return;
    }
    this.app = app;
    this.element.prepend(app.canvas);
    this.stage = new P.Container();
    this.backing = new P.Graphics();
    this.content = new P.Container();
    this.clip = new P.Graphics();
    this.handles = new P.Graphics();
    this.stage.addChild(this.backing, this.content, this.clip, this.handles);
    this.content.mask = this.clip;
    app.stage.addChild(this.stage);
    this.glowTexture = this.makeGlow();
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(this.element);
    this.resize();
    app.ticker.add((ticker) => this.tick(ticker.deltaMS));
    this.apply(this.props, {});
  }

  makeGlow() {
    const size = 256;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const context = canvas.getContext("2d");
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, "rgba(255,255,255,0.9)");
    gradient.addColorStop(0.4, "rgba(255,255,255,0.35)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
    return this.P.Texture.from(canvas);
  }

  size() {
    const width = Math.max(16, Number(this.box.width) || 1600);
    const ratio = this.box.ratio || {};
    const height = Number(this.box.height) > 0 && !ratio.width ? Number(this.box.height) : (width * (Number(ratio.height) || 9)) / (Number(ratio.width) || 16);
    return { width, height };
  }

  render(props, previous) {
    if (!sameJSON(props.box, previous.box)) this.box = props.box || {};
    this.props = props;
    if (this.app) this.apply(props, previous);
  }

  apply(props, previous) {
    if (props.boxKey !== previous.boxKey) {
      this.history = [];
      this.future = [];
      for (const view of this.views.values()) view.root.destroy({ children: true });
      this.views.clear();
    }
    this.sync();
    this.resize();
    const hasContent = (this.box.elements || []).length > 0;
    this.empty.hidden = hasContent || !!props.editing;
    if (!hasContent && !this.empty.firstChild) this.empty.append(h("div", { class: "ez-empty" }, icon("theater", 34), h("strong", { text: "The stage is empty" }), h("span", { text: "Add images and dialogue to build a scene." })));
    const toggles = props.canRun && !props.editing ? this.box.toggles || [] : [];
    this.toggles.hidden = !toggles.length;
    this.toggles.replaceChildren(
      ...toggles.map((toggle) => {
        const node = h("button", { type: "button", class: "ez-btn ez-btn-small", "aria-pressed": String(!!toggle.on), text: toggle.name || "Toggle" });
        node.addEventListener("click", () => this.emit("toggle", { id: String(toggle.id), on: !toggle.on }));
        return node;
      }),
    );
  }

  resize() {
    if (!this.app) return;
    const width = Math.max(1, this.element.clientWidth);
    const height = Math.max(1, this.element.clientHeight);
    this.app.renderer.resize(width, height);
    const size = this.size();
    const inset = this.props.insets || {};
    const left = Number(inset.left) || 0;
    const right = Number(inset.right) || 0;
    const top = Number(inset.top) || 0;
    const bottom = Number(inset.bottom) || 0;
    const availableWidth = Math.max(40, width - left - right);
    const availableHeight = Math.max(40, height - top - bottom);
    const margin = this.props.editing ? 0.86 : 1;
    this.scale = Math.min(availableWidth / size.width, availableHeight / size.height) * margin;
    this.stage.scale.set(this.scale);
    this.stage.position.set(left + (availableWidth - size.width * this.scale) / 2, top + (availableHeight - size.height * this.scale) / 2);
    this.backing.clear().rect(0, 0, size.width, size.height).fill({ color: 0x05060a });
    if (this.props.editing) this.backing.rect(0, 0, size.width, size.height).stroke({ color: 0xffffff, alpha: 0.25, width: 2 / this.scale });
    this.clip.clear().rect(0, 0, size.width, size.height).fill({ color: 0xffffff });
    this.toggles.style.marginLeft = (left - right) / 2 + "px";
    this.drawHandles();
  }

  sync() {
    const P = this.P;
    const flat = flatten(this.box.elements);
    const seen = new Set();
    flat.forEach(({ element, shown }, order) => {
      seen.add(element.id);
      let view = this.views.get(element.id);
      if (!view) {
        const root = new P.Container();
        root.alpha = 0;
        view = { root, alpha: 0, kind: element.kind };
        if (element.kind === "dialogue") {
          view.panel = new P.Graphics();
          view.art = new P.Sprite();
          view.art.visible = false;
          view.speaker = new P.Text({ text: "", style: { fontFamily: "Segoe UI, system-ui, sans-serif", fontWeight: "700", fontSize: 20, fill: 0xffffff, letterSpacing: 2 } });
          view.text = new P.Text({ text: "", style: { fontFamily: "Georgia, serif", fontSize: 36, fill: 0xffffff, wordWrap: true, wordWrapWidth: 400, lineHeight: 46 } });
          root.addChild(view.panel, view.art, view.speaker, view.text);
        } else {
          view.glow = new P.Sprite(this.glowTexture);
          view.glow.anchor.set(0.5);
          view.glow.blendMode = "add";
          view.glow.visible = false;
          view.sprite = new P.Sprite();
          view.sprite.anchor.set(0.5);
          root.addChild(view.sprite, view.glow);
        }
        this.views.set(element.id, view);
        this.content.addChild(root);
      }
      view.element = element;
      view.shown = shown;
      this.content.setChildIndex(view.root, Math.min(order, this.content.children.length - 1));
      if (element.kind === "dialogue") this.styleDialogue(view);
      else this.styleImage(view);
    });
    for (const [id, view] of this.views) {
      if (seen.has(id)) continue;
      view.root.destroy({ children: true });
      this.views.delete(id);
    }
  }

  wanted(view) {
    if (view.shown) return 1;
    if (!this.props.editing) return 0;
    return this.props.selectedId === view.element.id || this.props.previewId === view.element.id ? 0.35 : 0;
  }

  styleImage(view) {
    const P = this.P;
    const element = view.element;
    const width = Math.max(1, Number(element.width) || 200);
    const height = Math.max(1, Number(element.height) || 200);
    view.root.position.set((Number(element.x) || 0) + width / 2, (Number(element.y) || 0) + height / 2);
    view.root.rotation = ((Number(element.rotation) || 0) * Math.PI) / 180;
    const keys = Array.isArray(element.transparency) ? element.transparency : [];
    const signature = String(element.key || element.image || "") + "|" + JSON.stringify(keys);
    if (view.signature !== signature) {
      view.signature = signature;
      view.sprite.visible = false;
      const url = safeUrl(element.key || element.image || "");
      if (url)
        loadImage(url).then((image) => {
          if (!image || view.signature !== signature || view.root.destroyed) return;
          view.sprite.texture = P.Texture.from(keys.length ? keyOut(image, keys) : image);
          view.sprite.visible = true;
          this.styleImage(view);
        });
    }
    if (view.sprite.visible && view.sprite.texture) {
      view.sprite.scale.set((width / view.sprite.texture.width) * (element.flipH ? -1 : 1), (height / view.sprite.texture.height) * (element.flipV ? -1 : 1));
    }
    view.sprite.tint = parseColor(element.tint, 0xffffff);
    view.opacity = clamp(Number(element.alpha ?? 1), 0, 1);
    const saturation = Number(element.saturation ?? 1);
    const contrast = Number(element.contrast ?? 1);
    if (Math.abs(saturation - 1) > 0.01 || Math.abs(contrast - 1) > 0.01) {
      const filter = new P.ColorMatrixFilter();
      filter.saturate(saturation - 1, false);
      if (Math.abs(contrast - 1) > 0.01) filter.contrast(contrast - 1, true);
      view.sprite.filters = [filter];
    } else view.sprite.filters = null;
    const luminance = Math.max(0, Number(element.luminance) || 0);
    view.glow.visible = luminance > 0;
    if (luminance > 0) {
      view.glow.tint = parseColor(element.tint, 0xffffff);
      view.glow.width = view.glow.height = Math.max(width, height) * 2.4;
      view.glow.alpha = clamp(luminance, 0, 2) / 2;
    }
  }

  styleDialogue(view) {
    const element = view.element;
    const width = Math.max(40, Number(element.width) || 900);
    const height = Math.max(40, Number(element.height) || 220);
    view.root.position.set((Number(element.x) || 0) + width / 2, (Number(element.y) || 0) + height / 2);
    view.root.rotation = ((Number(element.rotation) || 0) * Math.PI) / 180;
    const background = element.background || {};
    const opacity = clamp(Number(background.opacity ?? 0.72), 0, 1);
    const radius = Math.min(26, height / 5);
    view.panel.clear();
    view.panel.roundRect(-width / 2, -height / 2, width, height, radius).fill({ color: parseColor(background.color, 0x0a0c14), alpha: opacity });
    view.panel.roundRect(-width / 2, -height / 2, width, height, radius).stroke({ color: 0xffffff, alpha: 0.16, width: 2 });
    const fontSize = Math.max(8, Number(element.fontSize) || 36);
    const pad = fontSize * 0.75;
    const speaker = String(element.speaker || "");
    view.speaker.text = speaker.toUpperCase();
    view.speaker.visible = !!speaker;
    view.speaker.style.fontSize = Math.max(10, fontSize * 0.5);
    view.speaker.style.fill = parseColor(element.accent, 0xd9b872);
    view.speaker.position.set(-width / 2 + pad, -height / 2 + pad * 0.7);
    const full = String(element.text || "");
    if (view.full !== full) {
      view.full = full;
      view.typed = this.props.editing ? full.length : 0;
    }
    view.text.style.fontSize = fontSize;
    view.text.style.lineHeight = fontSize * 1.32;
    view.text.style.fill = parseColor(element.color, 0xffffff);
    view.text.style.wordWrapWidth = Math.max(20, width - pad * 2);
    view.text.position.set(-width / 2 + pad, -height / 2 + pad * (speaker ? 1.9 : 0.8));
    view.text.text = full.slice(0, Math.floor(view.typed));
    view.opacity = 1;
    const image = safeUrl(background.image || element.key || "");
    if (view.artSource !== image) {
      view.artSource = image;
      view.art.visible = false;
      if (image)
        loadImage(image).then((loaded) => {
          if (!loaded || view.artSource !== image || view.root.destroyed) return;
          view.art.texture = this.P.Texture.from(loaded);
          view.art.visible = true;
          this.styleDialogue(view);
        });
    }
    if (view.art.visible) {
      view.art.position.set(-width / 2, -height / 2);
      view.art.width = width;
      view.art.height = height;
      view.art.alpha = opacity;
    }
  }

  tick(delta) {
    for (const view of this.views.values()) {
      const target = this.wanted(view) * (view.opacity ?? 1);
      if (Math.abs(view.root.alpha - target) > 0.002) view.root.alpha += (target - view.root.alpha) * Math.min(1, delta / 160);
      else view.root.alpha = target;
      view.root.visible = view.root.alpha > 0.003;
      if (view.kind === "dialogue" && view.typed < (view.full || "").length && view.shown) {
        view.typed = Math.min(view.full.length, view.typed + delta / 22);
        view.text.text = view.full.slice(0, Math.floor(view.typed));
      }
    }
  }

  corners(element) {
    const width = Number(element.width) || 200;
    const height = Number(element.height) || 200;
    const angle = ((Number(element.rotation) || 0) * Math.PI) / 180;
    const cx = (Number(element.x) || 0) + width / 2;
    const cy = (Number(element.y) || 0) + height / 2;
    const turn = (x, y) => ({ x: cx + x * Math.cos(angle) - y * Math.sin(angle), y: cy + x * Math.sin(angle) + y * Math.cos(angle) });
    const sides = [
      [-1, -1],
      [0, -1],
      [1, -1],
      [1, 0],
      [1, 1],
      [0, 1],
      [-1, 1],
      [-1, 0],
    ];
    return {
      center: { x: cx, y: cy },
      angle,
      width,
      height,
      box: [turn(-width / 2, -height / 2), turn(width / 2, -height / 2), turn(width / 2, height / 2), turn(-width / 2, height / 2)],
      handles: sides.map(([sx, sy]) => ({ sx, sy, ...turn((sx * width) / 2, (sy * height) / 2) })),
      knob: turn(0, -height / 2 - 30 / this.scale),
    };
  }

  drawHandles() {
    if (!this.handles) return;
    const g = this.handles;
    g.clear();
    if (!this.props.editing || !this.props.selectedId) return;
    const found = findElement(this.box.elements, this.props.selectedId);
    if (!found || found.element.kind === "group") return;
    const shape = this.corners(found.element);
    const px = 1 / this.scale;
    g.poly(shape.box.flatMap((point) => [point.x, point.y])).stroke({ color: PRIMARY, width: 2 * px });
    const top = shape.handles[1];
    g.moveTo(top.x, top.y).lineTo(shape.knob.x, shape.knob.y).stroke({ color: PRIMARY, width: 1.5 * px });
    g.circle(shape.knob.x, shape.knob.y, 7 * px).fill({ color: PRIMARY });
    for (const handle of shape.handles) {
      g.rect(handle.x - 6 * px, handle.y - 6 * px, 12 * px, 12 * px).fill({ color: 0x0d1017 });
      g.rect(handle.x - 6 * px, handle.y - 6 * px, 12 * px, 12 * px).stroke({ color: PRIMARY, width: 1.5 * px });
    }
  }

  toStage(clientX, clientY) {
    const bounds = this.element.getBoundingClientRect();
    return { x: (clientX - bounds.left - this.stage.position.x) / this.scale, y: (clientY - bounds.top - this.stage.position.y) / this.scale };
  }

  hit(point) {
    const flat = flatten(this.box.elements).reverse();
    for (const { element, shown } of flat) {
      if (!shown && this.props.selectedId !== element.id) continue;
      const shape = this.corners(element);
      const dx = point.x - shape.center.x;
      const dy = point.y - shape.center.y;
      const lx = dx * Math.cos(-shape.angle) - dy * Math.sin(-shape.angle);
      const ly = dx * Math.sin(-shape.angle) + dy * Math.cos(-shape.angle);
      if (Math.abs(lx) <= shape.width / 2 && Math.abs(ly) <= shape.height / 2) return element;
    }
    return null;
  }

  commit(action, mutate) {
    const next = structuredClone(this.box || {});
    const before = structuredClone(this.box || {});
    if (mutate(next) === false) return;
    this.history.push(before);
    if (this.history.length > 80) this.history.shift();
    this.future = [];
    this.adopt(next, action);
  }

  adopt(box, action) {
    this.box = box;
    this.sync();
    this.drawHandles();
    this.emit("boxChange", { box, action });
  }

  bind() {
    const node = this.element;
    this.on(node, "contextmenu", (event) => event.preventDefault());
    this.on(node, "pointerdown", (event) => {
      if (!this.stage || event.target.closest(".ez-shadowbox-toggles") || !this.props.editing || event.button !== 0) return;
      node.focus({ preventScroll: true });
      const point = this.toStage(event.clientX, event.clientY);
      const reach = 11 / this.scale;
      const selected = this.props.selectedId ? findElement(this.box.elements, this.props.selectedId)?.element : null;
      let mode = null;
      let element = selected;
      if (selected && selected.kind !== "group") {
        const shape = this.corners(selected);
        if (Math.hypot(point.x - shape.knob.x, point.y - shape.knob.y) <= reach) mode = { rotate: true };
        else {
          const handle = shape.handles.find((entry) => Math.hypot(point.x - entry.x, point.y - entry.y) <= reach);
          if (handle) mode = { side: handle };
        }
      }
      if (!mode) {
        element = this.hit(point);
        if (!element) {
          this.emit("select", { id: "" });
          return;
        }
        if (element.id !== this.props.selectedId) this.emit("select", { id: element.id });
        mode = { move: true };
      }
      try {
        node.setPointerCapture(event.pointerId);
      } catch {}
      this.gesture = { ...mode, id: element.id, start: point, original: { x: Number(element.x) || 0, y: Number(element.y) || 0, width: Number(element.width) || 200, height: Number(element.height) || 200, rotation: Number(element.rotation) || 0 }, moved: false };
    });
    this.on(node, "pointermove", (event) => {
      const gesture = this.gesture;
      if (!gesture) return;
      const point = this.toStage(event.clientX, event.clientY);
      if (!gesture.moved && Math.hypot(point.x - gesture.start.x, point.y - gesture.start.y) < 3 / this.scale) return;
      gesture.moved = true;
      const found = findElement(this.box.elements, gesture.id);
      if (!found) return;
      const element = found.element;
      const original = gesture.original;
      const middle = { x: original.x + original.width / 2, y: original.y + original.height / 2 };
      const angle = (original.rotation * Math.PI) / 180;
      if (gesture.move) {
        element.x = original.x + point.x - gesture.start.x;
        element.y = original.y + point.y - gesture.start.y;
      } else if (gesture.rotate) {
        let degrees = (Math.atan2(point.y - middle.y, point.x - middle.x) * 180) / Math.PI + 90;
        if (event.shiftKey) degrees = Math.round(degrees / 15) * 15;
        element.rotation = ((((degrees + 180) % 360) + 360) % 360) - 180;
      } else {
        const side = gesture.side;
        const dx = point.x - middle.x;
        const dy = point.y - middle.y;
        const local = { x: dx * Math.cos(-angle) - dy * Math.sin(-angle), y: dx * Math.sin(-angle) + dy * Math.cos(-angle) };
        const anchor = { x: (-side.sx * original.width) / 2, y: (-side.sy * original.height) / 2 };
        let width = side.sx ? Math.max(4, Math.abs(local.x - anchor.x)) : original.width;
        let height = side.sy ? Math.max(4, Math.abs(local.y - anchor.y)) : original.height;
        if (side.sx && side.sy && !event.shiftKey) {
          const ratio = Math.max(width / original.width, height / original.height);
          width = original.width * ratio;
          height = original.height * ratio;
        }
        const offset = { x: side.sx ? anchor.x + (side.sx * width) / 2 : 0, y: side.sy ? anchor.y + (side.sy * height) / 2 : 0 };
        const center = { x: middle.x + offset.x * Math.cos(angle) - offset.y * Math.sin(angle), y: middle.y + offset.x * Math.sin(angle) + offset.y * Math.cos(angle) };
        element.width = width;
        element.height = height;
        element.x = center.x - width / 2;
        element.y = center.y - height / 2;
      }
      const view = this.views.get(element.id);
      if (view) element.kind === "dialogue" ? this.styleDialogue(view) : this.styleImage(view);
      this.drawHandles();
    });
    const finish = (event, cancelled) => {
      const gesture = this.gesture;
      this.gesture = null;
      if (!gesture) return;
      try {
        node.releasePointerCapture(event.pointerId);
      } catch {}
      const found = findElement(this.box.elements, gesture.id);
      if (!found || !gesture.moved) return;
      const changed = { x: found.element.x, y: found.element.y, width: found.element.width, height: found.element.height, rotation: found.element.rotation };
      Object.assign(found.element, gesture.original);
      if (cancelled) {
        this.sync();
        this.drawHandles();
        return;
      }
      this.commit("transform", (box) => {
        const target = findElement(box.elements, gesture.id);
        if (!target) return false;
        Object.assign(target.element, changed);
      });
    };
    this.on(node, "pointerup", (event) => finish(event, false));
    this.on(node, "pointercancel", (event) => finish(event, true));
    this.on(node, "keydown", (event) => {
      if (typing(event) || !this.props.editing) return;
      const control = event.ctrlKey || event.metaKey;
      if (control && event.key.toLowerCase() === "z") {
        event.preventDefault();
        const stack = event.shiftKey ? this.future : this.history;
        const other = event.shiftKey ? this.history : this.future;
        if (!stack.length) return;
        other.push(structuredClone(this.box));
        this.adopt(stack.pop(), event.shiftKey ? "redo" : "undo");
        return;
      }
      const id = this.props.selectedId;
      if (!id) return;
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        this.commit("delete", (box) => {
          const target = findElement(box.elements, id);
          if (!target) return false;
          target.siblings.splice(target.index, 1);
          for (const toggle of box.toggles || []) toggle.targets = (toggle.targets || []).filter((entry) => entry !== id);
        });
        this.emit("select", { id: "" });
      } else if (event.key === "PageUp" || event.key === "PageDown") {
        event.preventDefault();
        this.commit("order", (box) => {
          const target = findElement(box.elements, id);
          const next = target ? target.index + (event.key === "PageUp" ? -1 : 1) : -1;
          if (!target || next < 0 || next >= target.siblings.length) return false;
          [target.siblings[target.index], target.siblings[next]] = [target.siblings[next], target.siblings[target.index]];
        });
      } else if (event.key.startsWith("Arrow")) {
        event.preventDefault();
        const step = event.shiftKey ? 10 : 1;
        const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key];
        this.commit("nudge", (box) => {
          const target = findElement(box.elements, id);
          if (!target || target.element.kind === "group") return false;
          target.element.x = (Number(target.element.x) || 0) + delta[0];
          target.element.y = (Number(target.element.y) || 0) + delta[1];
        });
      }
    });
    this.on(node, "dragover", (event) => {
      if (this.props.editing) event.preventDefault();
    });
    this.on(node, "drop", (event) => {
      if (!this.props.editing || !this.stage) return;
      event.preventDefault();
      const point = this.toStage(event.clientX, event.clientY);
      let data = {};
      try {
        data = JSON.parse(event.dataTransfer.getData("application/x-easel-kit") || "{}");
      } catch {}
      const files = [...(event.dataTransfer.files || [])];
      if (files.length) data = { ...data, kind: "files", files };
      if (Object.keys(data).length) this.emit("drop", { data, x: point.x, y: point.y });
    });
  }

  destroy() {
    this.observer?.disconnect();
    try {
      this.app?.destroy(true, { children: true });
    } catch {}
    this.app = null;
    this.stage = null;
    super.destroy();
  }
}
