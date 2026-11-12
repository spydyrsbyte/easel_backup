import { proxied } from "./web.mjs";

const radians = (degrees) => (degrees * Math.PI) / 180;
const hex = ([r, g, b]) =>
  (Math.round(r * 255) << 16) | (Math.round(g * 255) << 8) | Math.round(b * 255);
const seatColors = {
  White: 0xffffff,
  Red: 0xdb1a18,
  Yellow: 0xe7e52c,
  Green: 0x31b32b,
  Blue: 0x1f87ff,
  Purple: 0xa020f0,
  Black: 0x3f3f3f,
};
const keywordIcon = {
  Deathtouch: "ability-deathtouch.svg",
  "Double Strike": "ability-doublestrike.svg",
  "First Strike": "ability-firststrike.svg",
  Flying: "ability-flying.svg",
  Haste: "ability-haste.svg",
  Hexproof: "ability-hexproof.svg",
  Indestructible: "ability-indestructible.svg",
  Lifelink: "ability-lifelink.svg",
  Menace: "ability-menace.svg",
  Reach: "ability-reach.svg",
  Trample: "ability-trample.svg",
  Vigilance: "ability-vigilance.svg",
  Defender: "counter-shield.svg",
};
const statusImage = {
  Renowned: "renowned.png",
  Monstrous: "monstrous.png",
  Frozen: "frozen.png",
  Haste: "haste.png",
};
const manaImage = {
  White: "mana-white.png",
  Blue: "mana-blue.png",
  Black: "mana-black.png",
  Red: "mana-red.png",
  Green: "mana-green.png",
  Colorless: "mana-colorless.png",
};
const counterImage = {
  Energy: "energy.jpg",
  Experience: "experience.jpg",
  Poison: "poison.jpg",
};
const sizes = {
  "commander-damage": [0.95, 1.03],
  die: [1.1, 1.1],
  first: [1.6, 1.6],
  planar: [1.4, 1.4],
  keyword: [1.05, 1.05],
  status: [1.05, 1.05],
  suspend: [1.05, 1.05],
  mana: [1.05, 1.05],
  loyalty: [1.5, 0.92],
  plusxy: [1.7, 0.86],
  counter: [1.0, 1.0],
  text: [1.6, 1.0],
  notecard: [2.6, 1.73],
  "drop-counter": [0.8, 1.12],
  "player-counter": [1.3, 1.81],
  rhystic: [1.3, 1.3],
  skipper: [1.3, 1.3],
  krark: [3.3, 4.6],
  monarch: [1.3, 1.3],
  bag: [1.6, 1.6],
  planechase: [2.6, 2.6],
};

export class TableCanvas {
  constructor(host, pixi, layout, base, events) {
    Object.assign(this, { host, pixi, layout, base, events });
    this.textures = new Map();
    this.zoom = 1;
    this.pan = { x: 0, y: 0 };
    this.items = [];
    this.selected = new Set();
    this.hover = null;
    this.flip = false;
    this.angle = 0;
    this.mode = "table";
    this.revealMode = {};
    this.typed = "";
    pixi.Assets.setPreferences({ preferWorkers: false });
    this.app = new pixi.Application();
    this.ready = this.app
      .init({
        width: 1000,
        height: 700,
        antialias: true,
        background: 0x15120f,
        preference: ["webgl"],
        failIfMajorPerformanceCaveat: false,
      })
      .then(() => {
        if (this.dead) {
          this.app.destroy(true, { children: true });
          return;
        }
        host.append(this.app.canvas);
        const canvas = this.app.canvas;
        canvas.tabIndex = 0;
        canvas.setAttribute("aria-label", "MTG table");
        this.world = new pixi.Container();
        this.tableLayer = new pixi.Container();
        this.objectLayer = new pixi.Container();
        this.overlay = new pixi.Graphics();
        this.world.addChild(this.tableLayer, this.objectLayer, this.overlay);
        this.app.stage.addChild(this.world);
        this.drawTable();
        this.observer = new ResizeObserver(() => this.resize());
        this.observer.observe(host);
        canvas.addEventListener("wheel", (event) => this.wheel(event), {
          passive: false,
        });
        canvas.addEventListener("contextmenu", (event) => event.preventDefault());
        canvas.addEventListener("pointerdown", (event) => this.down(event));
        canvas.addEventListener("pointermove", (event) => this.moveEvent(event));
        canvas.addEventListener("pointerup", (event) => this.up(event));
        canvas.addEventListener("pointerleave", () => this.setHover(null));
        this.keys = (event) => this.key(event);
        this.keysUp = (event) => {
          if (event.key === "Alt") this.events.zoom?.(null);
        };
        window.addEventListener("keydown", this.keys);
        window.addEventListener("keyup", this.keysUp);
        this.ticker = setInterval(() => this.tick(), 1000);
        this.initialized = true;
        this.resize();
      });
  }
  asset(name) {
    if (!name) return "";
    return /^https?:\/\//.test(name) ? proxied(name) : new URL("assets/" + name, this.base).href;
  }
  texture(name, redraw = true) {
    const url = this.asset(name);
    if (!url) return null;
    if (this.textures.has(url)) return this.textures.get(url);
    this.textures.set(url, null);
    this.pixi.Assets.load(url.startsWith("/api/fetch") ? { src: url, loadParser: "loadTextures", parser: "loadTextures" } : url)
      .then((texture) => {
        this.textures.set(url, texture);
        if (redraw && !this.dead) this.scheduleRender();
      })
      .catch(() => {});
    return null;
  }
  scheduleRender() {
    if (this.pending) return;
    this.pending = requestAnimationFrame(() => {
      this.pending = 0;
      this.render();
    });
  }
  resize() {
    if (!this.initialized) return;
    const { clientWidth: width, clientHeight: height } = this.host;
    this.app.renderer.resize(Math.max(320, width), Math.max(240, height));
    this.camera();
  }
  camera() {
    if (!this.initialized) return;
    const width = this.app.renderer.width / this.app.renderer.resolution,
      height = this.app.renderer.height / this.app.renderer.resolution;
    const area =
      this.mode === "seat" && (this.focusSeat || this.seat)
        ? { w: 64, h: 44, x: this.seatCenter().x, z: this.seatCenter().z }
        : { w: 126, h: 82, x: 0, z: 0 };
    const scale = Math.min(width / area.w, height / area.h) * this.zoom;
    this.scale = scale;
    this.world.scale.set(scale);
    this.world.rotation = this.angle;
    const c = Math.cos(this.angle), s = Math.sin(this.angle);
    const center = { x: (-area.x * c - area.z * s) * scale, y: (-area.x * s + area.z * c) * scale };
    this.world.position.set(width / 2 + center.x + this.pan.x, height / 2 + center.y + this.pan.y);
    this.app.render();
  }
  seatCenter() {
    const seat = this.layout.seats[this.focusSeat || this.seat];
    return { x: seat.playmat.x, z: seat.playmat.z + (seat.base === 180 ? -6 : 6) };
  }
  view(mode, seat = this.seat) {
    this.focusSeat = seat;
    if (seat && this.layout.seats[seat]) this.angle = this.layout.seats[seat].base === 0 ? Math.PI : 0;
    this.mode = mode;
    this.zoom = 1;
    this.pan = { x: 0, y: 0 };
    this.camera();
  }
  wheel(event) {
    event.preventDefault();
    const before = this.toWorld(event);
    this.zoom = Math.max(0.5, Math.min(8, this.zoom * (event.deltaY > 0 ? 0.88 : 1.14)));
    this.camera();
    const after = this.toWorld(event);
    this.shiftCamera(before, after);
    this.camera();
  }
  shiftCamera(before, after) {
    const dx = (after.x - before.x) * this.scale;
    const dy = -(after.z - before.z) * this.scale;
    this.pan.x += dx * Math.cos(this.angle) - dy * Math.sin(this.angle);
    this.pan.y += dx * Math.sin(this.angle) + dy * Math.cos(this.angle);
  }
  rotate(by) {
    if (!this.initialized) return;
    const rect = this.app.canvas.getBoundingClientRect();
    const center = { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
    const before = this.toWorld(center);
    this.angle += radians(by);
    this.camera();
    this.shiftCamera(before, this.toWorld(center));
    this.camera();
  }
  toWorld(event) {
    const rect = this.app.canvas.getBoundingClientRect();
    const point = this.world.toLocal({ x: event.clientX - rect.left, y: event.clientY - rect.top });
    return { x: point.x, z: -point.y };
  }
  update(state, viewer) {
    this.state = state;
    const seated = viewer && this.layout.seats[viewer];
    if (viewer !== this.seat) {
      this.seat = viewer;
      this.flip = seated ? seated.base === 0 : false;
      this.angle = this.flip ? Math.PI : 0;
      this.focusSeat = viewer;
      if (seated && !this.choseView) this.mode = "table";
      this.camera();
    }
    this.clock = state.now - Date.now();
    this.render();
  }
  text(value, height, color = 0xffffff, options = {}) {
    const node = new this.pixi.Text({
      text: String(value),
      style: {
        fontFamily: "Segoe UI, Arial, sans-serif",
        fontSize: 64,
        fill: color,
        fontWeight: options.weight || "600",
        align: "center",
        ...(options.stroke ? { stroke: { color: 0x000000, width: 10 } } : {}),
        ...(options.wrap ? { wordWrap: true, wordWrapWidth: options.wrap * (64 / height) } : {}),
      },
    });
    node.anchor.set(0.5);
    node.scale.set(height / 64);
    return node;
  }
  sprite(name, w, h, tint) {
    const texture = this.texture(name);
    if (!texture) return null;
    const node = new this.pixi.Sprite(texture);
    node.anchor.set(0.5);
    node.width = w;
    node.height = h;
    if (tint !== undefined) node.tint = tint;
    return node;
  }
  drawTable() {
    const layer = this.tableLayer;
    layer.removeChildren().forEach((child) => child.destroy({ children: true }));
    const { world, table } = this.layout;
    const wood = new this.pixi.Graphics()
      .roundRect(world.x0, -world.z1, world.x1 - world.x0, world.z1 - world.z0, 3)
      .fill(0x3b2617)
      .roundRect(world.x0 + 1.2, -world.z1 + 1.2, world.x1 - world.x0 - 2.4, world.z1 - world.z0 - 2.4, 2.4)
      .fill(0x2a2a2a);
    layer.addChild(wood);
    const image = this.sprite(table.image, table.x1 - table.x0, table.z1 - table.z0);
    if (image) {
      image.position.set((table.x0 + table.x1) / 2, -(table.z0 + table.z1) / 2);
      layer.addChild(image);
      this.tableDrawn = true;
    }
  }
  elapsed() {
    const seconds = Math.max(0, Math.floor((Date.now() + this.clock - this.state.turn.started) / 1000));
    return Math.floor(seconds / 60) + ":" + String(seconds % 60).padStart(2, "0");
  }
  tick() {
    if (!this.initialized || !this.timer || this.timer.destroyed) return;
    this.timer.text = this.elapsed();
    this.app.render();
  }
  build() {
    const state = this.state;
    const items = [];
    const card = this.layout.card;
    for (const object of state.objects) {
      let w, h;
      if (object.kind === "card" || object.kind === "deck") {
        const scale = object.scale || 1;
        [w, h] = [card.w * scale, card.h * scale];
      } else if (object.kind === "bag") [w, h] = sizes[object.template === "planechase" ? "planechase" : "bag"];
      else [w, h] = sizes[object.template] || [1, 1];
      items.push({ key: object.id, type: "object", object, x: object.x, z: object.z, w, h, rot: object.rot || 0, movable: !object.locked });
    }
    for (const [color, seat] of Object.entries(this.layout.seats)) {
      const hands = state.hands[color] || [[], []];
      hands.forEach((hand, index) => {
        const zone = seat.hands[index];
        if (!zone) return;
        const spacing = hand.length > 1 ? Math.min(2.35, (zone.w - card.w * 0.6) / (hand.length - 1)) : 0;
        const start = -((hand.length - 1) * spacing) / 2;
        hand.forEach((entry, slot) => {
          const along = start + slot * spacing;
          items.push({
            key: entry.id,
            type: "hand",
            object: entry,
            seat: color,
            hand: index,
            slot,
            x: zone.x + seat.right[0] * along,
            z: zone.z + seat.right[1] * along,
            w: card.w,
            h: card.h,
            rot: seat.base,
            movable: color === this.seat,
          });
        });
      });
      const button = (name, at, w, h, extra = {}) =>
        items.push({ key: color + ":" + name, type: "fixture", fixture: name, seat: color, x: at.x, z: at.z, w, h, rot: seat.base, ...extra });
      for (const [name, at] of Object.entries(seat.buttons)) button(name, at, 1.7, 1.7);
      button("mulligan", seat.mulligan, seat.mulligan.w, seat.mulligan.h);
      seat.commander.forEach((zone, index) => button("tax", zone, 2.2, 3.0, { index }));
      button("life", seat.life, 2.3, 2.1);
      button("timer", seat.timer, 2.2, 1.2);
    }
    this.items = items;
  }
  render() {
    if (!this.initialized || !this.state) return;
    if (!this.tableDrawn) this.drawTable();
    this.build();
    const layer = this.objectLayer;
    this.timer = null;
    layer.removeChildren().forEach((child) => child.destroy({ children: true }));
    const state = this.state;
    for (const [color, seat] of Object.entries(this.layout.seats)) {
      const tint = seatColors[color];
      const matBox = seat.playmat;
      const backing = new this.pixi.Graphics()
        .roundRect(matBox.x - matBox.w / 2, -matBox.z - matBox.h / 2, matBox.w, matBox.h, 0.4).fill({ color: 0x191b20, alpha: 0.25 });
      layer.addChild(backing);
      const playmat = state.playmats?.[color];
      if (playmat) {
        const mat = seat.playmat;
        const art = this.sprite(playmat, mat.w, mat.h);
        if (art) {
          art.position.set(mat.x, -mat.z);
          art.rotation = radians(seat.base - 180);
          layer.addChild(art);
        }
      }
      const marks = new this.pixi.Graphics();
      if (state.turn?.enabled && state.turn.color === color) {
        const mat = seat.playmat;
        marks.rect(mat.x - mat.w / 2, -mat.z - mat.h / 2, mat.w, mat.h).fill({ color: tint, alpha: 0.07 });
      }
      for (const zone of seat.hands)
        marks
          .rect(zone.x - zone.w / 2, -zone.z - Math.max(zone.h, 1.3) / 2, zone.w, Math.max(zone.h, 1.3))
          .fill({ color: tint, alpha: 0.12 })
          .stroke({ width: 0.08, color: tint, alpha: 0.6 });
      layer.addChild(marks);
      const owner = state.seats[color];
      const label = this.text(owner?.user ? owner.name : color + " (open)", 1.0, tint, { stroke: true });
      const hand = seat.hands[0];
      label.position.set(hand.x, -(hand.z + (seat.base === 180 ? -3.1 : 3.1)));
      label.rotation = radians(seat.base - 180);
      layer.addChild(label);
      const count = (state.hands[color]?.[0]?.length || 0) + (state.hands[color]?.[1]?.length || 0);
      if (count && color !== this.seat) {
        const counter = this.text(count + (count === 1 ? " card" : " cards"), 0.9, tint, { stroke: true });
        counter.position.set(hand.x, -(hand.z + (seat.base === 180 ? 4 : -4)));
        counter.rotation = radians(seat.base - 180);
        layer.addChild(counter);
      }
    }
    for (const item of this.items) {
      const node = this.draw(item);
      if (!node) continue;
      item.node = node;
      node.position.set(item.x, -item.z);
      if (item.type === "hand" || item.object?.kind === "card") {
        const shadow = new this.pixi.Graphics();
        shadow.roundRect(-item.w / 2, -item.h / 2, item.w, item.h, 0.12).fill({ color: 0x000000, alpha: 0.32 });
        shadow.rotation = node.rotation;
        shadow.position.set(item.x + 0.16, -item.z + 0.24);
        layer.addChild(shadow);
      }
      layer.addChild(node);
    }
    this.drawOverlay();
    this.app.render();
  }
  draw(item) {
    if (item.type === "fixture") return this.drawFixture(item);
    if (item.type === "hand") return this.drawCard(item, item.object, item.seat === this.seat ? item.object : null);
    const object = item.object;
    if (object.kind === "card") return this.drawCard(item, object, object.faceDown ? null : object);
    if (object.kind === "deck") return this.drawDeck(item, object);
    if (object.kind === "bag") return this.drawBag(item, object);
    return this.drawToken(item, object);
  }
  container(item, upright = true) {
    const node = new this.pixi.Container();
    node.rotation = radians((upright ? item.rot : 180) - 180);
    return node;
  }
  face(object) {
    return object.transformed && object.card?.dfc ? object.card.dfc : object.card;
  }
  drawCard(item, object, visible) {
    const node = this.container(item);
    const { w, h } = item;
    const face = visible && this.face(visible);
    const image = face ? face.face : object.back || this.layout.images.back;
    const art = this.sprite(image, w, h);
    const frame = new this.pixi.Graphics().roundRect(-w / 2, -h / 2, w, h, 0.12).fill(face ? 0x1d1b22 : 0x5a3b22);
    node.addChild(frame);
    if (art) node.addChild(art);
    else if (face) {
      const title = this.text(face.name, 0.26, 0xffffff, { wrap: w - 0.3 });
      title.position.set(0, -h / 2 + 0.4);
      const type = this.text(face.type || "", 0.18, 0xcfd3dc, { wrap: w - 0.3 });
      type.position.set(0, 0.2);
      node.addChild(title, type);
    }
    node.addChild(new this.pixi.Graphics().roundRect(-w / 2, -h / 2, w, h, 0.12).stroke({ width: 0.035, color: 0xffffff, alpha: 0.28 }));
    if (object.highlight && object.highlight.until > Date.now() + this.clock)
      node.addChild(new this.pixi.Graphics().roundRect(-w / 2 - 0.1, -h / 2 - 0.1, w + 0.2, h + 0.2, 0.18).stroke({ width: 0.14, color: seatColors[object.highlight.color] || 0xffffff }));
    if (object.token && face)
      node.addChild(this.badge("TOKEN", -w / 2 + 0.55, -h / 2 + 0.25, 0x333344, 0.2));
    const counters = object.counters || {};
    if (counters.plus !== undefined) {
      const sign = counters.plus >= 0 ? "+" : "";
      node.addChild(this.badge(sign + counters.plus + "/" + sign + counters.plus, w / 2 - 0.55, h / 2 - 0.85, 0x111111, 0.3));
    }
    if (object.pt) node.addChild(this.badge(object.pt[0] + " / " + object.pt[1], w / 2 - 0.55, h / 2 - 0.35, 0x111111, 0.3));
    if (counters.counter !== undefined) node.addChild(this.badge(String(counters.counter), -w / 2 + 0.4, h / 2 - 0.35, 0x111111, 0.32));
    if (counters.stun) node.addChild(this.badge("stun " + counters.stun, 0, h / 2 - 0.35, 0x553311, 0.24));
    (object.keywords || []).forEach((keyword, index) => {
      const y = -h / 2 + 0.9 + index * 0.55;
      const disc = new this.pixi.Graphics().circle(-w / 2 + 0.3, y, 0.25).fill(0x111111).stroke({ width: 0.04, color: 0xffffff });
      node.addChild(disc);
      const icon = keywordIcon[keyword] ? this.sprite("icons/" + keywordIcon[keyword], 0.32, 0.36) : null;
      if (icon) {
        icon.position.set(-w / 2 + 0.3, y);
        node.addChild(icon);
      } else {
        const letter = this.text(keyword.slice(0, 2), 0.24);
        letter.position.set(-w / 2 + 0.3, y);
        node.addChild(letter);
      }
    });
    if (object.tracker && face) this.drawTracker(node, object, w);
    if (object.prompt && object.prompt === this.seat) {
      for (const [label, x, color] of [["✗", -0.55, 0xff5555], ["✓", 0.55, 0x55dd77]]) {
        const box = new this.pixi.Graphics().roundRect(x - 0.42, h / 2 + 0.15, 0.84, 0.7, 0.12).fill(0x2a2a2a).stroke({ width: 0.05, color: 0xb3b3b3 });
        const glyph = this.text(label, 0.5, color);
        glyph.position.set(x, h / 2 + 0.5);
        node.addChild(box, glyph);
      }
    }
    return node;
  }
  drawTracker(node, object, w) {
    const unit = w / 2;
    object.tracker.rooms.forEach((room, index) => {
      const pressed =
        object.tracker.mode === "level" ? index < object.pressed : object.pressed === index + 1;
      if (!pressed) return;
      node.addChild(
        new this.pixi.Graphics()
          .rect((room.x - room.w / 2) * unit, (room.z - room.h / 2) * unit, room.w * unit, room.h * unit)
          .fill({ color: object.tracker.mode === "level" ? 0x000000 : 0xffffff, alpha: object.tracker.mode === "level" ? 0.55 : 0.45 }),
      );
    });
    if (object.tracker.mode === "level") {
      const level = this.badge(String(object.pressed), 0, -0.9 * unit, 0x000000, 0.4);
      node.addChild(level);
    }
  }
  badge(value, x, y, color, height) {
    const label = this.text(value, height, 0xffffff, { weight: "700" });
    const width = Math.max(height * 1.3, label.width + height * 0.6);
    const node = new this.pixi.Container();
    node.addChild(new this.pixi.Graphics().roundRect(-width / 2, -height * 0.7, width, height * 1.4, height * 0.5).fill({ color, alpha: 0.88 }).stroke({ width: 0.03, color: 0xffffff, alpha: 0.7 }));
    node.addChild(label);
    node.position.set(x, y);
    return node;
  }
  drawDeck(item, deck) {
    const node = this.container(item);
    const { w, h } = item;
    const depth = Math.min(0.5, deck.count * 0.006);
    node.addChild(new this.pixi.Graphics().roundRect(-w / 2 + depth, -h / 2 + depth, w, h, 0.12).fill(0x0b0b0b).roundRect(-w / 2 + depth / 2, -h / 2 + depth / 2, w, h, 0.12).fill(0x2b2b2b));
    const edges = new this.pixi.Graphics();
    for (let offset = depth; offset > 0; offset -= 0.07)
      edges.roundRect(-w / 2 + offset, -h / 2 + offset, w, h, 0.12).fill(0xb6ada0).stroke({ width: 0.025, color: 0x39332d });
    node.addChild(edges);
    const image = deck.top ? deck.top.face : deck.back || this.layout.images.back;
    node.addChild(new this.pixi.Graphics().roundRect(-w / 2, -h / 2, w, h, 0.12).fill(0x5a3b22));
    const art = this.sprite(image, w, h);
    if (art) node.addChild(art);
    node.addChild(this.badge(String(deck.count), w / 2 - 0.35, -h / 2 + 0.3, 0x000000, 0.3));
    if (deck.name) {
      const name = this.badge(deck.name, 0, h / 2 + 0.3, 0x000000, 0.24);
      node.addChild(name);
    }
    return node;
  }
  drawBag(item, bag) {
    const node = new this.pixi.Container();
    const [w, h] = [item.w, item.h];
    node.rotation = this.flip ? Math.PI : 0;
    node.addChild(new this.pixi.Graphics().roundRect(-w / 2, -h / 2, w, h, 0.25).fill({ color: 0x1b1b1b, alpha: 0.92 }).stroke({ width: 0.06, color: 0x8a7a5a }));
    const inner = this.bagFace(bag, w * 0.78, h * 0.78);
    if (inner) node.addChild(inner);
    if (bag.template !== "planechase") {
      const infinity = this.text("∞", 0.32, 0xd8c79a);
      infinity.position.set(w / 2 - 0.22, h / 2 - 0.22);
      node.addChild(infinity);
    }
    return node;
  }
  bagFace(bag, w, h) {
    const sample = { ...bag, kind: this.spawnKind(bag.template), value: bag.template === "die" ? "d" + bag.sides : bag.template === "plusxy" ? 1 : 0, value2: 1 };
    if (bag.template === "planechase") {
      const label = this.text(bag.unpacked ? "Planechase\n(unpacked)" : "Planechase", 0.36, 0xd8c79a, { wrap: w });
      return label;
    }
    return this.tokenFace(sample, w, h, true);
  }
  spawnKind(template) {
    return template === "die" ? "die" : template === "notecard" ? "note" : template === "krark" ? "tile" : ["keyword", "status", "drop-counter", "skipper"].includes(template) ? "token" : "counter";
  }
  drawToken(item, object) {
    const node = this.container(item);
    const face = this.tokenFace(object, item.w, item.h, false);
    if (face) node.addChild(face);
    return node;
  }
  tokenFace(object, w, h, small) {
    const node = new this.pixi.Container();
    const add = (child) => child && node.addChild(child);
    const value = (text, size = 0.5, color = 0xffffff, y = 0) => {
      const label = this.text(text, size, color, { stroke: true, weight: "800" });
      label.position.set(0, y);
      node.addChild(label);
    };
    switch (object.template) {
      case "commander-damage":
        add(this.sprite("commander-damage.png", w, h, seatColors[object.tint || object.color] ?? 0xffffff));
        value(object.value ?? 0, h * 0.42, 0xffffff, h * 0.08);
        break;
      case "die":
      case "first":
      case "planar": {
        const color = object.template === "first" ? 0xf2f2f2 : object.template === "planar" ? 0x3a2a5a : 0x222222;
        node.addChild(new this.pixi.Graphics().roundRect(-w / 2, -h / 2, w, h, w * 0.2).fill(color).stroke({ width: 0.05, color: 0xbbbbbb }));
        const shown = object.template === "first" ? (object.value === "?" ? "Who goes\nfirst?" : object.value) : object.sides === 2 && typeof object.value === "number" ? (object.value === 1 ? "H" : "T") : object.value;
        value(shown || " ", object.template === "first" ? 0.28 : h * 0.42, object.template === "first" ? seatColors[object.value] ?? 0x222222 : 0xffffff);
        break;
      }
      case "keyword": {
        node.addChild(new this.pixi.Graphics().circle(0, 0, w / 2).fill(0x101010).stroke({ width: 0.06, color: 0xd9d9d9 }));
        const icon = keywordIcon[object.keyword] && this.sprite("icons/" + keywordIcon[object.keyword], w * 0.5, h * 0.56);
        if (icon) add(icon);
        else value(object.keyword.slice(0, 2), h * 0.4);
        if (!small) value(object.keyword, 0.2, 0xffffff, h / 2 + 0.15);
        break;
      }
      case "status":
        add(this.sprite(statusImage[object.status], w, h));
        if (!small) value(object.status, 0.2, 0xffffff, h / 2 + 0.15);
        break;
      case "suspend":
        add(this.sprite("suspend.png", w, h));
        if (!small) value(object.value ?? 0, h * 0.45);
        break;
      case "mana":
        add(this.sprite(manaImage[object.mana], w, h));
        if (!small) value(object.value ?? 0, h * 0.45);
        break;
      case "loyalty":
        add(this.sprite("loyalty.png", w, h));
        value(object.value ?? 0, h * 0.5);
        break;
      case "plusxy":
        add(this.sprite("plusxy.png", w, h, 0x202020));
        value((object.value >= 0 ? "+" : "") + object.value + "/" + (object.value2 >= 0 ? "+" : "") + object.value2, h * 0.45);
        break;
      case "counter":
        add(this.sprite("counter.png", w, h, 0xe8e8e8));
        value(object.value ?? 0, h * 0.5, 0x161616);
        break;
      case "text":
        add(this.sprite("notecard.png", w, h, 0xe8e8e8));
        value(small ? "Text" : object.text || "", h * 0.22, 0x161616, -h * 0.22);
        value(object.value ?? 0, h * 0.34, 0x161616, h * 0.15);
        break;
      case "notecard": {
        add(this.sprite("notecard.png", w, h, 0xfff9d6));
        const note = this.text(small ? "Notecard" : object.text || "type here", small ? 0.3 : 0.2, 0x222222, { wrap: w - 0.25, weight: "500" });
        node.addChild(note);
        break;
      }
      case "drop-counter":
        add(this.sprite("drop-counter.png", w, h));
        break;
      case "player-counter":
        add(this.sprite(counterImage[object.counter], w, h));
        if (!small) value(object.value ?? 0, h * 0.32, 0xffffff, h * 0.05);
        break;
      case "rhystic":
        add(this.sprite("rhystic.png", w, h, small ? 0xffffff : seatColors[object.tint] ?? 0xffffff));
        if (!small) value(object.value ?? 1, h * 0.42);
        break;
      case "skipper": {
        const tint = object.color ? seatColors[object.color] : 0x808080;
        node.addChild(new this.pixi.Graphics().circle(0, 0, w / 2).fill(object.faceDown ? 0x202020 : tint).stroke({ width: 0.08, color: tint }));
        value(object.faceDown ? "SKIP" : "⏭", small ? 0.4 : 0.32, object.faceDown ? tint : 0x111111);
        break;
      }
      case "krark": {
        add(this.sprite("krark.jpg", w, h));
        if (small) break;
        const rows = ["Flip a Coin", "Flip X Coins  (X=" + (object.count ?? 1) + ")", "Flip 'til Fail", "Flip 'til Success", "Krark's Thumb? " + (object.thumb ? "Yes" : "No")];
        rows.forEach((label, index) => {
          const y = -h * 0.22 + index * 0.55;
          node.addChild(new this.pixi.Graphics().roundRect(-w * 0.42, y - 0.22, w * 0.84, 0.44, 0.08).fill({ color: 0x1a1a1a, alpha: 0.93 }));
          const text = this.text(label, 0.22, 0xffffff);
          text.position.set(0, y);
          node.addChild(text);
        });
        break;
      }
      case "monarch":
        node.addChild(new this.pixi.Graphics().circle(0, 0, w / 2).fill(0x5a3f0f).stroke({ width: 0.08, color: 0xf2c94c }));
        value("♛", h * 0.55, 0xf2c94c);
        break;
      default:
        node.addChild(new this.pixi.Graphics().roundRect(-w / 2, -h / 2, w, h, 0.2).fill(0x444444));
    }
    return node;
  }
  drawFixture(item) {
    const node = this.container(item);
    const seat = item.seat;
    const tint = seatColors[seat];
    const state = this.state;
    const player = state.players?.[seat] || {};
    switch (item.fixture) {
      case "draw":
      case "scry":
      case "mill":
      case "untap": {
        node.addChild(new this.pixi.Graphics().circle(0, 0, 0.82).fill(0x000000).stroke({ width: 0.06, color: 0x555555 }));
        const icon = this.sprite(item.fixture + ".png", 1.6, 1.6);
        if (icon) node.addChild(icon);
        break;
      }
      case "reveal": {
        node.addChild(new this.pixi.Graphics().circle(0, 0, 0.82).fill(0x000000).stroke({ width: 0.06, color: 0x555555 }));
        const icon = this.sprite("reveal.png", 1.6, 1.6);
        if (icon) {
          if (this.revealMode[seat] === "stack") icon.rotation = Math.PI;
          node.addChild(icon);
        }
        break;
      }
      case "mulligan": {
        const art = this.sprite("mulligan.png", item.w, item.h);
        if (art) node.addChild(art);
        break;
      }
      case "tax": {
        const tax = player.tax?.[item.index] ?? 0;
        const label = this.text(tax, 1.0, tint, { stroke: true, weight: "800" });
        label.position.set(0, -1.15);
        node.addChild(label);
        break;
      }
      case "life": {
        const heart = this.sprite("life.png", 2.1, 2.1, tint);
        if (heart) node.addChild(heart);
        const seated = state.seats?.[seat]?.user;
        const life = this.text(player.life ?? 40, 0.85, 0xffffff, { weight: "800" });
        life.alpha = seated ? 1 : 0.25;
        life.position.set(0, -0.12);
        node.addChild(life);
        for (const [label, x, y] of [["▲", 1.45, -0.35], ["▼", -1.45, -0.35], ["+20", 1.55, 0.55], ["-20", -1.55, 0.55], ["R", 1.15, 1.05]]) {
          const glyph = this.text(label, 0.32, 0xffffff);
          glyph.alpha = seated ? 0.55 : 0.18;
          glyph.position.set(x, y);
          node.addChild(glyph);
        }
        break;
      }
      case "timer": {
        if (!state.timersOn) break;
        const mine = state.turn?.enabled && state.turn.color === seat;
        if (mine) {
          const label = this.text(this.elapsed(), 0.62, tint, { weight: "700" });
          this.timer = label;
          node.addChild(label);
          const turn = this.text("turn " + (player.turns || 0), 0.38, tint);
          turn.position.set(0, -0.85);
          node.addChild(turn);
        }
        break;
      }
    }
    return node;
  }
  drawOverlay() {
    const overlay = this.overlay;
    overlay.clear();
    for (const item of this.items) {
      const selected = this.selected.has(item.key);
      const hovered = this.hover === item.key && item.type !== "fixture";
      if (!selected && !hovered) continue;
      this.outline(overlay, item, selected ? 0x4fc3ff : 0xffffff, selected ? 0.12 : 0.07);
    }
    if (this.box) {
      const { a, b } = this.box;
      overlay.rect(Math.min(a.x, b.x), -Math.max(a.z, b.z), Math.abs(a.x - b.x), Math.abs(a.z - b.z)).fill({ color: 0x4fc3ff, alpha: 0.12 }).stroke({ width: 0.06, color: 0x4fc3ff });
    }
    if (this.dropHint) this.outline(overlay, this.dropHint, 0x7dff9a, 0.16);
  }
  outline(graphics, item, color, width) {
    const corners = this.corners(item).map(([x, z]) => ({ x, y: -z }));
    graphics.poly(corners.flatMap((point) => [point.x, point.y]), true).stroke({ width, color });
  }
  corners(item) {
    const angle = radians(item.rot - 180);
    const cos = Math.cos(angle),
      sin = Math.sin(angle);
    return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => {
      const lx = (sx * item.w) / 2,
        ly = (sy * item.h) / 2;
      return [item.x + lx * cos - ly * sin, item.z - (lx * sin + ly * cos)];
    });
  }
  local(item, point) {
    const angle = radians(item.rot - 180);
    const dx = point.x - item.x,
      dy = -(point.z - item.z);
    return { x: dx * Math.cos(angle) + dy * Math.sin(angle), y: -dx * Math.sin(angle) + dy * Math.cos(angle) };
  }
  contains(item, point, pad = 0) {
    const local = this.local(item, point);
    return Math.abs(local.x) <= item.w / 2 + pad && Math.abs(local.y) <= item.h / 2 + pad;
  }
  pick(point, filter = () => true) {
    const ordered = [
      ...this.items.filter((item) => item.type === "fixture"),
      ...this.items.filter((item) => item.type === "object"),
      ...this.items.filter((item) => item.type === "hand"),
    ];
    for (let index = ordered.length - 1; index >= 0; index--) {
      const item = ordered[index];
      if (item.type === "object" && item.object.prompt === this.seat && this.promptHit(item, point)) return item;
      if (filter(item) && this.contains(item, point)) return item;
    }
    return null;
  }
  promptHit(item, point) {
    const local = this.local(item, point);
    if (local.y < item.h / 2 + 0.1 || local.y > item.h / 2 + 0.9) return null;
    if (Math.abs(local.x + 0.55) < 0.45) return "decline";
    if (Math.abs(local.x - 0.55) < 0.45) return "accept";
    return null;
  }
  setHover(key) {
    if (this.hover === key) return;
    this.hover = key;
    const item = this.items.find((entry) => entry.key === key);
    this.events.hover?.(item || null);
    this.drawOverlay();
    this.app.render();
  }
  down(event) {
    this.app.canvas.focus({ preventScroll: true });
    const point = this.toWorld(event);
    const item = this.pick(point);
    this.press = { event, point, item, start: { x: event.clientX, y: event.clientY }, time: Date.now(), button: event.button, moved: false, shift: event.shiftKey };
    this.app.canvas.setPointerCapture(event.pointerId);
    if (event.button === 1 || (event.button === 0 && this.spaceDown)) this.press.pan = { ...this.pan };
    else if (event.button === 2) this.press.pan = { ...this.pan, right: true };
  }
  moveEvent(event) {
    const point = this.toWorld(event);
    if (!this.press) {
      this.pointer = point;
      const item = this.pick(point);
      this.setHover(item?.key || null);
      if (event.altKey) this.events.zoom?.(item || null);
      this.app.canvas.style.cursor = item && (item.type === "fixture" || item.object?.kind === "bag" || item.movable) ? "pointer" : "default";
      return;
    }
    const press = this.press;
    const distance = Math.hypot(event.clientX - press.start.x, event.clientY - press.start.y);
    if (!press.moved && distance < 5) return;
    press.moved = true;
    if (press.pan) {
      this.pan.x = press.pan.x + (event.clientX - press.start.x);
      this.pan.y = press.pan.y + (event.clientY - press.start.y);
      this.camera();
      return;
    }
    if (press.button !== 0) return;
    if (!press.drag) this.beginDrag(press);
    const drag = press.drag;
    if (!drag) return;
    const dx = point.x - press.point.x,
      dz = point.z - press.point.z;
    for (const entry of drag.items) {
      if (!entry.node) continue;
      entry.node.position.set(entry.x + dx, -(entry.z + dz));
      entry.node.alpha = 0.85;
    }
    if (drag.ghost) drag.ghost.position.set(point.x, -point.z);
    if (drag.box) {
      this.box = { a: press.point, b: point };
      this.drawOverlay();
    } else this.dropHint = this.dropTarget(drag, point)?.pile || null;
    if (!drag.box) this.drawOverlay();
    this.app.render();
  }
  beginDrag(press) {
    const item = press.item;
    if (!item || item.type === "fixture") {
      press.drag = { box: true, items: [] };
      return;
    }
    if (item.type === "object" && item.object.kind === "bag") {
      const face = this.bagFace(item.object, 1.1, 1.1);
      const ghost = new this.pixi.Container();
      if (face) ghost.addChild(face);
      ghost.alpha = 0.85;
      this.objectLayer.addChild(ghost);
      press.drag = { bag: item, ghost, items: [] };
      return;
    }
    if (item.type === "object" && item.object.kind === "deck" && !press.shift && Date.now() - press.time < 350) {
      const card = { ...item, key: item.key + ":top", type: "ghost", w: this.layout.card.w, h: this.layout.card.h };
      const node = this.drawCard(card, { back: item.object.back }, item.object.top ? { card: item.object.top } : null);
      node.position.set(item.x, -item.z);
      this.objectLayer.addChild(node);
      card.node = node;
      press.drag = { take: item, items: [card] };
      return;
    }
    if (!item.movable) {
      press.drag = { box: true, items: [] };
      return;
    }
    if (!this.selected.has(item.key)) {
      if (!press.event.ctrlKey) this.selected.clear();
      this.selected.add(item.key);
    }
    const items = this.items.filter((entry) => this.selected.has(entry.key) && entry.movable && (entry.type === "object" || entry.seat === this.seat));
    press.drag = { items };
  }
  dropTarget(drag, point) {
    if (drag.box) return null;
    const moving = new Set(drag.items.map((entry) => entry.key.replace(/:top$/, "")));
    if (drag.take) moving.add(drag.take.key);
    const seat = this.seat && this.layout.seats[this.seat];
    if (seat && !drag.bag) {
      for (const [index, zone] of seat.hands.entries()) {
        const area = { x: zone.x, z: zone.z, w: zone.w + 1, h: Math.max(zone.h, 1.3) + (index ? 1.8 : 1.5), rot: 180 };
        if (this.contains(area, point)) {
          const hand = this.state.hands[this.seat][index].filter((entry) => !moving.has(entry.id));
          const along = (point.x - zone.x) * seat.right[0] + (point.z - zone.z) * seat.right[1];
          const spacing = hand.length > 1 ? Math.min(2.35, (zone.w - this.layout.card.w * 0.6) / (hand.length - 1)) : 0;
          const start = -((hand.length - 1) * spacing) / 2;
          let at = hand.length;
          for (let slot = 0; slot < hand.length; slot++)
            if (along < start + slot * spacing) {
              at = slot;
              break;
            }
          return { hand: index, at };
        }
      }
    }
    const kinds = drag.items.map((entry) => entry.object?.kind || "card");
    const cards = drag.take || kinds.every((kind) => kind === "card" || kind === "deck");
    const dropCounter = drag.items.length === 1 && drag.items[0].object?.template === "drop-counter";
    const pile = this.pick(point, (item) => item.type === "object" && !moving.has(item.key) && (((cards || dropCounter) && (item.object.kind === "card" || (!dropCounter && item.object.kind === "deck"))) || (!cards && item.object.kind === "bag")));
    if (pile) return pile.object.kind === "bag" ? { bag: pile.key, pile } : { onto: pile.key, pile };
    return null;
  }
  up(event) {
    const press = this.press;
    this.press = null;
    try {
      this.app.canvas.releasePointerCapture(event.pointerId);
    } catch {}
    if (!press) return;
    const point = this.toWorld(event);
    this.dropHint = null;
    if (press.pan) {
      if (press.pan.right && !press.moved) this.contextMenu(event, press.item, point);
      return;
    }
    if (!press.moved) return this.click(event, press, point);
    const drag = press.drag;
    if (!drag) return;
    if (drag.box) {
      this.box = null;
      if (!event.ctrlKey) this.selected.clear();
      const area = { a: press.point, b: point };
      for (const item of this.items)
        if (item.movable && item.type === "object" && item.x >= Math.min(area.a.x, area.b.x) && item.x <= Math.max(area.a.x, area.b.x) && item.z >= Math.min(area.a.z, area.b.z) && item.z <= Math.max(area.a.z, area.b.z))
          this.selected.add(item.key);
      this.drawOverlay();
      this.app.render();
      return;
    }
    const target = this.dropTarget(drag, point);
    const dx = point.x - press.point.x,
      dz = point.z - press.point.z;
    if (drag.bag) {
      if (drag.ghost) drag.ghost.destroy({ children: true });
      if (target?.bag === drag.bag.key) return this.render();
      return this.events.act("take_from_bag", { id: drag.bag.key, x: point.x, z: point.z });
    }
    if (drag.take) {
      const payload = { id: drag.take.key };
      if (target?.hand !== undefined) payload.toHand = { index: target.hand, at: target.at };
      else if (target?.onto) payload.onto = target.onto;
      else Object.assign(payload, { x: drag.take.x + dx, z: drag.take.z + dz });
      return this.events.act("take", payload);
    }
    const moves = drag.items.map((entry) => ({ id: entry.key, x: entry.x + dx, z: entry.z + dz }));
    const payload = { moves };
    if (target?.hand !== undefined) payload.toHand = { index: target.hand, at: target.at };
    else if (target?.onto) payload.onto = target.onto;
    else if (target?.bag) payload.toBag = target.bag;
    this.events.act("move", payload);
  }
  click(event, press, point) {
    const item = press.item;
    if (event.button === 2) return this.contextMenu(event, item, point);
    if (!item) {
      if (!event.ctrlKey && this.selected.size) {
        this.selected.clear();
        this.drawOverlay();
        this.app.render();
      }
      return;
    }
    const alt = event.button === 2;
    if (item.type === "fixture") return this.fixtureClick(item, alt, point);
    const object = item.object;
    if (item.type === "object") {
      const prompt = object.prompt === this.seat && this.promptHit(item, point);
      if (prompt) return this.events.act("resolve", { accept: prompt === "accept" });
      if (object.tracker && !object.faceDown) {
        const room = this.room(item, point);
        if (room) return this.events.act("tracker", { id: item.key, room });
      }
      if (object.kind === "counter") return this.counterClick(item, false, point);
      if (object.kind === "die") return this.events.act("roll", { id: item.key });
      if (object.template === "krark") return this.krarkClick(item, point);
      if (object.template === "notecard" || object.template === "text") {
        const local = this.local(item, point);
        if (object.template === "notecard" || local.y < 0) return this.events.edit(item);
      }
    }
    if (event.ctrlKey) {
      if (this.selected.has(item.key)) this.selected.delete(item.key);
      else this.selected.add(item.key);
    } else {
      this.selected.clear();
      this.selected.add(item.key);
    }
    this.drawOverlay();
    this.app.render();
  }
  room(item, point) {
    const local = this.local(item, point);
    const unit = item.w / 2;
    const rooms = item.object.tracker.rooms;
    for (let index = rooms.length - 1; index >= 0; index--) {
      const room = rooms[index];
      if (Math.abs(local.x / unit - room.x) <= room.w / 2 && Math.abs(local.y / unit - room.z) <= room.h / 2) return index + 1;
    }
    return 0;
  }
  counterClick(item, alt, point) {
    const object = item.object;
    if (object.template === "plusxy") {
      const local = this.local(item, point);
      const third = item.w / 6;
      if (local.x < -third) return this.events.act("counter", { id: item.key, delta: alt ? -1 : 1 });
      if (local.x > third) return this.events.act("counter", { id: item.key, field: "value2", delta: alt ? -1 : 1 });
      return this.events.act("counter", { id: item.key, delta: alt ? -1 : 1 }).then(() => this.events.act("counter", { id: item.key, field: "value2", delta: alt ? -1 : 1 }));
    }
    if (object.template === "text") {
      const local = this.local(item, point);
      if (local.y < 0) return this.events.edit(item);
    }
    return this.events.act("counter", { id: item.key, delta: alt ? -1 : 1 });
  }
  krarkClick(item, point) {
    const local = this.local(item, point);
    const row = Math.round((local.y + item.h * 0.22) / 0.55);
    if (Math.abs(local.x) > item.w * 0.42 || row < 0 || row > 4 || Math.abs(local.y - (-item.h * 0.22 + row * 0.55)) > 0.24) return;
    const modes = ["one", "x", "fail", "success", "thumb"];
    if (modes[row] === "x") {
      const count = this.events.ask("X=?", String(item.object.count ?? 1));
      if (count === null) return;
      return this.events.act("coin", { id: item.key, mode: "x", count });
    }
    return this.events.act("coin", { id: item.key, mode: modes[row] });
  }
  fixtureClick(item, alt, point) {
    const seat = item.seat;
    const count = alt ? 3 : 1;
    switch (item.fixture) {
      case "draw":
      case "scry":
      case "mill":
        return this.events.act("button", { seat, button: item.fixture, count });
      case "untap":
        return this.events.act("button", { seat, button: "untap" });
      case "reveal":
        if (alt) {
          this.revealMode[seat] = this.revealMode[seat] === "stack" ? "fan" : "stack";
          return this.render();
        }
        return this.events.act("button", { seat, button: this.revealMode[seat] === "stack" ? "stack" : "fan" });
      case "mulligan":
        return this.events.mulligan(alt);
      case "tax":
        return this.events.act("tax", { seat, index: item.index, delta: alt ? -2 : 2 });
      case "life": {
        const local = this.local(item, point);
        if (local.x > 1.1 && local.y > 0.8) return this.events.act("resetLife", { seat });
        if (local.x > 1.0) return this.events.act("life", { seat, delta: (local.y > 0.15 ? 20 : 1) * (alt ? 5 : 1) });
        if (local.x < -1.0) return this.events.act("life", { seat, delta: -(local.y > 0.15 ? 20 : 1) * (alt ? 5 : 1) });
        return this.events.act("life", { seat, delta: alt ? -1 : 1 });
      }
      case "timer":
        return this.events.act("turnCount", { seat, delta: alt ? -1 : 1 });
    }
  }
  contextMenu(event, item, point) {
    if (item?.type === "fixture") return this.fixtureClick(item, true, point);
    if (item?.type === "object" && item.object.kind === "counter" && !event.shiftKey) return this.counterClick(item, true, point);
    if (item && !this.selected.has(item.key)) {
      this.selected.clear();
      this.selected.add(item.key);
      this.drawOverlay();
      this.app.render();
    }
    this.events.menu(item, event.clientX, event.clientY, point);
  }
  selection() {
    if (this.selected.size) return [...this.selected].filter((key) => this.items.some((item) => item.key === key));
    return this.hover ? [this.hover] : [];
  }
  hovered() {
    return this.items.find((item) => item.key === this.hover) || null;
  }
  key(event) {
    const target = event.target;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)) return;
    if (!this.host.isConnected || !this.state) return;
    if (event.key === " ") {
      this.spaceDown = true;
      setTimeout(() => (this.spaceDown = false), 400);
    }
    const item = this.hovered();
    if (event.key === "[" || event.key === "]") {
      event.preventDefault();
      this.rotate(event.key === "[" ? -45 : 45);
      return;
    }
    if (event.key === "Escape") this.events.zoom?.(null);
    if (event.key === "Alt") {
      event.preventDefault();
      if (item) this.events.zoom?.(item);
      return;
    }
    if (/^Numpad\d$/.test(event.code)) {
      event.preventDefault();
      return this.events.act("keybind", { index: Number(event.code.slice(6)), ids: [...this.selected].filter((key) => this.items.some((entry) => entry.key === key && entry.type !== "fixture")), hover: item?.type === "object" || item?.type === "hand" ? item.key : undefined });
    }
    if (/^\d$/.test(event.key) && item) {
      this.typed += event.key;
      clearTimeout(this.typedTimer);
      this.typedTimer = setTimeout(() => {
        const value = Number(this.typed);
        this.typed = "";
        this.typedNumber(item, value);
      }, 700);
      return;
    }
    const keys = this.selection().filter((key) => {
      const entry = this.items.find((candidate) => candidate.key === key);
      return entry && entry.type !== "fixture" && (entry.type === "object" || entry.seat === this.seat);
    });
    const objects = keys.filter((key) => this.items.find((entry) => entry.key === key)?.type === "object");
    switch (event.key.toLowerCase()) {
      case "f":
        if (objects.length) this.events.act("flip", { ids: objects });
        break;
      case "q":
        if (objects.length) this.events.act("rotate", { ids: objects, by: -90 });
        break;
      case "e":
        if (objects.length) this.events.act("rotate", { ids: objects, by: 90 });
        break;
      case "r":
        for (const key of objects) {
          const entry = this.items.find((candidate) => candidate.key === key);
          if (entry.object.kind === "deck") this.events.act("shuffle", { id: key });
          if (entry.object.kind === "die") this.events.act("roll", { id: key });
        }
        break;
      case "g":
        if (objects.length > 1) this.events.act("group", { ids: objects });
        break;
      case "delete":
        if (keys.length) this.events.act("remove", { ids: keys });
        this.selected.clear();
        break;
      case "escape":
        this.selected.clear();
        this.drawOverlay();
        this.app.render();
        break;
      default:
        return;
    }
    event.preventDefault();
  }
  typedNumber(item, value) {
    if (item.type === "fixture") {
      if (["draw", "scry", "mill"].includes(item.fixture)) return this.events.act("button", { seat: item.seat, button: item.fixture, count: value });
      if (item.fixture === "reveal") return this.events.act("button", { seat: item.seat, button: this.revealMode[item.seat] === "stack" ? "stack" : "fan", count: value });
      if (item.fixture === "life") return this.events.act("life", { seat: item.seat, set: value });
      return;
    }
    const object = item.object;
    if (item.type !== "object") return;
    if (object.kind === "deck") return this.events.act("deal", { id: item.key, count: value });
    if (object.kind === "counter") return this.events.act("counter", { id: item.key, set: value });
    if (object.template === "krark") return this.events.act("coin", { id: item.key, mode: "x", count: value });
  }
  destroy() {
    this.dead = true;
    clearInterval(this.ticker);
    window.removeEventListener("keydown", this.keys);
    window.removeEventListener("keyup", this.keysUp);
    this.observer?.disconnect();
    if (this.initialized) this.app.destroy(true, { children: true });
  }
}
