import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";
import { bytesToBase64, packBox, unpackBox } from "./archive.mjs";

let boundEasel = null;

export function initialize({ Easel }) {
  boundEasel = Easel;
}

function getPixi() {
  const host = boundEasel || globalThis.Easel;
  return host?.Interfaces?.create("easel.graphics.pixi@1") || null;
}

function parseColorNum(val, fallback = 0xffffff) {
  if (typeof val === "number" && Number.isFinite(val)) return val;
  if (typeof val === "string") {
    const parsed = Number.parseInt(val.replace(/^#/, "").slice(0, 6), 16);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function buildVisualFilters(pixi, spec = {}) {
  if (!pixi?.ColorMatrixFilter) return [];
  const filters = [];
  if (spec.saturation !== undefined && Number(spec.saturation) !== 1) {
    const f = new pixi.ColorMatrixFilter();
    f.saturate(Number(spec.saturation) - 1, true);
    filters.push(f);
  }
  if (spec.contrast !== undefined && Number(spec.contrast) !== 0) {
    const f = new pixi.ColorMatrixFilter();
    f.contrast(Number(spec.contrast), true);
    filters.push(f);
  }
  if (spec.luminance !== undefined && Number(spec.luminance) !== 1) {
    const f = new pixi.ColorMatrixFilter();
    f.brightness(Math.max(0, Number(spec.luminance)), true);
    filters.push(f);
  }
  if (spec.tint !== undefined && spec.tint !== null && spec.tint !== 0xffffff && spec.tint !== "#ffffff") {
    const f = new pixi.ColorMatrixFilter();
    f.tint(parseColorNum(spec.tint, 0xffffff), true);
    filters.push(f);
  }
  const hasChroma =
    Boolean(spec.chromaKey) ||
    (Array.isArray(spec.transparentColors) && spec.transparentColors.length > 0);
  if (hasChroma) {
    const f = new pixi.ColorMatrixFilter();
    f.alpha = Number(spec.chromaAlpha ?? 0.92);
    filters.push(f);
  }
  return filters;
}

function collectLeafElements(nodes = [], out = []) {
  for (const node of nodes) {
    if (!node) continue;
    out.push(node);
    if (Array.isArray(node.children)) collectLeafElements(node.children, out);
    if (Array.isArray(node.elements)) collectLeafElements(node.elements, out);
  }
  return out;
}

export default class Shadowbox extends Base {
  constructor() {
    super("easel.maps.shadowbox", []);
    this.pixi = getPixi();
    this.canvasHost = el("div", "kit-shadowbox-canvas");
    this.app = null;
    this.stageContainer = null;
    this.backdropGraphics = null;
    this.groupsContainer = null;
    this.dialogueContainer = null;
    this.activeDialogueOverride = null;
    if (this.pixi) {
      const { Container, Graphics } = this.pixi;
      this.stageContainer = new Container();
      this.backdropGraphics = new Graphics();
      this.groupsContainer = new Container();
      this.dialogueContainer = new Container();
      this.stageContainer.addChild(
        this.backdropGraphics,
        this.groupsContainer,
        this.dialogueContainer,
      );
    }
  }

  #resolveDimensions(p) {
    const width = Math.max(160, Number(p.width ?? p.scene?.width) || 960);
    const ratioW = Math.max(1, Number(p.ratio?.width ?? p.scene?.ratio?.width) || 16);
    const ratioH = Math.max(1, Number(p.ratio?.height ?? p.scene?.ratio?.height) || 9);
    const height = Math.round(width * (ratioH / ratioW));
    return { width, height, ratioW, ratioH };
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
          this.app.stage.addChild(this.stageContainer);
          this.canvasHost.replaceChildren(this.app.canvas);
          this.#renderPixi(this.props);
        })
        .catch(() => {});
    } else if (this.app.renderer) {
      this.app.renderer.resize(Math.max(1, width), Math.max(1, height));
    }
  }

  #renderElementNode(item, parentVisible, p) {
    const { Container, Graphics, Text } = this.pixi;
    const ownVisible = item.visible !== false;
    const effectivelyVisible = parentVisible && ownVisible;
    if (!effectivelyVisible && !p.gm) return null;

    const isGroup =
      item.type === "group" ||
      item.kind === "group" ||
      Array.isArray(item.children) ||
      Array.isArray(item.elements);
    if (isGroup) {
      const grpContainer = new Container();
      grpContainer.alpha = effectivelyVisible
        ? Math.max(0, Math.min(1, Number(item.alpha ?? 1)))
        : 0.35;
      const grpFilters = buildVisualFilters(this.pixi, item);
      if (grpFilters.length) grpContainer.filters = grpFilters;
      const children = item.children || item.elements || [];
      for (let i = children.length - 1; i >= 0; i--) {
        const childNode = this.#renderElementNode(children[i], effectivelyVisible, p);
        if (childNode) grpContainer.addChild(childNode);
      }
      return grpContainer;
    }

    const itemNode = new Container();
    const w = Number(item.width) || 120;
    const h = Number(item.height) || 160;
    itemNode.x = Number(item.x) || 0;
    itemNode.y = Number(item.y) || 0;
    if (item.rotation) {
      itemNode.rotation = ((Number(item.rotation) || 0) * Math.PI) / 180;
    }
    const sx = item.mirrorX || item.flipX ? -1 : 1;
    const sy = item.mirrorY || item.flipY ? -1 : 1;
    itemNode.scale.set(sx, sy);
    itemNode.alpha = effectivelyVisible
      ? Math.max(0, Math.min(1, Number(item.alpha ?? 1)))
      : 0.35;
    const itemFilters = buildVisualFilters(this.pixi, item);
    if (itemFilters.length) itemNode.filters = itemFilters;

    if (Number(item.luminance) > 0) {
      const glow = new Graphics();
      const glowColor = parseColorNum(item.tint ?? item.color, 0xffe4a0);
      glow
        .circle(w / 2, h / 2, Math.max(w, h) * 0.75)
        .fill({ color: glowColor, alpha: Math.min(0.45, Number(item.luminance) * 0.2) });
      itemNode.addChild(glow);
    }

    const isDialogueElement = item.type === "dialogue" || item.kind === "dialogue";
    const card = new Graphics();
    card
      .roundRect(0, 0, w, h, 8)
      .fill({
        color: parseColorNum(item.backgroundColor ?? item.color, isDialogueElement ? 0x0b0e14 : 0x2b3440),
        alpha: Number(item.backgroundOpacity ?? 0.92),
      })
      .stroke({ color: 0xd6ae65, width: 1.5 });
    itemNode.addChild(card);

    const displayText =
      isDialogueElement &&
      this.activeDialogueOverride &&
      (this.activeDialogueOverride.speaker === item.name ||
        this.activeDialogueOverride.speaker === item.id)
        ? this.activeDialogueOverride.text
        : item.text || item.name || item.label;
    if (displayText && Text) {
      const label = new Text({
        text: String(displayText),
        style: {
          fontSize: Number(item.fontSize) || 13,
          fill: parseColorNum(item.textColor, 0xffffff),
        },
      });
      label.x = 10;
      label.y = isDialogueElement ? 12 : h - 26;
      itemNode.addChild(label);
    }
    return itemNode;
  }

  #renderPixi(p) {
    if (!this.pixi || !this.stageContainer) return;
    const { Graphics, Text } = this.pixi;
    const { width, height } = this.#resolveDimensions(p);

    this.backdropGraphics.clear();
    this.backdropGraphics.rect(0, 0, width, height).fill({ color: 0x10141a, alpha: 1 });
    this.groupsContainer.removeChildren();
    this.dialogueContainer.removeChildren();

    const groups =
      Array.isArray(p.groups) && p.groups.length
        ? p.groups
        : Array.isArray(p.scene?.groups) && p.scene.groups.length
          ? p.scene.groups
          : [
              {
                id: "default",
                type: "group",
                name: "Main",
                visible: true,
                elements: p.elements?.length ? p.elements : p.scene?.elements || [],
              },
            ];

    const sortedGroups = [...groups].sort(
      (a, b) => (Number(a.zIndex) || 0) - (Number(b.zIndex) || 0),
    );

    for (const grp of sortedGroups) {
      const node = this.#renderElementNode(
        { ...grp, type: "group", children: grp.children || grp.elements || [] },
        true,
        p,
      );
      if (node) this.groupsContainer.addChild(node);
    }

    const dlg =
      this.activeDialogueOverride ||
      (p.dialogue && Object.keys(p.dialogue).length
        ? p.dialogue
        : p.speak && Object.keys(p.speak).length
          ? p.speak
          : p.scene?.dialogue || p.scene?.speak);
    if (dlg && dlg.visible !== false && (dlg.text || dlg.speaker)) {
      const boxH = Math.max(90, Math.round(height * 0.24));
      const boxY = height - boxH - 12;
      const bg = new Graphics();
      bg.roundRect(16, boxY, width - 32, boxH, 10)
        .fill({ color: 0x0b0e14, alpha: 0.88 })
        .stroke({ color: 0xd6ae65, width: 2 });
      this.dialogueContainer.addChild(bg);
      if (Text) {
        if (dlg.speaker) {
          const spk = new Text({
            text: String(dlg.speaker),
            style: { fontSize: 15, fill: 0xd6ae65 },
          });
          spk.x = 32;
          spk.y = boxY + 12;
          this.dialogueContainer.addChild(spk);
        }
        if (dlg.text) {
          const txt = new Text({
            text: String(dlg.text),
            style: { fontSize: 14, fill: 0xece8de },
          });
          txt.x = 32;
          txt.y = boxY + 38;
          this.dialogueContainer.addChild(txt);
        }
      }
    }
  }

  speak(speaker, text) {
    const payload = {
      speaker: String(speaker ?? ""),
      text: String(text ?? ""),
    };
    this.activeDialogueOverride = payload;
    this.#renderPixi(this.props);
    this.emit("speak", payload);
    return payload;
  }

  toggleElements(ids, visible = true) {
    const listIds = Array.isArray(ids) ? ids.map(String) : [String(ids)];
    const payload = { ids: listIds, visible: Boolean(visible) };
    this.emit("toggleElements", payload);
    return payload;
  }

  exportArchive(assets = {}) {
    const bytes = packBox(
      {
        title: this.props.title,
        ratio: this.props.ratio,
        scene: this.props.scene,
        groups: this.props.groups,
        elements: this.props.elements,
        toggles: this.props.toggles,
        dialogue: this.props.dialogue,
      },
      assets,
    );
    const archive = bytesToBase64(bytes);
    const name = `${(this.props.title || "shadowbox").replace(/\s+/g, "_")}.box`;
    this.emit("exportBox", { name, archive });
    return { name, archive, bytes };
  }

  importArchive(archiveBytes) {
    const { box, assets } = unpackBox(archiveBytes);
    this.emit("importBox", { box });
    return { box, assets };
  }

  update(p) {
    this.begin(p);
    const { width, height, ratioW, ratioH } = this.#resolveDimensions(p);

    const stage = el("div", "kit-surface kit-shadowbox-stage");
    stage.style.width = width + "px";
    stage.style.height = height + "px";
    stage.style.aspectRatio = `${ratioW} / ${ratioH}`;
    stage.setAttribute("aria-label", p.title || "Shadowbox theatre");
    stage.append(this.canvasHost);

    const dlg =
      this.activeDialogueOverride ||
      (p.dialogue && Object.keys(p.dialogue).length
        ? p.dialogue
        : p.speak && Object.keys(p.speak).length
          ? p.speak
          : p.scene?.dialogue || p.scene?.speak);
    if (dlg && dlg.visible !== false && (dlg.speaker || dlg.text)) {
      const overlay = el("div", "kit-item kit-shadowbox-dialogue");
      if (dlg.speaker) overlay.append(el("strong", "kit-label", dlg.speaker));
      if (dlg.text) overlay.append(el("p", "", dlg.text));
      const dismissBtn = this.button("Dismiss", "speakDismiss", {});
      dismissBtn.dataset.action = "dismiss-speak";
      overlay.append(dismissBtn);
      stage.append(overlay);
    }

    this.content.append(stage);

    if (p.gm) {
      const gmControls = el("div", "kit-row");
      const allElements = collectLeafElements([
        ...(p.elements || []),
        ...(p.scene?.elements || []),
        ...(p.groups || []),
        ...(p.scene?.groups || []),
      ]);
      const seenIds = new Set();
      for (const item of allElements) {
        const id = String(item.id ?? "");
        if (!id || seenIds.has(id)) continue;
        seenIds.add(id);
        const nextVis = item.visible === false;
        const btn = this.button(
          `${nextVis ? "Show" : "Hide"} ${item.name || item.label || id}`,
          "toggleElements",
          { ids: [id], visible: nextVis },
        );
        btn.dataset.elementToggle = id;
        gmControls.append(btn);
      }
      const toggles = Array.isArray(p.toggles) && p.toggles.length
        ? p.toggles
        : p.scene?.toggles || [];
      for (const t of toggles) {
        const tid = String(t.id ?? "");
        const targets = Array.isArray(t.targets) ? t.targets.map(String) : [tid];
        const nextVis = !t.on;
        const tBtn = this.button(
          `Toggle ${t.name || tid}`,
          "toggleElements",
          { ids: targets, visible: nextVis },
        );
        tBtn.dataset.toggleId = tid;
        gmControls.append(tBtn);
      }
      const exportBtn = el("button", "kit-button", "Export .box");
      exportBtn.type = "button";
      exportBtn.dataset.action = "export-box";
      exportBtn.disabled = Boolean(p.disabled);
      exportBtn.onclick = () => this.exportArchive();
      gmControls.append(exportBtn);
      this.content.append(gmControls);
    }

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
