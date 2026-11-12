import {
  magicLayout,
  stationView,
  tableView,
  cardControls,
} from "./layout.mjs";
import { pileToWorld, worldToPile, pileAtPoint } from "./cardtable-layout.mjs";
import { text } from "./text.mjs";
import { resolveStep } from "./battlemap.mjs";

export class MagicCanvas {
  constructor(host, pixi, select, move, act) {
    Object.assign(this, { host, pixi, select, move, act });
    this.textures = new Map();
    this.focus = undefined;
    this.zoom = 1;
    this.panOffset = { x: 0, y: 0 };
    this.app = new pixi.Application();
    this.ready = this.app
      .init({
        width: 1000,
        height: 700,
        autoStart: false,
        antialias: true,
        background: 0x10131c,
        preference: ["webgl"],
        failIfMajorPerformanceCaveat: false,
      })
      .then(() => {
        if (this.dead) {
          this.app.destroy(true, { children: true });
          return;
        }
        host.append(this.app.canvas);
        this.app.canvas.setAttribute("aria-label", "Magic playmat");
        this.observer = new ResizeObserver(() => this.render());
        this.observer.observe(host);
        this.wheel = (event) => {
          event.preventDefault();
          this.zoom = Math.max(
            0.45,
            Math.min(3, this.zoom * (event.deltaY > 0 ? 0.9 : 1.1)),
          );
          this.render();
        };
        this.app.canvas.addEventListener("wheel", this.wheel, {
          passive: false,
        });
        this.app.canvas.addEventListener("contextmenu", (event) =>
          event.preventDefault(),
        );
        this.initialized = true;
        this.render();
      });
  }
  update(state, user, map, selected) {
    Object.assign(this, { state, user, map, selected });
    this.render();
  }
  view(player) {
    this.focus = player;
    this.choseView = true;
    this.zoom = 1;
    this.panOffset = { x: 0, y: 0 };
    this.render();
  }
  label(value, x, y, size = 0.18, color = 0xeef2fa) {
    const node = new this.pixi.Text({
      text: text(value),
      style: { fontFamily: "Segoe UI", fontSize: size * 100, fill: color },
    });
    node.scale.set(0.01);
    node.position.set(x, y);
    return node;
  }
  texture(url) {
    if (!url) return null;
    if (this.textures.has(url)) return this.textures.get(url);
    this.textures.set(url, null);
    this.pixi.Assets.load(url)
      .then((texture) => {
        if (!this.dead) {
          this.textures.set(url, texture);
          this.render();
        }
      })
      .catch(() => {});
    return null;
  }
  decoration(spec, parent, card) {
    if (spec.visible === false) return;
    const node = new this.pixi.Container();
    const width = spec.width || 0,
      height = spec.height || 0;
    const origin =
      spec.orientation === undefined
        ? { x: spec.x || 0, y: spec.y || 0 }
        : pileToWorld(
            { ...spec, orientation: spec.orientation || 0 },
            { x: 0, y: 0 },
          );
    node.position.set(origin.x, origin.y);
    node.rotation = ((spec.orientation || 0) * Math.PI) / 180;
    if (spec.box || (spec.color && spec.color !== "#00000000")) {
      const shape = new this.pixi.Graphics().roundRect(
        0,
        0,
        width,
        height,
        Math.min(width, height, (spec.radius || 0) / 64),
      );
      shape.fill(spec.color || "#00000000");
      if (spec.border)
        shape.stroke({
          color: spec.border,
          width: (spec.borderWidth || 1) / 64,
        });
      node.addChild(shape);
    }
    for (const image of spec.images || []) {
      if (!image.key) continue;
      const texture = this.texture(image.key);
      if (!texture) continue;
      const sprite = new this.pixi.Sprite(texture);
      sprite.position.set(image.x || 0, image.y || 0);
      sprite.width = image.width;
      sprite.height = image.height;
      node.addChild(sprite);
    }
    for (const label of spec.texts || []) {
      const item = this.label(
        label.text,
        label.x || 0,
        label.y || 0,
        (label.size || 12) / 64,
        label.color || 0xeef2fa,
      );
      if (label.align === "center") {
        item.anchor.x = 0.5;
        item.x += (label.width || width) / 2;
      }
      if (label.align === "right") {
        item.anchor.x = 1;
        item.x += label.width || width;
      }
      node.addChild(item);
    }
    if (spec.id && spec.orientation === undefined && !spec.passive) {
      node.eventMode = "static";
      node.cursor = "pointer";
      node.hitArea = {
        contains: (x, y) => x >= 0 && y >= 0 && x <= width && y <= height,
      };
      node.on("pointertap", (event) => {
        event.stopPropagation();
        this.activate(spec.id, event, card);
      });
      node.on("rightclick", (event) => {
        event.stopPropagation();
        this.activate(spec.id, event, card);
      });
    }
    for (const control of spec.controls || [])
      this.decoration(control, node, card);
    parent.addChild(node);
  }
  activate(id, event, card) {
    const [kind, player, key, last] = id.split("|");
    const explicit =
      last ?? (kind === "life" || kind === "tax" ? key : undefined);
    const native = event.nativeEvent || {};
    const amount =
      explicit !== undefined && Number.isFinite(Number(explicit))
        ? Number(explicit)
        : (resolveStep(this.piles.bindings[id], {
            button: event.button === 2 ? "right" : "left",
            shift: native.shiftKey,
            ctrl: native.ctrlKey,
            alt: native.altKey,
          }) ?? 1);
    if (card) {
      if (kind === "tap")
        this.act("modify", {
          id: card.id,
          changes:
            event.button === 2
              ? { skipUntap: !card.skipUntap }
              : {
                  tapped: !card.tapped,
                  ...(card.produces?.length === 1
                    ? { mana: card.produces[0] }
                    : {}),
                },
        });
      else if (kind === "cast") this.act("cast", { id: card.id });
      else if (kind === "counter")
        this.act("modify", {
          id: card.id,
          changes: { counter: { name: player, delta: Number(key) || 1 } },
        });
      else this.select(card.id, kind === "events" ? "effects" : "card");
      return;
    }
    if (["life", "tax", "mana", "pcounter", "cdmg"].includes(kind)) {
      const fields = {
        life: "life",
        tax: "commanderTax",
        mana: "mana",
        pcounter: "counter",
        cdmg: "commanderDamage",
      };
      this.act("player", {
        player,
        field: fields[kind],
        key,
        source: key,
        delta: amount,
      });
    } else if (kind === "shuffle") this.act("shuffle");
    else if (kind === "draw") this.act("draw", { count: 1 });
    else if (kind === "untap") this.act("untap");
    else if (["search", "look"].includes(kind))
      this.act("look", { player, zone: key });
    else if (kind === "peek")
      this.act("look", { player, zone: "library", count: 1 });
    else if (kind === "reveal") this.act("show", { zone: "library", count: 1 });
    else if (kind === "phase") this.act("phase", { phase: Number(player) });
    else if (kind === "next" || kind === "next-step")
      this.act("phase", {
        phase: (this.state.phase + 1) % this.state.phases.length,
      });
    else if (kind === "next-turn") this.act("turn");
    else if (kind === "counter" && this.selected)
      this.act("modify", {
        id: this.selected,
        changes: { counter: { type: player, delta: 1 } },
      });
  }
  render() {
    if (!this.initialized || !this.state?.players || this.dead) return;
    const width = Math.max(280, this.host.clientWidth),
      height = Math.max(360, this.host.clientHeight);
    this.app.renderer.resize(width, height);
    for (const child of this.app.stage.removeChildren())
      child.destroy({ children: true });
    const state = this.state;
    const piles = magicLayout(
      state.players,
      state.capabilities || {},
      this.user,
      "game",
      state.shape,
      state.size,
      {
        fallbackMap: this.map,
        format: state.format,
        counters: state.counterPresets || [],
        commanders: state.commanders || [],
        turn: {
          number: state.turn,
          active: state.active,
          step: state.phases[state.phase],
          phases: state.phases,
        },
        stack: { count: state.stack?.length || 0, timer: state.stackTimer },
        palette: {
          text: "#eef2fa",
          background: "#10131c",
          primary: "#8b9dff",
          accent: "#43d9c0",
        },
        counts: Object.fromEntries(
          state.players.map((player) => [
            player.id,
            Object.fromEntries(
              [
                "library",
                "battlefield",
                "lands",
                "graveyard",
                "exile",
                "command",
              ].map((zone) => [
                zone,
                zone === "library"
                  ? state.libraries[player.id] || 0
                  : state.cards.filter(
                      (card) =>
                        card.controller === player.id &&
                        (zone === "lands"
                          ? card.zone === "battlefield" &&
                            card.region === "lands"
                          : card.zone === zone &&
                            (zone !== "battlefield" ||
                              card.region !== "lands")),
                    ).length,
              ]),
            ),
          ]),
        ),
      },
    );
    this.piles = piles;
    if (this.focus === undefined || !this.choseView)
      this.focus = state.players.some((player) => player.id === this.user)
        ? this.user
        : null;
    const focused = piles.stations.find(
      (station) => station.player === this.focus,
    );
    const view = focused
      ? stationView(focused)
      : tableView(piles.stations, piles.width);
    const world = new this.pixi.Container();
    this.world = world;
    const right = width > 850 ? this.reserveRight || 0 : 0;
    world.pivot.set(view.x, view.y);
    world.position.set(
      (width - right) / 2 + this.panOffset.x,
      (height - 10) / 2 + this.panOffset.y,
    );
    world.rotation = (-(view.rotation || 0) * Math.PI) / 180;
    world.scale.set(
      Math.min(
        (width - right - 32) / view.width,
        (height - 260) / view.height,
      ) * this.zoom,
    );
    this.app.stage.addChild(world);
    const outline = piles.table.points.flatMap((point) => [point.x, point.y]);
    world.addChild(
      new this.pixi.Graphics()
        .poly(outline)
        .fill(0x172e2a)
        .stroke({ color: 0x3c5c54, width: 0.04 }),
    );
    for (const station of piles.stations) {
      const mat = new this.pixi.Container();
      const origin = pileToWorld(station, { x: 0, y: 0 });
      mat.position.set(origin.x, origin.y);
      mat.rotation = (station.orientation * Math.PI) / 180;
      mat.addChild(
        new this.pixi.Graphics()
          .roundRect(0, 0, station.width, station.height, 0.2)
          .fill(station.color || 0x18362c)
          .stroke({ color: 0x5c716f, width: 0.025 }),
      );
      mat.addChild(this.label(station.name, 0.2, 0.15, 0.23));
      world.addChild(mat);
    }
    for (const pile of piles) {
      if (pile.id === "table" || pile.visible === false) continue;
      const group = new this.pixi.Container();
      const origin = pileToWorld(pile, { x: 0, y: 0 });
      group.position.set(origin.x, origin.y);
      group.rotation = (pile.orientation * Math.PI) / 180;
      group.addChild(
        new this.pixi.Graphics()
          .roundRect(0, 0, pile.width, pile.height, 0.08)
          .fill({
            color: pile.zone === "hand" ? 0x10131c : 0x12211e,
            alpha: 0.48,
          })
          .stroke({ color: 0x819a8c, alpha: 0.55, width: 0.015 }),
      );
      group.addChild(this.label(pile.label || pile.name, 0.08, 0.04, 0.14));
      group.eventMode = "static";
      group.cursor = "pointer";
      group.on("pointertap", () => {
        if (pile.zone === "library" && pile.player === this.user)
          this.act("draw", { count: 1 });
      });
      world.addChild(group);
    }
    for (const decoration of piles.decor)
      if (!decoration.id?.startsWith("mat-"))
        this.decoration(decoration, world);
    const grouped = new Map();
    for (const card of state.cards) {
      if (card.zone === "sideboard") continue;
      const host =
        state.cards.find((item) => item.id === card.attachedTo) || card;
      const pileID =
        card.zone === "table"
          ? "table"
          : card.zone === "stack"
            ? "stack"
            : card.zone === "battlefield" && host.region === "lands"
              ? "lands-" + host.controller
              : card.zone + "-" + host.controller;
      if (!grouped.has(pileID)) grouped.set(pileID, []);
      grouped.get(pileID).push(card);
    }
    for (const player of state.players)
      if (state.libraries[player.id])
        grouped.set("library-" + player.id, [
          {
            id: "library-" + player.id,
            name: "Library · " + state.libraries[player.id],
            faceup: false,
            zone: "library",
            controller: player.id,
            movable: player.id === this.user && state.capabilities.play,
          },
        ]);
    for (const [id, cards] of grouped) {
      const pile = piles.find((pile) => pile.id === id);
      if (!pile) continue;
      cards.sort(
        (a, b) =>
          (a.stackIndex || a.order || 0) - (b.stackIndex || b.order || 0),
      );
      for (let index = 0; index < cards.length; index++) {
        const card = cards[index],
          w = this.map.card.width / 100,
          h = this.map.card.height / 100;
        let x = 0.1,
          y = 0.35;
        if (pile.coordinates === "normalized") {
          x = (card.x ?? 0.5) * Math.max(0, pile.width - w);
          y = (card.y ?? 0.5) * Math.max(0, pile.height - h);
        } else if (id === "table") {
          x = piles.width / 2 + (card.x || 0);
          y = piles.height / 2 + (card.y || 0);
        } else if (pile.zone === "hand") {
          x =
            0.2 +
            index *
              Math.min(
                w * 0.85,
                Math.max(
                  0.2,
                  (pile.width - w - 0.4) / Math.max(1, cards.length - 1),
                ),
              );
          y = 0.35;
        } else if (pile.zone === "stack") {
          x = 0.2 + index * 0.4;
          y = 0.4 + index * 0.3;
        } else {
          x = Math.max(0, (pile.width - w) / 2) + index * 0.012;
          y = Math.max(0.2, (pile.height - h) / 2) + index * 0.012;
        }
        const point =
          id === "table"
            ? { x, y }
            : pileToWorld(pile, { x: x + w / 2, y: y + h / 2 });
        const node = new this.pixi.Container();
        node.position.set(point.x, point.y);
        node.rotation =
          ((pile.orientation + (card.tapped ? 90 : 0)) * Math.PI) / 180;
        node.addChild(
          new this.pixi.Graphics()
            .roundRect(-w / 2, -h / 2, w, h, 0.08)
            .fill(card.faceup ? 0xd9d2bb : 0x222d49)
            .stroke({
              color: this.selected === card.id ? 0xffd36a : 0x7e927d,
              width: this.selected === card.id ? 0.06 : 0.025,
            }),
        );
        const texture = this.texture(
          card.faceup
            ? card.transformed
              ? card.backImage
              : card.image
            : this.map.card.back.image.url,
        );
        if (texture) {
          const sprite = new this.pixi.Sprite(texture);
          sprite.anchor.set(0.5);
          sprite.width = w;
          sprite.height = h;
          node.addChild(sprite);
        } else {
          const title = this.label(
            card.faceup
              ? card.name
              : card.zone === "library"
                ? card.name
                : "Face-down card",
            -w / 2 + 0.08,
            -h / 2 + 0.12,
            0.15,
            card.faceup ? 0x10131c : 0xc8d0e5,
          );
          title.style.wordWrap = true;
          title.style.wordWrapWidth = (w - 0.16) * 100;
          node.addChild(title);
          if (card.faceup) {
            node.addChild(
              this.label(card.mana || "", -w / 2 + 0.08, 0.1, 0.12, 0x18212b),
            );
            node.addChild(
              this.label(card.type || "", -w / 2 + 0.08, 0.4, 0.1, 0x18212b),
            );
          }
        }
        const stats =
          card.faceup && /Creature/i.test(card.type || "")
            ? `${card.power || "?"}/${card.toughness || "?"}`
            : "";
        if (stats)
          node.addChild(
            this.label(stats, w / 2 - 0.45, h / 2 - 0.26, 0.15, 0x131926),
          );
        if (Object.keys(card.counters || {}).length)
          node.addChild(
            this.label(
              Object.entries(card.counters)
                .map(([name, count]) => `${name}: ${count}`)
                .join(" "),
              -w / 2,
              h / 2 + 0.04,
              0.13,
            ),
          );
        if (card.movable && card.faceup) {
          const overlay = new this.pixi.Container();
          overlay.position.set(-w / 2, -h / 2);
          overlay.visible = this.selected === card.id;
          for (const control of cardControls(
            this.map,
            card,
            state.counterPresets || [],
          ))
            this.decoration(control, overlay, card);
          node.addChild(overlay);
          node.on("pointerover", () => {
            overlay.visible = true;
            this.app.render();
          });
          node.on("pointerout", () => {
            overlay.visible = this.selected === card.id;
            this.app.render();
          });
        }
        node.eventMode = "static";
        node.cursor = card.movable ? "grab" : "pointer";
        node.on("pointertap", (event) => {
          event.stopPropagation();
          this.select(card.id);
        });
        node.on("dblclick", () => {
          if (card.movable && card.zone === "battlefield")
            this.act("modify", {
              id: card.id,
              changes: { tapped: !card.tapped },
            });
        });
        node.on("pointerdown", (event) => {
          if (!card.movable) return;
          event.stopPropagation();
          this.drag = {
            card,
            node,
            start: { x: event.global.x, y: event.global.y },
            moved: false,
          };
        });
        world.addChild(node);
      }
    }
    this.app.stage.eventMode = "static";
    this.app.stage.hitArea = this.app.screen;
    this.app.stage.removeAllListeners("globalpointermove");
    this.app.stage.removeAllListeners("pointerdown");
    this.app.stage.removeAllListeners("pointerup");
    this.app.stage.removeAllListeners("pointerupoutside");
    this.app.stage.on("pointerdown", (event) => {
      if (!this.drag)
        this.pan = {
          x: event.global.x,
          y: event.global.y,
          offset: { ...this.panOffset },
        };
    });
    this.app.stage.on("globalpointermove", (event) => {
      if (!this.drag) {
        if (this.pan) {
          this.panOffset = {
            x: this.pan.offset.x + event.global.x - this.pan.x,
            y: this.pan.offset.y + event.global.y - this.pan.y,
          };
          world.position.set(
            (width - right) / 2 + this.panOffset.x,
            (height - 10) / 2 + this.panOffset.y,
          );
          this.app.render();
        }
        return;
      }
      if (
        Math.hypot(
          event.global.x - this.drag.start.x,
          event.global.y - this.drag.start.y,
        ) > 5
      )
        this.drag.moved = true;
      if (this.drag.moved) {
        const point = world.toLocal(event.global);
        this.drag.node.position.set(point.x, point.y);
        this.app.render();
      }
    });
    const drop = (event) => {
      this.pan = null;
      const drag = this.drag;
      this.drag = null;
      if (!drag?.moved) return;
      const point = world.toLocal(event.global);
      const pile = pileAtPoint(piles, point);
      if (!pile || pile.permissions?.receive !== true) {
        this.render();
        return;
      }
      const local = worldToPile(pile, point),
        w = this.map.card.width / 100,
        h = this.map.card.height / 100;
      const payload = {
        id: drag.card.id,
        zone: pile.zone,
        player: pile.player || drag.card.controller,
      };
      if (pile.zone === "battlefield") {
        payload.x = Math.max(
          0,
          Math.min(1, (local.x - w / 2) / Math.max(1, pile.width - w)),
        );
        payload.y = Math.max(
          0,
          Math.min(1, (local.y - h / 2) / Math.max(1, pile.height - h)),
        );
        payload.region = pile.region || "main";
      }
      if (pile.zone === "table") {
        payload.x = point.x - piles.width / 2;
        payload.y = point.y - piles.height / 2;
      }
      if (pile.bottom) payload.bottom = true;
      Promise.resolve(this.move(payload)).then(
        () => this.render(),
        () => this.render(),
      );
    };
    this.app.stage.on("pointerup", drop);
    this.app.stage.on("pointerupoutside", drop);
    if (!state.players.length) {
      world.visible = false;
      this.app.stage.addChild(
        this.label("Take a seat to start your game", 30, 30, 22),
      );
    }
    this.app.render();
  }
  destroy() {
    this.dead = true;
    this.observer?.disconnect();
    if (this.initialized) {
      this.app.canvas.removeEventListener("wheel", this.wheel);
      this.app.destroy(true, { children: true });
    }
  }
}
