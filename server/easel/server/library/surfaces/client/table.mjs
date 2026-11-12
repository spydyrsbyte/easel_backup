import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";
export default class Table extends Base {
  constructor() {
    super("easel.surfaces.table", ["scene", "objects", "overlay"]);
  }
  update(p) {
    this.begin(p);
    const signature = JSON.stringify(p.camera);
    if (signature !== this.cameraSignature) {
      this.cameraSignature = signature;
      this.camera = { x: 0, y: 0, zoom: 1, rotation: 0, ...p.camera };
    }
    const viewport = el("div", "kit-surface");
    viewport.style.height = Math.max(160, p.height) + "px";
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
        e.target.closest("button,input,select,[draggable=true]") ||
        p.disabled
      )
        return;
      const start = {
        x: e.clientX,
        y: e.clientY,
        cx: this.camera.x,
        cy: this.camera.y,
      };
      viewport.setPointerCapture(e.pointerId);
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
    viewport.append(world);
    this.content.append(viewport);
    if (
      Number.isFinite(p.focus.x) &&
      Number.isFinite(p.focus.y) &&
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
    world.append(this.slots.scene, this.slots.objects, this.slots.overlay);
  }
}
