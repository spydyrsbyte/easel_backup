import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";

export default class VttWorkspace extends Base {
  constructor() {
    super("easel.layout.vttworkspace", [
      "canvas",
      "tools",
      "hud",
      "hotbar",
      "sidebar",
      "diceoverlay",
      "windows",
    ]);
    this.element.style.position = "relative";
    this.element.style.width = "100%";
    this.element.style.height = "100%";
    this.element.style.minHeight = "0";
    this.element.style.overflow = "hidden";
    this.element.style.display = "block";
  }

  update(p) {
    this.begin({ ...p, title: "" });
    this.props = p;
    this.element.setAttribute("aria-label", p.title || "Workspace");
    const isOpen = p.sidebarOpen !== false;
    const width = Number.isFinite(p.sidebarWidth) ? Math.max(44, p.sidebarWidth) : 340;
    const sidebarSize = `min(${width}px, max(44px, calc(100% - 160px)))`;
    const canvasInset = isOpen ? sidebarSize : "44px";

    this.element.dataset.activeTool = p.activeTool || "select";
    this.element.dataset.gmMode = String(Boolean(p.gmMode));

    this.slots.canvas.style.position = "absolute";
    this.slots.canvas.style.inset = "0";
    this.slots.canvas.style.right = canvasInset;
    this.slots.canvas.style.zIndex = "1";
    this.content.append(this.slots.canvas);

    this.slots.diceoverlay.className = "kit-slot kit-slot-diceoverlay kit-vtt-diceoverlay";
    this.slots.diceoverlay.style.position = "absolute";
    this.slots.diceoverlay.style.inset = "0";
    this.slots.diceoverlay.style.right = canvasInset;
    this.slots.diceoverlay.style.zIndex = "50";
    this.slots.diceoverlay.style.pointerEvents = "none";
    this.content.append(this.slots.diceoverlay);

    this.slots.tools.style.position = "absolute";
    this.slots.tools.style.top = "12px";
    this.slots.tools.style.left = "12px";
    this.slots.tools.style.zIndex = "20";
    this.content.append(this.slots.tools);

    this.slots.hud.className = "kit-slot kit-slot-hud kit-vtt-hud";
    this.slots.hud.style.position = "absolute";
    this.slots.hud.style.inset = "0";
    this.slots.hud.style.zIndex = "25";
    this.slots.hud.style.pointerEvents = "none";
    this.content.append(this.slots.hud);

    this.slots.hotbar.style.position = "absolute";
    this.slots.hotbar.style.bottom = "12px";
    this.slots.hotbar.style.left = "50%";
    this.slots.hotbar.style.transform = "translateX(-50%)";
    this.slots.hotbar.style.zIndex = "20";
    this.content.append(this.slots.hotbar);

    const sidebarWrap = el("aside", "kit-vtt-sidebar");
    sidebarWrap.style.position = "absolute";
    sidebarWrap.style.top = "0";
    sidebarWrap.style.right = "0";
    sidebarWrap.style.bottom = "0";
    sidebarWrap.style.width = sidebarSize;
    sidebarWrap.style.maxWidth = "100%";
    sidebarWrap.style.zIndex = "30";
    sidebarWrap.style.display = "flex";
    sidebarWrap.style.flexDirection = "column";
    sidebarWrap.style.background = "var(--kit-surface, #20242b)";
    sidebarWrap.style.borderLeft = "1px solid var(--kit-border, #ffffff24)";
    sidebarWrap.style.transition = "transform 0.2s ease";

    const toggleBtn = this.button(
      isOpen ? "Collapse Sidebar" : "Expand Sidebar",
      "toggleSidebar",
      { open: !isOpen },
    );
    toggleBtn.className = "kit-sidebar-toggle";
    toggleBtn.style.margin = "8px";
    sidebarWrap.append(toggleBtn);

    this.slots.sidebar.style.flex = "1";
    this.slots.sidebar.style.overflow = "auto";
    sidebarWrap.append(this.slots.sidebar);

    if (!isOpen) {
      sidebarWrap.style.transform = "translateX(calc(100% - 44px))";
    }

    this.content.append(sidebarWrap);

    this.slots.windows.className = "kit-slot kit-slot-windows kit-vtt-windows";
    this.slots.windows.style.position = "absolute";
    this.slots.windows.style.inset = "0";
    this.slots.windows.style.zIndex = "40";
    this.slots.windows.style.pointerEvents = "none";
    this.content.append(this.slots.windows);
  }
}
