import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";
import { base64ToBytes } from "./archive.mjs";

let boundEasel = null;

export function initialize({ Easel }) {
  boundEasel = Easel;
}

function getPixi() {
  const host = boundEasel || globalThis.Easel;
  return host?.Interfaces?.create("easel.graphics.pixi@1") || null;
}

export default class Fog extends Base {
  constructor() {
    super("easel.maps.fog", []);
    this.pixi = getPixi();
    this.canvasHost = el("div", "kit-fog-canvas");
    this.canvasHost.style.position = "relative";
    this.canvasHost.style.width = "100%";
    this.canvasHost.style.height = "100%";
    this.app = null;
    this.fogContainer = null;
    this.regionsGraphics = null;
    this.polygonsGraphics = null;
    this.maskSprite = null;
    this.exploredFogCanvas = null;
    this.exploredFogTexture = null;
    if (this.pixi) {
      const { Container, Graphics, Sprite } = this.pixi;
      this.fogContainer = new Container();
      this.regionsGraphics = new Graphics();
      this.polygonsGraphics = new Graphics();
      this.maskSprite = new Sprite();
      this.fogContainer.addChild(this.maskSprite, this.regionsGraphics, this.polygonsGraphics);
    }
  }

  #ensureApp(width, height) {
    if (!this.pixi) return;
    const { Application, BlurFilter, RenderTexture } = this.pixi;
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
      if (BlurFilter) {
        this.fogContainer.filters = [new BlurFilter({ strength: 2 })];
      }
      this.boot = this.app
        .init({
          width: Math.max(1, width),
          height: Math.max(1, height),
          backgroundAlpha: 0,
          antialias: true,
        })
        .then(() => {
          if (this.life.signal.aborted || !this.app?.canvas) return;
          this.app.stage.addChild(this.fogContainer);
          this.canvasHost.replaceChildren(this.app.canvas);
          this.#renderPixi(this.props);
        })
        .catch(() => {});
    } else if (this.app.renderer) {
      this.app.renderer.resize(Math.max(1, width), Math.max(1, height));
    }
  }

  #renderPixi(p) {
    if (!this.pixi || !this.fogContainer) return;
    const { Texture, ColorMatrixFilter } = this.pixi;
    const width = Math.max(1, Number(p.width) || 600);
    const height = Math.max(1, Number(p.height) || 400);
    const baseOpacity = Math.max(0, Math.min(1, Number(p.opacity ?? 0.9)));
    const effectiveOpacity = p.gm ? Math.min(0.45, baseOpacity * 0.5) : baseOpacity;

    this.regionsGraphics.clear();
    this.polygonsGraphics.clear();
    for (const r of p.regions || []) {
      if (r.known) continue;
      const pts = (r.points || []).flatMap((v) => [Number(v.x) || 0, Number(v.y) || 0]);
      if (pts.length >= 6) {
        this.regionsGraphics.poly(pts).fill({ color: 0x080d14, alpha: effectiveOpacity });
      }
    }

    let hasDarkvision = false;
    for (const vp of p.visionPolygons || []) {
      if (!Array.isArray(vp.polygon) || vp.polygon.length < 3) continue;
      const flat = vp.polygon.flatMap((pt) => [Number(pt.x) || 0, Number(pt.y) || 0]);
      this.polygonsGraphics.poly(flat).fill({ color: 0xffffff, alpha: 0.08 });
      if (vp.saturation === 0) hasDarkvision = true;
    }
    if (hasDarkvision && ColorMatrixFilter) {
      const dv = new ColorMatrixFilter();
      dv.desaturate();
      this.polygonsGraphics.filters = [dv];
    } else {
      this.polygonsGraphics.filters = null;
    }

    const mask = p.visionMask;
    if (
      mask &&
      Number(mask.width) > 0 &&
      Number(mask.height) > 0 &&
      typeof mask.rgba === "string" &&
      mask.rgba &&
      typeof document !== "undefined" &&
      typeof document.createElement === "function"
    ) {
      const mw = Math.max(1, Math.trunc(Number(mask.width)));
      const mh = Math.max(1, Math.trunc(Number(mask.height)));
      const raw = base64ToBytes(mask.rgba);
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
        let maskDesat = false;
        for (let i = 0; i < mw * mh; i++) {
          const offset = i * 4;
          const detail = raw[offset] ?? 0;
          const desat = raw[offset + 1] ?? 0;
          if (desat > 128) maskDesat = true;
          const prev = expData ? expData.data[offset] : 0;
          const explored = Math.max(prev, detail);
          if (expData) {
            expData.data[offset] = explored;
            expData.data[offset + 3] = 255;
          }
          const unseen = detail > 0 ? 255 - detail : explored > 0 ? 165 : 255;
          const shade = desat > 0 && detail > 0 ? Math.round((desat / 255) * 36) : 8;
          imgData.data[offset] = shade;
          imgData.data[offset + 1] = shade + 4;
          imgData.data[offset + 2] = shade + 10;
          imgData.data[offset + 3] = Math.round(unseen * effectiveOpacity);
        }
        if (expCtx && expData) expCtx.putImageData(expData, 0, 0);
        ctx.putImageData(imgData, 0, 0);
        if (Texture?.from) {
          try {
            this.maskSprite.texture = Texture.from(canvas);
          } catch {
            this.maskSprite.texture = Texture.WHITE;
          }
        }
        if (maskDesat && ColorMatrixFilter) {
          const dv = new ColorMatrixFilter();
          dv.desaturate();
          this.maskSprite.filters = [dv];
        } else {
          this.maskSprite.filters = null;
        }
        this.maskSprite.width = width;
        this.maskSprite.height = height;
        this.maskSprite.visible = true;
      }
    } else {
      this.maskSprite.visible = false;
    }
  }

  update(p) {
    this.begin(p);
    const width = Math.max(1, Number(p.width) || 600);
    const height = Math.max(1, Number(p.height) || 400);
    const baseOpacity = Math.max(0, Math.min(1, Number(p.opacity ?? 0.9)));
    const effectiveOpacity = p.gm ? Math.min(0.45, baseOpacity * 0.5) : baseOpacity;

    const wrapper = el("div", "kit-fog-surface");
    wrapper.style.position = "relative";
    wrapper.style.width = width + "px";
    wrapper.style.height = height + "px";
    wrapper.setAttribute("aria-label", "Projected fog");
    wrapper.dataset.ambientLight = String(p.ambientLight || "NORMAL");

    const svg = this.svg("svg", { viewBox: "0 0 " + width + " " + height });
    svg.setAttribute("aria-label", "Projected fog");
    for (const r of p.regions || []) {
      if (r.known) continue;
      svg.append(
        this.svg("polygon", {
          points: (r.points ?? [])
            .map((v) => Number(v.x) + "," + Number(v.y))
            .join(" "),
          fill: "#080d14",
          "fill-opacity": effectiveOpacity,
        }),
      );
    }
    wrapper.append(this.canvasHost, svg);
    this.content.append(wrapper);

    this.#ensureApp(width, height);
    this.#renderPixi(p);
  }

  destroy() {
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
