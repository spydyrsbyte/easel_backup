import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";

let boundEasel = null;

export function initialize({ Easel }) {
  boundEasel = Easel;
}

function getPixi() {
  const host = boundEasel || globalThis.Easel;
  return host?.Interfaces?.create("easel.graphics.pixi@1") || null;
}

function computeTemplatePolygon(tpl) {
  const kind = String(tpl?.kind || tpl?.type || "circle").toLowerCase();
  const ox = Number(tpl?.origin?.x ?? tpl?.x ?? 0) || 0;
  const oy = Number(tpl?.origin?.y ?? tpl?.y ?? 0) || 0;
  const dirRad = ((Number(tpl?.direction ?? tpl?.rotation ?? 0) || 0) * Math.PI) / 180;

  if (kind === "circle" || kind === "burst") {
    const r = Math.max(4, Number(tpl?.radius ?? tpl?.length ?? 64) || 64);
    const pts = [];
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * Math.PI * 2;
      pts.push({ x: ox + Math.cos(a) * r, y: oy + Math.sin(a) * r });
    }
    return pts;
  }

  if (kind === "cone") {
    const len = Math.max(4, Number(tpl?.length ?? tpl?.radius ?? 96) || 96);
    const arc = Math.max(1, Math.min(360, Number(tpl?.angle ?? tpl?.arc ?? 90) || 90));
    const half = ((arc / 2) * Math.PI) / 180;
    const pts = arc < 360 ? [{ x: ox, y: oy }] : [];
    const steps = 20;
    for (let i = 0; i <= steps; i++) {
      const a = dirRad - half + (i / steps) * (half * 2);
      pts.push({ x: ox + Math.cos(a) * len, y: oy + Math.sin(a) * len });
    }
    return pts;
  }

  if (kind === "ray" || kind === "line") {
    const len = Math.max(4, Number(tpl?.length ?? tpl?.radius ?? 128) || 128);
    const w = Math.max(2, Number(tpl?.width ?? 32) || 32);
    const cos = Math.cos(dirRad);
    const sin = Math.sin(dirRad);
    const nx = -sin * (w / 2);
    const ny = cos * (w / 2);
    const ex = ox + cos * len;
    const ey = oy + sin * len;
    return [
      { x: ox + nx, y: oy + ny },
      { x: ex + nx, y: ey + ny },
      { x: ex - nx, y: ey - ny },
      { x: ox - nx, y: oy - ny },
    ];
  }

  const w = Math.max(4, Number(tpl?.width ?? tpl?.w ?? 96) || 96);
  const h = Math.max(4, Number(tpl?.height ?? tpl?.h ?? w) || w);
  const cos = Math.cos(dirRad);
  const sin = Math.sin(dirRad);
  return [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ].map((c) => ({
    x: ox + c.x * cos - c.y * sin,
    y: oy + c.x * sin + c.y * cos,
  }));
}

function pointInPoly(pt, poly) {
  if (!Array.isArray(poly) || poly.length < 3) return false;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;
    const hit =
      yi > pt.y !== yj > pt.y &&
      pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi || 1e-12) + xi;
    if (hit) inside = !inside;
  }
  return inside;
}

export default class Template extends Base {
  constructor() {
    super("easel.maps.template", []);
    this.pixi = getPixi();
    this.canvasHost = el("div", "kit-template-canvas");
    this.app = null;
    this.templatesContainer = null;
    this.cellsGraphics = null;
    this.shapesGraphics = null;
    this.labelsContainer = null;
    if (this.pixi) {
      const { Container, Graphics } = this.pixi;
      this.templatesContainer = new Container();
      this.cellsGraphics = new Graphics();
      this.shapesGraphics = new Graphics();
      this.labelsContainer = new Container();
      this.templatesContainer.addChild(
        this.cellsGraphics,
        this.shapesGraphics,
        this.labelsContainer,
      );
    }
  }

  #ensureApp(width, height) {
    if (!this.pixi) return;
    const { Application } = this.pixi;
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
          this.app.stage.addChild(this.templatesContainer);
          this.canvasHost.replaceChildren(this.app.canvas);
          this.#renderPixi(this.props);
        })
        .catch(() => {});
    } else if (this.app.renderer) {
      this.app.renderer.resize(Math.max(1, width), Math.max(1, height));
    }
  }

  #renderPixi(p) {
    if (!this.pixi || !this.templatesContainer) return;
    const { Text } = this.pixi;
    this.cellsGraphics.clear();
    this.shapesGraphics.clear();
    this.labelsContainer.removeChildren();

    const cellSize = Math.max(8, Number(p.grid?.cellSize ?? 64) || 64);
    const offsetX = Number(p.grid?.offsetX ?? 0) || 0;
    const offsetY = Number(p.grid?.offsetY ?? 0) || 0;

    const sourceTemplates =
      Array.isArray(p.templates) && p.templates.length
        ? p.templates
        : Array.isArray(p.items)
          ? p.items
          : [];
    const all = [...sourceTemplates];
    if (p.activeTemplate && Object.keys(p.activeTemplate).length) {
      all.push({ id: "preview", ...p.activeTemplate });
    }

    for (const tpl of all) {
      const poly = computeTemplatePolygon(tpl);
      if (poly.length < 3) continue;
      const color = Number.isFinite(Number(tpl.color)) ? Number(tpl.color) : 0xe07a38;
      const alpha = Number.isFinite(Number(tpl.alpha))
        ? Math.max(0.05, Math.min(0.95, Number(tpl.alpha)))
        : 0.28;

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
      const c0 = Math.floor((minX - offsetX) / cellSize);
      const c1 = Math.floor((maxX - offsetX) / cellSize);
      const r0 = Math.floor((minY - offsetY) / cellSize);
      const r1 = Math.floor((maxY - offsetY) / cellSize);
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const cx = offsetX + (c + 0.5) * cellSize;
          const cy = offsetY + (r + 0.5) * cellSize;
          if (pointInPoly({ x: cx, y: cy }, poly)) {
            this.cellsGraphics
              .rect(offsetX + c * cellSize, offsetY + r * cellSize, cellSize, cellSize)
              .fill({ color, alpha: alpha * 0.5 });
          }
        }
      }

      const flat = poly.flatMap((pt) => [pt.x, pt.y]);
      this.shapesGraphics
        .poly(flat)
        .fill({ color, alpha })
        .stroke({ color, width: 2, alpha: Math.min(1, alpha + 0.4) });

      if (tpl.label && Text) {
        const ox = Number(tpl?.origin?.x ?? tpl?.x ?? poly[0].x) || 0;
        const oy = Number(tpl?.origin?.y ?? tpl?.y ?? poly[0].y) || 0;
        const labelNode = new Text({
          text: String(tpl.label),
          style: { fontSize: 12, fill: 0xffffff },
        });
        labelNode.x = ox + 6;
        labelNode.y = oy + 6;
        this.labelsContainer.addChild(labelNode);
      }
    }
  }

  update(p) {
    this.begin(p);
    const width = Math.max(160, Number(p.width) || 800);
    const height = Math.max(160, Number(p.height) || 600);
    const surface = el("div", "kit-surface kit-template-surface");
    surface.style.width = width + "px";
    surface.style.height = height + "px";
    surface.setAttribute("aria-label", p.title || "AoE Templates");

    const sourceTemplates =
      Array.isArray(p.templates) && p.templates.length
        ? p.templates
        : Array.isArray(p.items)
          ? p.items
          : [];

    surface.onpointerdown = (e) => {
      if (p.disabled) return;
      const rect = surface.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      for (const tpl of sourceTemplates) {
        const poly = computeTemplatePolygon(tpl);
        if (pointInPoly({ x, y }, poly)) {
          this.emit("select", { id: String(tpl.id || "") });
          return;
        }
      }
      if (p.activeTemplate && Object.keys(p.activeTemplate).length) {
        this.emit("place", {
          template: {
            ...p.activeTemplate,
            origin: { x, y },
            x,
            y,
          },
        });
      }
    };

    const controls = el("div", "kit-row");
    for (const tpl of sourceTemplates) {
      const id = String(tpl.id ?? "");
      controls.append(
        this.button(tpl.label || `${tpl.kind || "circle"} (${id})`, "select", { id }),
        this.button("Remove", "remove", { id }),
      );
    }
    surface.append(this.canvasHost);
    this.content.append(surface, controls);

    this.#ensureApp(width, height);
    this.#renderPixi(p);
  }

  destroy() {
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
