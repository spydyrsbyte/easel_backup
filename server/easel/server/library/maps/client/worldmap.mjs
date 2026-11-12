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

export default class Worldmap extends Base {
  constructor() {
    super("easel.maps.worldmap", []);
    this.pixi = getPixi();
    this.canvasHost = el("div", "kit-worldmap-canvas");
    this.canvasHost.style.position = "absolute";
    this.canvasHost.style.inset = "0";
    this.canvasHost.style.pointerEvents = "none";
    this.app = null;
    this.worldContainer = null;
    this.tilesContainer = null;
    this.pinsContainer = null;
    if (this.pixi) {
      const { Container } = this.pixi;
      this.worldContainer = new Container();
      this.tilesContainer = new Container();
      this.pinsContainer = new Container();
      this.worldContainer.addChild(this.tilesContainer, this.pinsContainer);
    }
  }

  #resolvePins(p) {
    return Array.isArray(p.pins) && p.pins.length
      ? p.pins
      : Array.isArray(p.locations)
        ? p.locations
        : [];
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

  #renderPixi(p) {
    if (!this.pixi || !this.worldContainer) return;
    const { Graphics, Text } = this.pixi;
    const width = Math.max(160, Number(p.width) || 960);
    const height = Math.max(160, Number(p.height) || 600);
    const pins = this.#resolvePins(p);

    this.tilesContainer.removeChildren();
    this.pinsContainer.removeChildren();

    const baseBg = new Graphics();
    baseBg.rect(0, 0, width, height).fill({ color: 0x1b262c, alpha: 0.9 });
    this.tilesContainer.addChild(baseBg);

    for (const tile of p.tiles || []) {
      const tx = Number(tile.x ?? (Number(tile.col) || 0) * 256) || 0;
      const ty = Number(tile.y ?? (Number(tile.row) || 0) * 256) || 0;
      const tw = Number(tile.width) || 256;
      const th = Number(tile.height) || 256;
      const g = new Graphics();
      g.rect(tx, ty, tw, th)
        .fill({ color: Number(tile.color ?? 0x263849), alpha: 0.95 })
        .stroke({ color: 0x3b5268, width: 1 });
      this.tilesContainer.addChild(g);
    }

    for (const pin of pins) {
      if (pin.discovered === false && !p.gm) continue;
      const px = Number(pin.x) || 0;
      const py = Number(pin.y) || 0;
      const isSelected = p.selectedPinId && String(pin.id) === String(p.selectedPinId);
      const pinG = new Graphics();
      pinG
        .circle(px, py, isSelected ? 11 : 8)
        .fill({
          color: Number(pin.color ?? 0xd6ae65),
          alpha: pin.discovered === false ? 0.45 : 1,
        })
        .stroke({ color: isSelected ? 0xffffff : 0x11151c, width: isSelected ? 3 : 2 });
      this.pinsContainer.addChild(pinG);
      if ((pin.label || pin.name) && Text) {
        const lbl = new Text({
          text: String(pin.label || pin.name),
          style: { fontSize: 12, fill: 0xece8de },
        });
        lbl.x = px + 12;
        lbl.y = py - 8;
        this.pinsContainer.addChild(lbl);
      }
    }
  }

  selectPin(id) {
    const pins = this.#resolvePins(this.props);
    const pin = pins.find((p) => String(p.id) === String(id));
    const payload = {
      id: String(id),
      linkedMapId: String(pin?.linkedMapId ?? pin?.mapId ?? ""),
    };
    this.emit("pinSelect", payload);
    return payload;
  }

  moveTile(id, x, y) {
    const payload = {
      id: String(id),
      x: Number(x) || 0,
      y: Number(y) || 0,
    };
    this.emit("tileMove", payload);
    return payload;
  }

  update(p) {
    this.begin(p);
    const signature = JSON.stringify(p.camera);
    if (signature !== this.cameraSignature) {
      this.cameraSignature = signature;
      this.camera = { x: 0, y: 0, zoom: 1, rotation: 0, ...p.camera };
    }
    const width = Math.max(160, Number(p.width) || 960);
    const height = Math.max(160, Number(p.height) || 600);
    const pins = this.#resolvePins(p);

    const viewport = el("div", "kit-surface kit-worldmap-surface");
    viewport.style.width = width + "px";
    viewport.style.height = height + "px";
    viewport.tabIndex = 0;
    viewport.setAttribute("aria-label", p.title || "Overland Worldmap");

    const world = el("div", "kit-world");
    world.style.width = width + "px";
    world.style.height = height + "px";

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
    const emitCamera = () => {
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

    viewport.onwheel = (e) => {
      e.preventDefault();
      const rect = viewport.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const before = point(x, y);
      this.camera.zoom = Math.max(
        0.1,
        Math.min(10, this.camera.zoom * (e.deltaY > 0 ? 0.9 : 1 / 0.9)),
      );
      const a = (this.camera.rotation * Math.PI) / 180;
      this.camera.x =
        x -
        (before.x * Math.cos(a) - before.y * Math.sin(a)) * this.camera.zoom;
      this.camera.y =
        y -
        (before.x * Math.sin(a) + before.y * Math.cos(a)) * this.camera.zoom;
      emitCamera();
    };

    viewport.onpointerdown = (e) => {
      if (e.target.closest?.("button,[data-pin-id],[data-tile-id]") || p.disabled) return;
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
        emitCamera();
      };
      viewport.onpointercancel = () => (viewport.onpointermove = null);
    };

    if (p.image) {
      const mapImg = this.image(p.image, p.title || "Worldmap");
      mapImg.style.width = width + "px";
      mapImg.style.height = height + "px";
      world.append(mapImg);
    }

    for (const tile of p.tiles || []) {
      const tid = String(tile.id ?? "");
      const tx = Number(tile.x ?? (Number(tile.col) || 0) * 256) || 0;
      const ty = Number(tile.y ?? (Number(tile.row) || 0) * 256) || 0;
      const tw = Number(tile.width) || 256;
      const th = Number(tile.height) || 256;
      const tileNode = el("div", "kit-layer");
      tileNode.dataset.tileId = tid;
      tileNode.style.position = "absolute";
      tileNode.style.left = tx + "px";
      tileNode.style.top = ty + "px";
      tileNode.style.width = tw + "px";
      tileNode.style.height = th + "px";
      if (tile.image) {
        const img = this.image(tile.image, tile.label ?? tid);
        img.style.width = "100%";
        img.style.height = "100%";
        tileNode.append(img);
      }
      if (p.gm && !p.disabled) {
        tileNode.onpointerdown = (e) => {
          e.stopPropagation();
          const start = { x: e.clientX, y: e.clientY, tx, ty };
          tileNode.setPointerCapture?.(e.pointerId);
          tileNode.onpointermove = (ev) => {
            const nx = start.tx + (ev.clientX - start.x) / this.camera.zoom;
            const ny = start.ty + (ev.clientY - start.y) / this.camera.zoom;
            tileNode.style.left = nx + "px";
            tileNode.style.top = ny + "px";
          };
          tileNode.onpointerup = (ev) => {
            tileNode.onpointermove = null;
            const nx = Math.round(start.tx + (ev.clientX - start.x) / this.camera.zoom);
            const ny = Math.round(start.ty + (ev.clientY - start.y) / this.camera.zoom);
            this.moveTile(tid, nx, ny);
          };
        };
      }
      world.append(tileNode);
    }

    for (const pin of pins) {
      if (pin.discovered === false && !p.gm) continue;
      const pid = String(pin.id ?? "");
      const btn = el("button", "kit-badge", pin.label ?? pin.name ?? pid);
      btn.type = "button";
      btn.dataset.pinId = pid;
      btn.style.position = "absolute";
      btn.style.left = (Number(pin.x) || 0) + "px";
      btn.style.top = (Number(pin.y) || 0) + "px";
      btn.onclick = () => this.selectPin(pid);
      world.append(btn);
    }

    apply();
    viewport.append(this.canvasHost, world);
    this.content.append(viewport);

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
