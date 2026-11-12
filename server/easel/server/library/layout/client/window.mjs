import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";

export default class Window extends Base {
  constructor() {
    super("easel.layout.window", ["toolbar", "body"]);
    this.observer = new ResizeObserver((entries) => {
      if (this.element.isConnected && this.props.open !== false) {
        const b = entries[0].contentRect;
        this.emit("resize", { width: b.width, height: b.height });
      }
    });
    this.observer.observe(this.element);
  }

  update(p) {
    this.begin({ ...p, title: "" });
    this.element.classList.add("kit-window");
    this.element.style.width = Math.max(280, p.width || 400) + "px";
    this.element.style.height = Math.max(160, p.height || 300) + "px";

    const initX = Number(p.data?.x ?? 0);
    const initY = Number(p.data?.y ?? 0);
    this.element.style.translate = `${initX}px ${initY}px`;

    Window.nextZ = (Window.nextZ || 50) + 1;
    this.element.style.zIndex = String(Window.nextZ);

    this.element.onpointerdown = () => {
      Window.nextZ = (Window.nextZ || 50) + 1;
      this.element.style.zIndex = String(Window.nextZ);
    };

    const header = el("div", "kit-window-header kit-header");
    header.tabIndex = 0;

    const titleEl = el("div", "kit-window-title", p.title || "Window");
    const controls = el("div", "kit-window-controls");
    const closeBtn = el("button", "kit-window-close", "✕");
    closeBtn.type = "button";
    closeBtn.setAttribute("aria-label", "Close");
    closeBtn.title = "Close";
    closeBtn.onclick = (e) => {
      e.stopPropagation();
      this.emit("close", {});
    };
    controls.append(closeBtn);
    header.append(titleEl, controls);

    header.onpointerdown = (e) => {
      if (p.disabled || e.button !== 0 || e.target.closest(".kit-window-close")) return;
      const startClientX = e.clientX;
      const startClientY = e.clientY;
      const startX = Number(p.data?.x ?? 0);
      const startY = Number(p.data?.y ?? 0);

      header.setPointerCapture(e.pointerId);
      header.onpointermove = (ev) => {
        const dx = ev.clientX - startClientX;
        const dy = ev.clientY - startClientY;
        this.element.style.translate = `${startX + dx}px ${startY + dy}px`;
      };
      header.onpointerup = (ev) => {
        header.onpointermove = null;
        try {
          header.releasePointerCapture(ev.pointerId);
        } catch {}
        const finalX = startX + ev.clientX - startClientX;
        const finalY = startY + ev.clientY - startClientY;
        if (!p.data) p.data = {};
        p.data.x = finalX;
        p.data.y = finalY;
        this.emit("move", { x: finalX, y: finalY });
      };
    };

    this.slots.body.classList.add("kit-window-body");
    this.content.append(header, this.slots.toolbar, this.slots.body);
    if (p.text) this.content.append(this.text(p.text));
  }
}
