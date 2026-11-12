import { createGrouping, createReset } from "./table-helpers.mjs";
import { PlayerEventVocabulary, PlayerEvents } from "./card-effects.mjs";
const structuredClone = (value) => JSON.parse(JSON.stringify(value));
function createRules(host) {
  const zones = [
    "library",
    "hand",
    "battlefield",
    "graveyard",
    "exile",
    "command",
    "sideboard",
    "stack",
    "table",
  ];
  const publicZones = [
    "battlefield",
    "graveyard",
    "exile",
    "command",
    "stack",
    "table",
  ];
  const inPlay = ["battlefield", "table"];
  const counterPresets = [
    ...[
      ["+1/+1", 1, 1],
      ["-1/-1", -1, -1],
      ["+1/+0", 1, 0],
      ["+0/+1", 0, 1],
      ["-1/-0", -1, 0],
      ["-0/-1", 0, -1],
    ].map(([name, power, toughness]) => ({
      id: name,
      name,
      kind: "stat",
      power,
      toughness,
    })),
    ...[
      "flying",
      "first strike",
      "double strike",
      "deathtouch",
      "decayed",
      "exalted",
      "haste",
      "hexproof",
      "indestructible",
      "lifelink",
      "menace",
      "reach",
      "shadow",
      "trample",
      "vigilance",
    ].map((name) => ({ id: name, name, kind: "keyword" })),
    ...[
      "loyalty",
      "defense",
      "shield",
      "stun",
      "finality",
      "hone",
      "charge",
      "time",
      "lore",
      "quest",
      "age",
      "level",
      "oil",
      "storage",
      "verse",
      "fate",
      "luck",
      "ice",
    ].map((name) => ({ id: name, name, kind: "named" })),
    ...["poison", "energy", "experience", "rad", "ticket"].map((name) => ({
      id: name,
      name,
      kind: "player",
    })),
  ];
  const phases = [
    "Untap",
    "Upkeep",
    "Draw",
    "Main 1",
    "Begin combat",
    "Attackers",
    "Blockers",
    "Damage",
    "End combat",
    "Main 2",
    "End step",
    "Cleanup",
  ];
  const decline = (result) => ({ declined: true, result });
  const fresh = () => ({
    format: "commander",
    players: [],
    cards: [],
    decks: {},
    imports: {},
    next: 1,
    turn: 1,
    active: null,
    phase: 0,
    log: [],
    looks: {},
    shape: "auto",
    size: 1,
    assist: { untap: true, draw: true, mana: true },
    stackSeq: 0,
    drawn: {},
    savedEvents: {},
  });
  const serial = (task) => task();
  const persist = (state) => host.persist(state);
  const GEOMETRY = {
    card: { width: 160, height: 223 },
    main: { width: 1594, height: 860 },
    lands: { width: 1594, height: 468 },
  };
  const hexOf = (hue, saturation = 0.38, lightness = 0.2) => {
    const k = (n) => (n + hue / 30) % 12;
    const a = saturation * Math.min(lightness, 1 - lightness);
    const channel = (n) =>
      Math.round(
        255 * (lightness - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))),
      )
        .toString(16)
        .padStart(2, "0");
    return "#" + channel(0) + channel(8) + channel(4);
  };
  const hueGap = (a, b) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
  function pickHue(state) {
    const used = state.players.map((p) => p.hue).filter(Number.isFinite);
    let best = null;
    for (let i = 0; i < 12; i++) {
      const hue = host.random(0, 360);
      const gap = used.length
        ? Math.min(...used.map((u) => hueGap(u, hue)))
        : 360;
      if (!best || gap > best.gap) best = { hue, gap };
      if (gap >= 40) break;
    }
    return best.hue;
  }
  const geometryOf = (state, player) =>
    state.players.find((p) => p.id === player)?.geometry || GEOMETRY;
  function areaOf(state, player, region = "main") {
    const geometry = geometryOf(state, player);
    const box = geometry[region] || geometry.main;
    const card = geometry.card;
    return {
      width: Math.max(1, box.width - card.width),
      height: Math.max(0, box.height - card.height),
      card,
      step: Math.min(
        card.height * 0.2,
        Math.max(0, box.height - card.height) / (STACK_SIZE - 1),
      ),
    };
  }
  const regionFor = (card) => (isType(card, "Land") ? "lands" : "main");
  function syncAttachments(state) {
    const cards = new Map(state.cards.map((card) => [card.id, card]));
    const done = /* @__PURE__ */ new Set();
    const visiting = /* @__PURE__ */ new Set();
    const sync = (card) => {
      if (done.has(card.id) || !card.attachedTo) return;
      const host2 = cards.get(card.attachedTo);
      if (
        !host2 ||
        !inPlay.includes(host2.zone) ||
        !inPlay.includes(card.zone) ||
        visiting.has(host2.id)
      ) {
        delete card.attachedTo;
        if (card.zone === "battlefield")
          Object.assign(
            card,
            openPosition(
              state,
              card.controller,
              card.id,
              card.region || "main",
            ),
          );
        done.add(card.id);
        return;
      }
      visiting.add(card.id);
      sync(host2);
      visiting.delete(card.id);
      card.zone = host2.zone;
      card.region = host2.region;
      let root = host2;
      while (root.attachedTo && cards.has(root.attachedTo))
        root = cards.get(root.attachedTo);
      const siblings = state.cards.filter(
        (item) => item.attachedTo === host2.id,
      );
      const index = siblings.findIndex((item) => item.id === card.id) + 1;
      const area = areaOf(state, root.controller, root.region || "main");
      const dx =
        host2.zone === "table" ? 0.35 : (area.card.width * 0.22) / area.width;
      const dy =
        host2.zone === "table"
          ? 0.35
          : (area.card.height * 0.16) / Math.max(1, area.height);
      if (host2.zone !== "table") {
        host2.x = Math.max(host2.x || 0, Math.min(1, dx * siblings.length));
        host2.y = Math.max(host2.y || 0, Math.min(1, dy * siblings.length));
      }
      card.x = (host2.x || 0) - dx * index;
      card.y = (host2.y || 0) - dy * index;
      if (host2.zone !== "table") {
        card.x = Math.max(0, Math.min(1, card.x));
        card.y = Math.max(0, Math.min(1, card.y));
      }
      done.add(card.id);
    };
    for (const card of state.cards) sync(card);
  }
  const STACK_SIZE = 5;
  const manaColors = ["W", "U", "B", "R", "G", "C"];
  const basicMana = {
    Plains: "W",
    Island: "U",
    Swamp: "B",
    Mountain: "R",
    Forest: "G",
  };
  const subtypesOf = (card) =>
    ((card.transformed && card.backType ? card.backType : card.type) || "")
      .split("\u2014")[1]
      ?.trim()
      .split(/\s+/)
      .filter(Boolean) || [];
  const landKey = (card) => {
    const basics = subtypesOf(card)
      .filter((type) => basicMana[type])
      .sort();
    return basics.length ? basics.join(" ") : card.name || card.id;
  };
  function load() {
    const state = host.load();
    normalizeState(state);
    return { data: { state } };
  }
  function normalizeState(state) {
    for (const card of state.cards)
      if (card.zone === "battlefield" && !card.region)
        card.region = regionFor(card);
    syncAttachments(state);
    const used = /* @__PURE__ */ new Set();
    state.commanderSources ??= {};
    for (const player of state.players) {
      if (!Number.isFinite(player.hue) || used.has(player.hue)) {
        player.hue = (player.id * 137 + used.size * 61) % 360;
        player.color = hexOf(player.hue);
      }
      used.add(player.hue);
      player.commanderDamage ??= {};
      const cards = state.cards.filter(
        (card) => card.owner === player.id && card.section === "command",
      );
      for (const card of cards)
        state.commanderSources[card.id] = {
          id: card.id,
          owner: player.id,
          name: card.name,
          color: player.color,
        };
      if (cards.length === 1)
        for (const target of state.players) {
          target.commanderDamage ??= {};
          for (const key of [String(player.id), "player-" + player.id])
            if (Object.hasOwn(target.commanderDamage, key)) {
              target.commanderDamage[cards[0].id] =
                (target.commanderDamage[cards[0].id] || 0) +
                target.commanderDamage[key];
              delete target.commanderDamage[key];
            }
        }
    }
  }
  function commanders(state) {
    const sources = Object.values(state.commanderSources || {})
      .filter(
        (source) =>
          state.cards.some((card) => card.id === source.id) ||
          state.players.some(
            (player) => player.commanderDamage?.[source.id] > 0,
          ),
      )
      .map((source) => ({
        ...source,
        color:
          state.players.find((player) => player.id === source.owner)?.color ||
          source.color,
      }));
    for (const player of state.players) {
      const owned = sources.filter((source) => source.owner === player.id);
      if (
        !owned.length ||
        state.players.some(
          (target) =>
            target.commanderDamage?.[player.id] > 0 ||
            target.commanderDamage?.["player-" + player.id] > 0,
        )
      )
        sources.push({
          id: "player-" + player.id,
          owner: player.id,
          name: owned.length
            ? { i18n: "easel.mtg.unassigned-commander-damage" }
            : { i18n: "easel.mtg.player-s-commander", args: { player: player.name } },
          color: player.color,
          unassigned: owned.length > 0,
        });
    }
    return sources;
  }
  function damageFrom(player, source) {
    return (
      player.commanderDamage?.[source.id] ??
      (source.id.startsWith("player-")
        ? player.commanderDamage?.[source.owner] || 0
        : 0)
    );
  }
  const lethalCommanders = (state, player) =>
    state.format === "commander"
      ? commanders(state).filter(
          (source) => !source.unassigned && damageFrom(player, source) >= 21,
        )
      : [];
  const ordered = (state, player, zone) =>
    state.cards
      .filter((card) => card.controller === player && card.zone === zone)
      .sort((a, b) => a.order - b.order);
  const int = (v, min, max) => Number.isSafeInteger(v) && v >= min && v <= max;
  const clean = (v, max = 160) =>
    String(v ?? "")
      .trim()
      .slice(0, max);
  function image(value) {
    return typeof value === "string" &&
      /^https:\/\/cards\.scryfall\.io\/[^\s]+$/.test(value)
      ? value
      : "";
  }
  function metadata(item) {
    return {
      name: clean(item.name),
      image: image(item.image),
      backImage: image(item.backImage),
      oracle: clean(item.oracle, 2500),
      type: clean(item.type, 240),
      mana: clean(item.mana, 80),
      power: clean(item.power, 20),
      toughness: clean(item.toughness, 20),
      backType: clean(item.backType, 240),
      backPower: clean(item.backPower, 20),
      backToughness: clean(item.backToughness, 20),
      scryfall: clean(item.scryfall, 50),
    };
  }
  function note(state, actor, text) {
    const player = state.players.find((p) => p.id === actor);
    state.log.push({
      text: {
        i18n: "easel.mtg.player-action",
        args: { player: player?.name || { i18n: "easel.mtg.table" }, action: text },
      },
      time: /* @__PURE__ */ new Date().toISOString(),
    });
    state.log = state.log.slice(-100);
  }
  function invalidateLooks(state, player, zone) {
    for (const actor of Object.keys(state.looks))
      if (
        state.looks[actor].player === player &&
        state.looks[actor].zone === zone
      )
        delete state.looks[actor];
    const owner = state.players.find((p) => p.id === player);
    if (owner?.show?.zone === zone) delete owner.show;
  }
  function shuffle(state, player) {
    const cards = ordered(state, player, "library");
    for (let i = cards.length - 1; i > 0; i--) {
      const j = host.random(0, i + 1);
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    cards.forEach((card, order) => {
      card.order = order;
      card.revealed = false;
    });
    invalidateLooks(state, player, "library");
  }
  function draw(state, player, count) {
    const cards = ordered(state, player, "library").slice(0, count);
    let order = ordered(state, player, "hand").length;
    cards.forEach((card) => {
      card.zone = "hand";
      card.order = order++;
      card.revealed = false;
    });
    invalidateLooks(state, player, "library");
    return cards.length;
  }
  function openPosition(state, player, exclude, region = "main") {
    const area = areaOf(state, player, region),
      { card } = area;
    const cards = ordered(state, player, "battlefield").filter(
      (c) => c.id !== exclude && (c.region || "main") === region,
    );
    const columns = Math.max(2, Math.floor(area.width / (card.width / 2)) + 1);
    const rows = Math.max(1, Math.floor(area.height / (card.height / 2)) + 1);
    const positions = Array.from({ length: columns * rows }, (_, index) => ({
      x: (index % columns) / (columns - 1),
      y: rows > 1 ? Math.floor(index / columns) / (rows - 1) : 0.5,
    }));
    const rowGap = rows > 1 ? area.height / (rows - 1) : card.height;
    const taken = (point) =>
      cards.some(
        (c) =>
          Math.abs(c.x - point.x) * area.width <
            ((c.tapped ? card.height : card.width) + card.width) / 2 -
              card.width * 0.04 &&
          Math.abs(c.y - point.y) * area.height <
            Math.min(
              ((c.tapped ? card.width : card.height) + card.height) / 2,
              rowGap,
            ) -
              card.width * 0.04,
      );
    return (
      positions.find((point) => !taken(point)) ||
      positions[cards.length % positions.length]
    );
  }
  const landGrouping = (state) =>
    createGrouping({
      direction: "vertical",
      maxCards: STACK_SIZE,
      key: landKey,
      id: () => "group-" + state.next++,
    });
  const landsOf = (state, player) =>
    ordered(state, player, "battlefield").filter(
      (card) => card.region === "lands",
    );
  function raise(state, player, card) {
    const cards = ordered(state, player, "battlefield").filter(
      (c) => c.id !== card.id,
    );
    cards.push(card);
    cards.forEach((c, order) => (c.order = order));
  }
  function leaveGroup(state, card) {
    landGrouping(state).leave(
      areaOf(state, card.controller, "lands"),
      landsOf(state, card.controller),
      card,
    );
  }
  function stackLand(state, card, player) {
    const lands = landsOf(state, player);
    if (!lands.includes(card)) lands.push(card);
    if (landGrouping(state).place(areaOf(state, player, "lands"), lands, card))
      return raise(state, player, card);
    delete card.group;
    delete card.groupIndex;
    Object.assign(card, openPosition(state, player, card.id, "lands"));
  }
  function dropLand(state, card, player) {
    if (
      landGrouping(state).drop(
        areaOf(state, player, "lands"),
        landsOf(state, player),
        card,
      )
    )
      raise(state, player, card);
  }
  function landMana(card) {
    if (!isType(card, "Land")) return [];
    const found = /* @__PURE__ */ new Set();
    for (const clause of String(card.oracle || "").matchAll(
      /add ([^.\n]*)/gi,
    )) {
      if (/any (color|type)/i.test(clause[1]))
        ["W", "U", "B", "R", "G"].forEach((c) => found.add(c));
      if (/any type/i.test(clause[1])) found.add("C");
      for (const symbol of clause[1].matchAll(/\{([WUBRGC])\}/g))
        found.add(symbol[1]);
    }
    if (!found.size) {
      for (const type of subtypesOf(card))
        if (basicMana[type]) found.add(basicMana[type]);
    }
    return manaColors.filter((color) => found.has(color));
  }
  function tapCards(state, card, tapped, color) {
    const members =
      card.group && card.region === "lands"
        ? landGrouping(state).above(landsOf(state, card.controller), card)
        : [card];
    const changed = members.filter((c) => Boolean(c.tapped) !== tapped);
    const added = {};
    const controller = state.players.find((p) => p.id === card.controller);
    for (const c of changed) {
      c.tapped = tapped;
      if (!tapped || !controller) continue;
      const options = landMana(c);
      const pick =
        options.length === 1
          ? options[0]
          : options.includes(color)
            ? color
            : null;
      if (!pick) continue;
      controller.mana[pick] = Math.min(999, (controller.mana[pick] || 0) + 1);
      added[pick] = (added[pick] || 0) + 1;
    }
    return { changed, added };
  }
  const tableReset = () =>
    createReset({
      home: (card) =>
        card.section === "command"
          ? "command"
          : card.section === "sideboard"
            ? "sideboard"
            : "library",
      clearCard: (card) => {
        card.transformed = false;
        card.counterKinds = {};
        card.controlHistory = [];
        for (const key of [
          "stackIndex",
          "attacking",
          "blocking",
          "damage",
          "deathtouched",
          "enteredTurn",
          "skipUntap",
        ])
          delete card[key];
      },
      resetPlayer: (player, state) => {
        player.life = state.format === "commander" ? 40 : 20;
        player.poison = player.energy = player.commanderTax = 0;
        player.commanderDamage = {};
        player.counters = {};
        delete player.show;
        Object.keys(player.mana).forEach((k) => (player.mana[k] = 0));
      },
      shuffle,
      random: (min, max) => host.random(min, max),
    });
  function relocate(state, card, zone, controller = card.controller) {
    if (card.group) leaveGroup(state, card);
    const oldZone = card.zone;
    invalidateLooks(state, card.controller, oldZone);
    invalidateLooks(state, controller, zone);
    const region = zone === "battlefield" ? regionFor(card) : null;
    const position =
      zone === "battlefield"
        ? openPosition(state, controller, card.id, region)
        : null;
    card.zone = zone;
    card.controller = controller;
    if (region) card.region = region;
    if (position) Object.assign(card, position);
    if (oldZone !== zone) {
      delete card.skipUntap;
      card.tapped = card.revealed = card.facedown = false;
      card.counters = {};
      card.counterKinds = {};
      card.controlHistory = [];
      delete card.attacking;
      delete card.blocking;
      delete card.damage;
      delete card.deathtouched;
      if (zone !== "stack") delete card.stackIndex;
      if (zone === "battlefield") card.enteredTurn = state.turn;
    }
    const cards = ordered(state, controller, zone).filter(
      (c) => c.id !== card.id,
    );
    cards.push(card);
    cards.forEach((c, order) => (c.order = order));
    if (region === "lands" && isType(card, "Land"))
      stackLand(state, card, controller);
    if (card.token && !["battlefield", "exile", "stack"].includes(zone))
      state.cards = state.cards.filter((c) => c.id !== card.id);
  }
  const topOfStack = (state) =>
    state.cards
      .filter((card) => card.zone === "stack")
      .sort((a, b) => (b.stackIndex || 0) - (a.stackIndex || 0))[0];
  function clearCombat(state) {
    for (const card of state.cards) {
      delete card.attacking;
      delete card.blocking;
    }
  }
  function clearDamage(state) {
    for (const card of state.cards) {
      delete card.damage;
      delete card.deathtouched;
    }
  }
  function turnPreferences(accountid) {
    const preferences = host.preferences({ accountid });
    return {
      untap: preferences.autoUntap,
      draw: preferences.autoDraw,
      mana: preferences.autoMana,
    };
  }
  function enterPhase(state, actor, from, to) {
    const preferences = ((operation) => operation())(
      () =>
        new Map(
          state.players.map((player) => [
            player.id,
            turnPreferences(player.id),
          ]),
        ),
    );
    const assist = preferences.get(state.active) || {};
    if (from !== to) {
      for (const player of state.players)
        if (preferences.get(player.id)?.mana)
          for (const key of Object.keys(player.mana || {}))
            player.mana[key] = 0;
    }
    if (to === 0 && assist.untap && state.active != null) {
      ordered(state, state.active, "battlefield")
        .filter((card) => !card.skipUntap)
        .forEach((card) => (card.tapped = false));
      note(state, actor, {
        i18n: "easel.mtg.untapped-the-active-player-s-permanents",
      });
    }
    if (to === 2 && assist.draw && state.active != null) {
      state.drawn ??= {};
      const first =
        state.turn === 1 &&
        state.players.length === 2 &&
        (state.starter ?? state.players[0]?.id) === state.active;
      if (state.drawn[state.active] !== state.turn && !first) {
        state.drawn[state.active] = state.turn;
        if (draw(state, state.active, 1))
          note(state, actor, { i18n: "easel.mtg.drew-for-the-turn" });
      }
    }
    if (to === phases.indexOf("End combat")) clearCombat(state);
    if (to === phases.indexOf("Cleanup")) clearDamage(state);
  }
  function createCard(state, owner, meta, zone, order = 0, extra = {}) {
    return {
      id: "card-" + state.next++,
      owner,
      controller: owner,
      zone,
      order,
      ...meta,
      tapped: false,
      facedown: false,
      transformed: false,
      revealed: false,
      counters: {},
      counterKinds: {},
      controlHistory: [],
      x: 0.5,
      y: 0.5,
      ...(zone === "battlefield"
        ? {
            ...openPosition(state, owner),
            enteredTurn: state.turn,
            region: "main",
          }
        : {}),
      ...extra,
    };
  }
  function capabilities(actor) {
    return {
      play: host.can("easel.board.mtg-play", actor),
      controlOther: host.can("easel.board.mtg-control-other", actor),
      takeControl: host.can("easel.board.mtg-take-control", actor),
      manage: host.can("easel.board.mtg-manage-table", actor),
    };
  }
  function visibleCard(card, actor) {
    const visible =
      card.revealed ||
      (publicZones.includes(card.zone) && !card.facedown) ||
      (card.controller === actor && ["hand", "sideboard"].includes(card.zone));
    if (!visible)
      return {
        id: card.id,
        owner: card.owner,
        controller: card.controller,
        zone: card.zone,
        order: ["library", "sideboard"].includes(card.zone) ? 0 : card.order,
        facedown: true,
        tapped: card.tapped,
        region: card.region,
        attachedTo: card.attachedTo,
        skipUntap: card.skipUntap,
        x: card.x,
        y: card.y,
        counters: {},
      };
    return { ...card, faceup: true };
  }
  function snapshot(state, actor) {
    const caps = capabilities(actor);
    const untapAccounts = ((operation) => operation())(
      () =>
        new Set(
          state.players
            .map((player) =>
              turnPreferences(player.id).untap ? player.id : null,
            )
            .filter((id) => id !== null),
        ),
    );
    const look = state.looks[actor];
    return {
      format: state.format,
      players: state.players.map(({ show, ...player }) => ({
        ...player,
        commanderOut: lethalCommanders(state, player).map(
          (source) => source.id,
        ),
      })),
      shown: state.players
        .filter(
          (player) =>
            player.show &&
            (player.show.to == null ||
              [player.id, player.show.to].includes(actor)),
        )
        .map((player) => ({
          from: player.id,
          name: player.name,
          zone: player.show.zone,
          everyone: player.show.to == null,
          to: player.show.to,
          cards: player.show.ids
            .map((id) =>
              state.cards.find(
                (c) =>
                  c.id === id &&
                  c.controller === player.id &&
                  c.zone === player.show.zone,
              ),
            )
            .filter(Boolean)
            .map((c) => ({ ...c, faceup: true, movable: false })),
        })),
      commanders: commanders(state),
      turn: state.turn,
      active: state.active,
      phase: state.phase,
      phases,
      log: state.log,
      shape: state.shape,
      size: state.size,
      assist: turnPreferences(actor),
      checks: rulesChecks(state, counterPresets),
      combat: combatPlan(state, counterPresets),
      stackTimer: stackTimer
        ? {
            remaining: Math.max(0, stackTimer.deadline - Date.now()),
            total: stackTimer.total,
          }
        : null,
      stack: state.cards
        .filter((card) => card.zone === "stack")
        .sort((a, b) => (b.stackIndex || 0) - (a.stackIndex || 0))
        .map((card) => card.id),
      capabilities: caps,
      counterPresets,
      eventVocabulary: {
        events: eventVocabulary.events,
        responses: eventVocabulary.responses,
      },
      savedEvents: state.savedEvents || {},
      libraries: Object.fromEntries(
        state.players.map((player) => [
          player.id,
          ordered(state, player.id, "library").length,
        ]),
      ),
      cards: state.cards
        .filter(
          (card) =>
            card.zone !== "library" &&
            (card.zone !== "sideboard" || card.controller === actor),
        )
        .map((card) => ({
          ...visibleCard(card, actor),
          autoUntap:
            card.zone === "battlefield" && untapAccounts.has(card.controller),
          ...(visibleCard(card, actor).faceup
            ? {
                keywords: [...keywordsOf(card)],
                ...(card.zone === "battlefield" && isType(card, "Land")
                  ? { produces: landMana(card) }
                  : {}),
              }
            : {}),
          movable:
            caps.play &&
            (card.controller === actor ||
              (card.controller == null && card.zone === "table") ||
              (caps.controlOther && publicZones.includes(card.zone))),
          permissions: {
            control:
              caps.play &&
              (card.controller === actor ||
                (card.controller == null && card.zone === "table") ||
                (caps.controlOther && publicZones.includes(card.zone))),
          },
        })),
      deck: state.decks[actor]
        ? { name: state.decks[actor].name, entries: state.decks[actor].entries }
        : null,
      inspection:
        look && look.player === actor
          ? {
              zone: look.zone,
              cards: look.ids
                .map((id) =>
                  state.cards.find(
                    (c) =>
                      c.id === id &&
                      c.controller === actor &&
                      c.zone === look.zone,
                  ),
                )
                .filter(Boolean)
                .map((c) => ({ ...c, faceup: true, movable: caps.play })),
            }
          : null,
    };
  }
  function refresh(state) {}
  const CARD_TYPES = [
    "Artifact",
    "Creature",
    "Enchantment",
    "Land",
    "Planeswalker",
    "Battle",
    "Instant",
    "Sorcery",
  ];
  const LIVE_ZONES = ["battlefield", "command"];
  const cardFields = {
    types: {
      values: CARD_TYPES,
      label: { i18n: "easel.mtg.card-type" },
      description: { i18n: "easel.mtg.only-cards-of-this-type-a" },
    },
    name: {
      type: "string",
      label: { i18n: "easel.mtg.card-name" },
      description: { i18n: "easel.mtg.only-a-card-with-exactly-this" },
    },
    token: {
      type: "boolean",
      label: { i18n: "easel.mtg.token" },
      description: { i18n: "easel.mtg.yes-for-tokens-only-no-for" },
    },
  };
  const eventVocabulary = new PlayerEventVocabulary({
    events: {
      "card-enters": {
        scopes: {
          self: { i18n: "easel.mtg.under-your-control" },
          opponents: { i18n: "easel.mtg.under-an-opponent-s-control" },
          all: "",
        },
        label: { i18n: "easel.mtg.a-card-enters-the-battlefield" },
        description: { i18n: "easel.mtg.a-card-or-token-arrives-on" },
        fields: cardFields,
      },
      "card-leaves": {
        scopes: {
          self: { i18n: "easel.mtg.under-your-control" },
          opponents: { i18n: "easel.mtg.under-an-opponent-s-control" },
          all: "",
        },
        label: { i18n: "easel.mtg.a-card-leaves-the-battlefield" },
        description: { i18n: "easel.mtg.a-card-or-token-stops-being" },
        fields: {
          ...cardFields,
          to: {
            values: zones,
            label: { i18n: "easel.mtg.goes-to" },
            description: { i18n: "easel.mtg.only-when-it-goes-to-this" },
          },
        },
      },
      "card-dies": {
        scopes: {
          self: { i18n: "easel.mtg.under-your-control" },
          opponents: { i18n: "easel.mtg.under-an-opponent-s-control" },
          all: "",
        },
        label: { i18n: "easel.mtg.a-card-dies" },
        description: { i18n: "easel.mtg.a-card-goes-from-a-battlefield" },
        fields: cardFields,
      },
      "card-cast": {
        scopes: {
          self: { i18n: "easel.mtg.by-you" },
          opponents: { i18n: "easel.mtg.by-an-opponent" },
          all: "",
        },
        label: { i18n: "easel.mtg.a-spell-is-cast" },
        description: { i18n: "easel.mtg.a-card-is-put-on-the" },
        fields: cardFields,
      },
      "card-tapped": {
        scopes: {
          self: { i18n: "easel.mtg.under-your-control" },
          opponents: { i18n: "easel.mtg.under-an-opponent-s-control" },
          all: "",
        },
        label: { i18n: "easel.mtg.a-card-becomes-tapped" },
        description: { i18n: "easel.mtg.an-untapped-card-in-play-is" },
        fields: cardFields,
      },
      upkeep: {
        scopes: {
          self: { i18n: "easel.mtg.on-your-turn" },
          opponents: { i18n: "easel.mtg.on-an-opponent-s-turn" },
          all: "",
        },
        label: { i18n: "easel.mtg.upkeep-begins" },
        sentence: { i18n: "easel.mtg.upkeep-begins-2" },
        description: { i18n: "easel.mtg.the-game-moves-into-the-upkeep" },
      },
      "draw-step": {
        scopes: {
          self: { i18n: "easel.mtg.on-your-turn" },
          opponents: { i18n: "easel.mtg.on-an-opponent-s-turn" },
          all: "",
        },
        label: { i18n: "easel.mtg.draw-step-begins" },
        sentence: { i18n: "easel.mtg.the-draw-step-begins" },
        description: { i18n: "easel.mtg.the-game-moves-into-the-draw" },
      },
      "combat-begins": {
        scopes: {
          self: { i18n: "easel.mtg.on-your-turn" },
          opponents: { i18n: "easel.mtg.on-an-opponent-s-turn" },
          all: "",
        },
        label: { i18n: "easel.mtg.combat-begins" },
        sentence: { i18n: "easel.mtg.combat-begins-2" },
        description: { i18n: "easel.mtg.the-game-moves-into-the-beginning" },
      },
      "end-step": {
        scopes: {
          self: { i18n: "easel.mtg.on-your-turn" },
          opponents: { i18n: "easel.mtg.on-an-opponent-s-turn" },
          all: "",
        },
        label: { i18n: "easel.mtg.end-step-begins" },
        sentence: { i18n: "easel.mtg.the-end-step-begins" },
        description: { i18n: "easel.mtg.the-game-moves-into-the-end" },
      },
      "card-attacks": {
        scopes: {
          self: { i18n: "easel.mtg.under-your-control" },
          opponents: { i18n: "easel.mtg.under-an-opponent-s-control" },
          all: "",
        },
        label: { i18n: "easel.mtg.a-creature-attacks" },
        sentence: { i18n: "easel.mtg.a-creature-attacks-2" },
        description: { i18n: "easel.mtg.a-creature-is-declared-as-an" },
        fields: cardFields,
      },
      "card-blocked": {
        scopes: {
          self: { i18n: "easel.mtg.under-your-control" },
          opponents: { i18n: "easel.mtg.under-an-opponent-s-control" },
          all: "",
        },
        label: { i18n: "easel.mtg.a-creature-becomes-blocked" },
        sentence: { i18n: "easel.mtg.a-creature-becomes-blocked-2" },
        description: { i18n: "easel.mtg.an-attacking-creature-has-a-blocker" },
        fields: cardFields,
      },
      "life-changes": {
        scopes: {
          self: { i18n: "easel.mtg.for-you" },
          opponents: { i18n: "easel.mtg.for-an-opponent" },
          all: "",
        },
        label: { i18n: "easel.mtg.life-changes" },
        sentence: { i18n: "easel.mtg.life-changes-2" },
        description: { i18n: "easel.mtg.a-player-gains-or-loses-life" },
        fields: {
          direction: {
            values: ["gained", "lost"],
            label: { i18n: "easel.mtg.gained-or-lost" },
            description: { i18n: "easel.mtg.only-when-life-goes-up-gained" },
          },
        },
      },
      "counter-added": {
        scopes: {
          self: { i18n: "easel.mtg.under-your-control" },
          opponents: { i18n: "easel.mtg.under-an-opponent-s-control" },
          all: "",
        },
        label: { i18n: "easel.mtg.a-counter-is-put-on-a" },
        sentence: { i18n: "easel.mtg.a-counter-is-put-on-a-2" },
        description: { i18n: "easel.mtg.one-or-more-counters-are-added" },
        fields: {
          ...cardFields,
          counter: {
            type: "string",
            label: { i18n: "easel.mtg.counter" },
            description: { i18n: "easel.mtg.only-this-counter-for-example-1" },
          },
        },
      },
      "land-played": {
        scopes: {
          self: { i18n: "easel.mtg.by-you" },
          opponents: { i18n: "easel.mtg.by-an-opponent" },
          all: "",
        },
        label: { i18n: "easel.mtg.a-land-is-played" },
        sentence: { i18n: "easel.mtg.a-land-is-played-2" },
        description: { i18n: "easel.mtg.a-land-arrives-on-a-battlefield" },
        fields: { name: cardFields.name },
      },
      "turn-start": {
        scopes: {
          self: { i18n: "easel.mtg.on-your-turn" },
          opponents: { i18n: "easel.mtg.on-an-opponent-s-turn" },
          all: "",
        },
        label: { i18n: "easel.mtg.a-turn-starts" },
        description: { i18n: "easel.mtg.the-turn-passes-to-the-next" },
      },
    },
    responses: {
      delta: {
        label: { i18n: "easel.mtg.change-a-number" },
        sentence: { i18n: "easel.mtg.change-your-field-by-amount-signed" },
        description: { i18n: "easel.mtg.add-to-or-subtract-from-one" },
        fields: {
          field: {
            values: ["life", "poison", "energy"],
            label: { i18n: "easel.mtg.which-total" },
            description: { i18n: "easel.mtg.your-life-poison-counters-or-energy" },
          },
          amount: {
            min: -20,
            max: 20,
            label: { i18n: "easel.mtg.by-how-much" },
            description: { i18n: "easel.mtg.positive-adds-negative-subtracts" },
          },
        },
      },
      draw: {
        label: { i18n: "easel.mtg.draw-cards" },
        sentence: { i18n: "easel.mtg.draw-count-cardcount-s" },
        description: { i18n: "easel.mtg.draw-from-the-top-of-your" },
        fields: {
          count: {
            min: 1,
            max: 5,
            label: { i18n: "easel.mtg.how-many" },
            description: { i18n: "easel.mtg.number-of-cards-to-draw" },
          },
        },
      },
      mana: {
        label: { i18n: "easel.mtg.add-mana" },
        sentence: { i18n: "easel.mtg.add-amount-color-mana" },
        description: { i18n: "easel.mtg.add-mana-to-your-mana-pool" },
        fields: {
          color: {
            values: ["W", "U", "B", "R", "G", "C"],
            label: { i18n: "easel.mtg.colour" },
            description: { i18n: "easel.mtg.w-white-u-blue-b-black" },
          },
          amount: {
            min: 1,
            max: 10,
            label: { i18n: "easel.mtg.how-much" },
            description: { i18n: "easel.mtg.amount-of-mana-to-add" },
          },
        },
      },
      "player-counter": {
        label: { i18n: "easel.mtg.get-player-counters" },
        sentence: { i18n: "easel.mtg.get-amount-signed-counter-counteramount-s" },
        description: { i18n: "easel.mtg.put-counters-on-yourself-such-as" },
        fields: {
          counter: {
            type: "string",
            label: { i18n: "easel.mtg.counter" },
            description: { i18n: "easel.mtg.experience-rad-ticket-poison-energy-or" },
          },
          amount: {
            min: -20,
            max: 20,
            label: { i18n: "easel.mtg.how-many" },
            description: { i18n: "easel.mtg.positive-adds-negative-removes" },
          },
        },
      },
      "card-counter": {
        label: { i18n: "easel.mtg.put-counters-on-this-card" },
        sentence: { i18n: "easel.mtg.put-amount-signed-counter-counteramount-s" },
        description: { i18n: "easel.mtg.add-or-remove-counters-on-the" },
        fields: {
          counter: {
            values: counterPresets.map((preset) => preset.id),
            label: { i18n: "easel.mtg.counter" },
            description: { i18n: "easel.mtg.which-counter" },
          },
          amount: {
            min: -20,
            max: 20,
            label: { i18n: "easel.mtg.how-many" },
            description: { i18n: "easel.mtg.positive-adds-negative-removes" },
          },
        },
      },
      "card-tap": {
        label: { i18n: "easel.mtg.tap-or-untap-this-card" },
        sentence: { i18n: "easel.mtg.state-this-card" },
        description: { i18n: "easel.mtg.tap-or-untap-the-card-this" },
        fields: {
          state: {
            values: ["tap", "untap"],
            label: { i18n: "easel.mtg.tap-or-untap" },
            description: { i18n: "easel.mtg.what-to-do-to-this-card" },
          },
        },
      },
      token: {
        label: { i18n: "easel.mtg.create-a-token" },
        sentence: { i18n: "easel.mtg.create-a-power-toughness-name-token" },
        description: { i18n: "easel.mtg.create-a-token-on-your-battlefield" },
        fields: {
          name: {
            type: "string",
            label: { i18n: "easel.mtg.token-name" },
            description: { i18n: "easel.mtg.for-example-soldier" },
          },
          kind: {
            type: "string",
            label: { i18n: "easel.mtg.card-type" },
            description: { i18n: "easel.mtg.for-example-token-creature-soldier" },
          },
          power: {
            min: 0,
            max: 20,
            label: { i18n: "easel.mtg.power" },
            description: { i18n: "easel.mtg.the-token-s-power" },
          },
          toughness: {
            min: 0,
            max: 20,
            label: { i18n: "easel.mtg.toughness" },
            description: { i18n: "easel.mtg.the-token-s-toughness" },
          },
        },
      },
      mill: {
        label: { i18n: "easel.mtg.mill" },
        sentence: { i18n: "easel.mtg.mill-count-cardcount-s" },
        description: { i18n: "easel.mtg.put-the-top-cards-of-your" },
        fields: {
          count: {
            min: 1,
            max: 10,
            label: { i18n: "easel.mtg.how-many" },
            description: { i18n: "easel.mtg.number-of-cards-to-mill" },
          },
        },
      },
      shuffle: {
        label: { i18n: "easel.mtg.shuffle-your-library" },
        sentence: { i18n: "easel.mtg.shuffle-your-library-2" },
        description: { i18n: "easel.mtg.randomise-the-order-of-your-library" },
        fields: {},
      },
      tax: {
        label: { i18n: "easel.mtg.change-commander-tax" },
        sentence: { i18n: "easel.mtg.change-your-commander-tax-by-amount" },
        description: { i18n: "easel.mtg.raise-or-lower-your-commander-tax" },
        fields: {
          amount: {
            min: -10,
            max: 10,
            label: { i18n: "easel.mtg.by-how-much" },
            description: { i18n: "easel.mtg.positive-raises-it-negative-lowers-it" },
          },
        },
      },
    },
  });
  const describeCard = (card) => ({
    types: CARD_TYPES.filter((type) => isType(card, type)),
    name: card.name || "",
    token: Boolean(card.token),
  });
  const PHASE_EVENTS = {
    Upkeep: "upkeep",
    Draw: "draw-step",
    "Begin combat": "combat-begins",
    "End step": "end-step",
  };
  function eventsBetween(before, after) {
    const prior = new Map(before.cards.map((card) => [card.id, card]));
    const found = [];
    const add = (verb2, player, card, extra = {}) =>
      found.push({
        verb: verb2,
        player,
        source: card.id,
        fields: { ...describeCard(card), ...extra },
      });
    const blocked = (state) =>
      new Set(
        state.cards
          .filter((card) => card.blocking)
          .map((card) => card.blocking),
      );
    const blockedBefore = blocked(before);
    for (const card of after.cards) {
      const was = prior.get(card.id);
      prior.delete(card.id);
      const inPlay2 = card.zone === "battlefield",
        wasInPlay = was?.zone === "battlefield";
      if (inPlay2 && !wasInPlay) {
        add("card-enters", card.controller, card);
        if (isType(card, "Land")) add("land-played", card.controller, card);
      }
      if (wasInPlay && !inPlay2) {
        add("card-leaves", was.controller, card, { to: card.zone });
        if (card.zone === "graveyard") add("card-dies", was.controller, card);
      }
      if (card.zone === "stack" && was?.zone !== "stack")
        add("card-cast", card.controller, card);
      if (
        ["battlefield", "table"].includes(card.zone) &&
        card.tapped &&
        was &&
        !was.tapped
      )
        add("card-tapped", card.controller, card);
      if (card.attacking != null && was?.attacking == null)
        add("card-attacks", card.controller, card);
      for (const [name, amount] of Object.entries(card.counters || {}))
        if (amount > (was?.counters?.[name] || 0))
          add("counter-added", card.controller, card, { counter: name });
    }
    for (const was of prior.values())
      if (was.zone === "battlefield") {
        add("card-leaves", was.controller, was, { to: "gone" });
        if (was.token) add("card-dies", was.controller, was);
      }
    for (const id of blocked(after))
      if (!blockedBefore.has(id)) {
        const attacker = after.cards.find((card) => card.id === id);
        if (attacker) add("card-blocked", attacker.controller, attacker);
      }
    for (const player of after.players) {
      const earlier = before.players.find((p) => p.id === player.id);
      if (earlier && earlier.life !== player.life)
        found.push({
          verb: "life-changes",
          player: player.id,
          source: null,
          fields: { direction: player.life > earlier.life ? "gained" : "lost" },
        });
    }
    const verb = PHASE_EVENTS[phases[after.phase]];
    if (
      verb &&
      after.active != null &&
      (before.phase !== after.phase ||
        before.turn !== after.turn ||
        before.active !== after.active)
    )
      found.push({ verb, player: after.active, source: null, fields: {} });
    if (after.turn !== before.turn && after.active != null)
      found.push({
        verb: "turn-start",
        player: after.active,
        source: null,
        fields: {},
      });
    return found;
  }
  function respond(state, action, context, allowed) {
    if (!allowed.has(context.owner))
      allowed.set(
        context.owner,
        ((operation) => operation())(() => capabilities(context.owner)).play,
      );
    if (!allowed.get(context.owner)) return;
    const owner = context.owner;
    const target = state.players.find((p) => p.id === owner);
    if (!target) return;
    const source = state.cards.find((card) => card.id === context.source);
    const mine = source && source.controller === owner ? source : null;
    const signed = (n) => (n > 0 ? "+" : "") + n;
    let text = "";
    if (action.type === "delta") {
      target[action.field] = Math.max(
        action.field === "life" ? -999 : 0,
        Math.min(999, (target[action.field] || 0) + action.amount),
      );
      text = `${signed(action.amount)} ${action.field}`;
    } else if (action.type === "draw") {
      text = {
        i18n: "easel.mtg.drew-value",
        args: { value: draw(state, owner, action.count) },
      };
    } else if (action.type === "mana") {
      target.mana[action.color] = Math.min(
        999,
        (target.mana[action.color] || 0) + action.amount,
      );
      text = {
        i18n: "easel.mtg.added-amount-color-mana",
        args: { amount: action.amount, color: action.color },
      };
    } else if (action.type === "player-counter") {
      const name = clean(action.counter, 40).toLowerCase();
      if (!name || ["__proto__", "constructor", "prototype"].includes(name))
        return;
      if (["poison", "energy"].includes(name))
        target[name] = Math.max(0, Math.min(999, target[name] + action.amount));
      else {
        target.counters ??= {};
        const next = Math.max(
          0,
          Math.min(999, (target.counters[name] || 0) + action.amount),
        );
        if (next) target.counters[name] = next;
        else delete target.counters[name];
      }
      text = {
        i18n: "easel.mtg.value-name-counters",
        args: { value: signed(action.amount), name },
      };
    } else if (action.type === "card-counter") {
      if (!mine || !publicZones.includes(mine.zone)) return;
      const preset = counterPresets.find((p) => p.id === action.counter);
      const name = preset?.name || action.counter;
      mine.counterKinds ??= {};
      const next = Math.max(
        0,
        Math.min(999, (mine.counters[name] || 0) + action.amount),
      );
      if (next) {
        mine.counters[name] = next;
        mine.counterKinds[name] = preset || { kind: "custom", name };
      } else {
        delete mine.counters[name];
        delete mine.counterKinds[name];
      }
      text = {
        i18n: "easel.mtg.value-name-counter-on-itself",
        args: { value: signed(action.amount), name },
      };
    } else if (action.type === "card-tap") {
      if (!mine || !["battlefield", "table"].includes(mine.zone)) return;
      mine.tapped = action.state === "tap";
      text = {
        i18n: "easel.mtg.value-itself",
        args: {
          value:
            action.state === "tap"
              ? { i18n: "easel.mtg.tapped" }
              : { i18n: "easel.mtg.untapped" },
        },
      };
    } else if (action.type === "token") {
      if (state.cards.length >= 2e3) return;
      const meta = metadata({
        name: action.name || "Token",
        type: action.kind || "Token",
        power: String(action.power),
        toughness: String(action.toughness),
      });
      state.cards.push(
        createCard(
          state,
          owner,
          meta,
          "battlefield",
          ordered(state, owner, "battlefield").length,
          {
            token: true,
          },
        ),
      );
      text = {
        i18n: "easel.mtg.created-a-power-toughness-name",
        args: {
          power: action.power,
          toughness: action.toughness,
          name: meta.name,
        },
      };
    } else if (action.type === "mill") {
      const cards = ordered(state, owner, "library").slice(0, action.count);
      for (const card of cards) relocate(state, card, "graveyard", owner);
      text = { i18n: "easel.mtg.milled-length", args: { length: cards.length } };
    } else if (action.type === "shuffle") {
      shuffle(state, owner);
      text = { i18n: "easel.mtg.shuffled-their-library-2" };
    } else if (action.type === "tax") {
      target.commanderTax = Math.max(
        0,
        Math.min(999, (target.commanderTax || 0) + action.amount),
      );
      text = {
        i18n: "easel.mtg.value-commander-tax",
        args: { value: signed(action.amount) },
      };
    }
    if (text)
      note(state, owner, `\u2014 ${source?.name || "an effect"}: ${text}.`);
  }
  function runPlayerEvents(before, state) {
    if (!before) return;
    const allowed = /* @__PURE__ */ new Map();
    let prior = before;
    for (let round = 0; round < 4; round++) {
      if (!state.cards.some((card) => card.events?.length)) return;
      const found = eventsBetween(prior, state);
      if (!found.length) return;
      prior = structuredClone(state);
      const instances = state.players.map(
        (player) =>
          new PlayerEvents({
            owner: player.id,
            vocabulary: eventVocabulary,
            execute: (action, context) => {
              try {
                respond(state, action, context, allowed);
              } catch {
                const source = state.cards.find(
                  (card) => card.id === context.source,
                );
                note(state, context.owner, {
                  i18n: "easel.mtg.value-could-not-type",
                  args: {
                    value: source?.name || { i18n: "easel.mtg.an-effect" },
                    type: action.type,
                  },
                });
              }
            },
          }),
      );
      for (const instance of instances)
        for (const card of state.cards)
          if (
            card.controller === instance.owner &&
            LIVE_ZONES.includes(card.zone) &&
            card.events?.length
          )
            try {
              instance.feed(card.id, card.events);
            } catch {}
      for (const event of found)
        for (const instance of instances) instance.receive(event);
    }
  }
  const STACK_SECONDS = 6;
  let stackTimer = null;
  const permanentTypes = [
    "Artifact",
    "Creature",
    "Enchantment",
    "Land",
    "Planeswalker",
    "Battle",
  ];
  function resolveTop(state) {
    const top = topOfStack(state);
    if (!top) return null;
    const permanent = permanentTypes.some((type) => isType(top, type));
    relocate(
      state,
      top,
      permanent ? "battlefield" : "graveyard",
      permanent ? top.controller : top.owner,
    );
    return top;
  }
  function armStack(state) {
    const top = topOfStack(state);
    if (stackTimer && stackTimer.top === top?.id) return;
    if (stackTimer) host.cancel(stackTimer.handle);
    stackTimer = null;
    if (!top) return;
    const total = STACK_SECONDS * 1e3;
    stackTimer = {
      top: top.id,
      deadline: Date.now() + total,
      total,
      handle: host.schedule(top.id, total),
    };
  }
  function expireStack(id) {
    stackTimer = null;
    const record = load(),
      state = structuredClone(record.data.state);
    const top = topOfStack(state);
    if (top?.id !== id) return;
    resolveTop(state);
    note(state, top.controller, {
      i18n: "easel.mtg.resolved-name",
      args: { name: top.name },
    });
    save(record, state);
  }
  function save(record, state) {
    normalizeState(state);
    const active = state.players.find((player) => player.id === state.active);
    if (active && lethalCommanders(state, active).length) {
      const at = state.players.indexOf(active);
      state.active =
        Array.from(
          { length: state.players.length },
          (_, i) => state.players[(at + i + 1) % state.players.length],
        ).find((player) => !lethalCommanders(state, player).length)?.id ?? null;
      state.phase = 0;
    }
    runPlayerEvents(record.data.state, state);
    persist(state);
    armStack(state);
    refresh(state);
  }
  function play(ctx, payload = {}, batch = null) {
    const record = batch?.record ?? load(),
      state = batch?.state ?? structuredClone(record.data.state),
      actor = ctx.accountid;
    const caps = batch?.caps ?? capabilities(actor);
    const warnings = [];
    if (!caps.play)
      return decline({ i18n: "easel.mtg.you-do-not-have-permission-to" });
    if (payload.action === "bottom-shuffle") {
      if (
        batch ||
        !Array.isArray(payload.ids) ||
        !payload.ids.length ||
        payload.ids.length > 100
      )
        return decline({ i18n: "easel.mtg.choose-up-to-100-cards" });
      const ids = [...new Set(payload.ids)];
      for (let i = ids.length - 1; i > 0; i--) {
        const j = host.random(0, i + 1);
        [ids[i], ids[j]] = [ids[j], ids[i]];
      }
      for (const id of ids) {
        const card = state.cards.find((c) => c.id === id);
        const result = play(
          ctx,
          {
            action: "move",
            id,
            zone: "library",
            bottom: true,
            player: card?.owner,
          },
          { record, state, caps },
        );
        if (result?.declined) return result;
      }
      note(state, actor, {
        i18n: "easel.mtg.put-length-cards-on-the-bottom",
        args: { length: ids.length },
      });
      save(record, state);
      return { ok: true };
    }
    if (payload.action === "batch") {
      if (
        batch ||
        !Array.isArray(payload.operations) ||
        !payload.operations.length ||
        payload.operations.length > 100 ||
        payload.operations.some(
          (op) =>
            ![
              "move",
              "modify",
              "control",
              "take-control",
              "return-control",
              "clone",
              "remove",
            ].includes(op?.action),
        )
      )
        return decline({ i18n: "easel.mtg.choose-up-to-100-card-actions" });
      for (const operation of payload.operations) {
        const result = play(ctx, operation, { record, state, caps });
        if (result?.declined) return result;
      }
      save(record, state);
      return { ok: true };
    }
    let action = payload.action;
    state.imports ??= {};
    if (action === "import-commit") {
      if (!state.imports[actor])
        return decline({ i18n: "easel.mtg.start-a-deck-import-first" });
      payload = state.imports[actor];
      action = "import";
      delete state.imports[actor];
    }
    const me = state.players.find((p) => p.id === actor);
    if (action === "sit") {
      if (me) return decline({ i18n: "easel.mtg.you-already-have-a-seat" });
      if (state.players.length >= 8)
        return decline({ i18n: "easel.mtg.all-eight-seats-are-occupied" });
      const hue = pickHue(state);
      state.players.push({
        id: actor,
        hue,
        color: hexOf(hue),
        name: host.name(actor),
        life: state.format === "commander" ? 40 : 20,
        poison: 0,
        energy: 0,
        mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 },
        commanderDamage: {},
        commanderTax: 0,
      });
      state.active ??= actor;
      note(state, actor, { i18n: "easel.mtg.joined-the-table" });
    } else {
      if (!me) return decline({ i18n: "easel.mtg.take-a-seat-first" });
      if (action === "leave") {
        if (
          state.cards.some(
            (card) => card.owner === actor || card.controller === actor,
          )
        )
          return decline({ i18n: "easel.mtg.clear-your-deck-before-leaving-your" });
        state.players = state.players.filter((p) => p.id !== actor);
        if (state.active === actor) {
          state.active = state.players[0]?.id ?? null;
          state.phase = 0;
        }
        delete state.decks[actor];
        delete state.looks[actor];
        note(state, actor, { i18n: "easel.mtg.left-the-table" });
      } else if (action === "import-begin") {
        state.imports[actor] = { name: clean(payload.name), entries: [] };
      } else if (action === "import-chunk") {
        const staged = state.imports[actor];
        if (
          !staged ||
          !Array.isArray(payload.entries) ||
          payload.entries.length > 6 ||
          staged.entries.length + payload.entries.length > 250
        )
          return decline({ i18n: "easel.mtg.invalid-deck-import-chunk" });
        for (const item of payload.entries) {
          if (
            !item ||
            !int(item.quantity, 1, 250) ||
            !["main", "sideboard", "command"].includes(item.section) ||
            !clean(item.name)
          )
            return decline({ i18n: "easel.mtg.invalid-deck-entry" });
          staged.entries.push({
            ...metadata(item),
            quantity: item.quantity,
            section: item.section,
          });
        }
      } else if (action === "import") {
        if (
          !Array.isArray(payload.entries) ||
          !payload.entries.length ||
          payload.entries.length > 250
        )
          return decline({ i18n: "easel.mtg.import-a-deck-with-1-250" });
        const entries = [];
        let total = 0;
        for (const item of payload.entries) {
          if (
            !item ||
            !int(item.quantity, 1, 250) ||
            !["main", "sideboard", "command"].includes(item.section) ||
            !clean(item.name)
          )
            return decline({
              i18n: "easel.mtg.check-deck-names-quantities-and-sections",
            });
          total += item.quantity;
          entries.push({
            ...metadata(item),
            quantity: item.quantity,
            section: item.section,
          });
        }
        if (
          total > 250 ||
          state.cards.filter((c) => c.owner !== actor).length + total > 2e3
        )
          return decline({ i18n: "easel.mtg.a-deck-may-contain-up-to" });
        state.cards = state.cards.filter((card) => card.owner !== actor);
        for (const entry of entries)
          for (let i = 0; i < entry.quantity; i++)
            state.cards.push(
              createCard(
                state,
                actor,
                entry,
                { main: "library", sideboard: "sideboard", command: "command" }[
                  entry.section
                ],
              ),
            );
        state.decks[actor] = {
          name: clean(payload.name) || "My deck",
          entries,
        };
        state.looks = {};
        shuffle(state, actor);
        note(state, actor, { i18n: "easel.mtg.loaded-total-cards", args: { total } });
      } else if (action === "clear") {
        state.cards = state.cards.filter((card) => card.owner !== actor);
        delete state.decks[actor];
        state.looks = {};
        note(state, actor, { i18n: "easel.mtg.cleared-their-deck" });
      } else if (action === "draw") {
        if (!int(payload.count ?? 1, 1, 20))
          return decline({ i18n: "easel.mtg.draw-between-1-and-20-cards" });
        const count = draw(state, actor, payload.count ?? 1);
        note(state, actor, {
          i18n: "easel.mtg.drew-count-card-value",
          args: { count },
        });
      } else if (action === "shuffle") {
        shuffle(state, actor);
        note(state, actor, { i18n: "easel.mtg.shuffled-their-library" });
      } else if (action === "mulligan") {
        ordered(state, actor, "hand").forEach((card) => {
          card.zone = "library";
          card.revealed = false;
        });
        shuffle(state, actor);
        draw(state, actor, 7);
        note(state, actor, {
          i18n: "easel.mtg.mulliganed-to-seven-bottom-cards-manually",
        });
      } else if (action === "reset") {
        tableReset().player(state, actor);
        state.looks = {};
        shuffle(state, actor);
        note(state, actor, { i18n: "easel.mtg.reset-their-board-and-shuffled" });
      } else if (action === "untap") {
        ordered(state, actor, "battlefield").forEach(
          (card) => (card.tapped = false),
        );
        note(state, actor, { i18n: "easel.mtg.untapped-their-battlefield" });
      } else if (action === "look") {
        if (
          !["library", "graveyard", "exile", "command", "sideboard"].includes(
            payload.zone,
          )
        )
          return decline({ i18n: "easel.mtg.choose-a-searchable-zone" });
        const player = payload.player ?? actor;
        if (player !== actor && !publicZones.includes(payload.zone))
          return decline({ i18n: "easel.mtg.that-zone-is-private" });
        const cards = ordered(state, player, payload.zone);
        if (payload.count !== void 0 && !int(payload.count, 1, 250))
          return decline({ i18n: "easel.mtg.choose-a-valid-number-of-cards" });
        if (player === actor)
          state.looks[actor] = {
            player,
            zone: payload.zone,
            ids: cards.slice(0, payload.count ?? cards.length).map((c) => c.id),
          };
        else
          host.notify(actor, "easel.mtg.inspect", {
            zone: payload.zone,
            cards: cards.map((c) => visibleCard(c, actor)),
          });
        if (payload.zone === "library")
          note(
            state,
            actor,
            payload.count
              ? {
                  i18n: "easel.mtg.looked-at-the-top-math-cards",
                  args: { Math: Math.min(payload.count, cards.length) },
                }
              : { i18n: "easel.mtg.searched-their-library" },
          );
      } else if (action === "close-look") {
        delete state.looks[actor];
      } else if (action === "show") {
        if (!int(payload.count ?? 1, 1, 250))
          return decline({ i18n: "easel.mtg.choose-a-valid-number-of-cards" });
        if (
          payload.to != null &&
          !state.players.some((p) => p.id === payload.to && p.id !== actor)
        )
          return decline({ i18n: "easel.mtg.choose-another-seated-player" });
        const cards = ordered(state, actor, "library").slice(
          0,
          payload.count ?? 1,
        );
        if (!cards.length)
          return decline({ i18n: "easel.mtg.your-library-is-empty" });
        me.show = {
          zone: "library",
          ids: cards.map((c) => c.id),
          to: payload.to ?? null,
        };
        note(
          state,
          actor,
          payload.to == null
            ? {
                i18n: "easel.mtg.revealed-the-top-length-card-value",
                args: {
                  length: cards.length,
                  count: cards.length,
                  value2: cards.map((c) => c.name).join(", "),
                },
              }
            : {
                i18n: "easel.mtg.showed-the-top-length-card-value",
                args: {
                  length: cards.length,
                  count: cards.length,
                  name: state.players.find((p) => p.id === payload.to).name,
                },
              },
        );
      } else if (action === "battlemap") {
        const geometry = payload.geometry;
        const size = (box, min, max) =>
          box && int(box.width, min, max) && int(box.height, min, max);
        if (
          typeof payload.id !== "string" ||
          !/^[\w-]{1,60}$/.test(payload.id) ||
          !size(geometry?.card, 20, 2e3) ||
          !size(geometry?.main, 50, 1e4) ||
          !size(geometry?.lands, 50, 1e4)
        )
          return decline({ i18n: "easel.mtg.choose-a-battlemap-from-the-list" });
        const groups = [
          ...landGrouping(state).groups(landsOf(state, actor)).values(),
        ];
        const previous = me.battlemap;
        me.battlemap = payload.id;
        me.geometry = {
          card: { width: geometry.card.width, height: geometry.card.height },
          main: { width: geometry.main.width, height: geometry.main.height },
          lands: { width: geometry.lands.width, height: geometry.lands.height },
        };
        const area = areaOf(state, actor, "lands");
        for (const members of groups)
          landGrouping(state).layout(area, members, members[0].x * area.width);
        if (previous !== payload.id)
          note(state, actor, { i18n: "easel.mtg.changed-their-battlemap" });
      } else if (action === "set-events") {
        const card = state.cards.find((c) => c.id === payload.id);
        if (
          !card ||
          !(
            card.controller === actor ||
            (card.controller == null && card.zone === "table") ||
            (caps.controlOther && publicZones.includes(card.zone))
          )
        )
          return decline({ i18n: "easel.mtg.you-do-not-control-that-card" });
        if (!Array.isArray(payload.events) || payload.events.length > 20)
          return decline({ i18n: "easel.mtg.give-up-to-20-events" });
        try {
          card.events = payload.events.map((definition) =>
            eventVocabulary.validate(definition),
          );
        } catch (error) {
          return decline(error.message);
        }
        if (!card.events.length) delete card.events;
        note(state, actor, {
          i18n: "easel.mtg.set-value-events-on-name",
          args: {
            value: card.events?.length || 0,
            name: card.name || { i18n: "easel.mtg.a-card" },
          },
        });
      } else if (action === "forget-events") {
        const key = String(payload.scryfall ?? "");
        const saved = state.savedEvents?.[key];
        if (!saved || !Object.hasOwn(state.savedEvents, key))
          return decline({ i18n: "easel.mtg.those-saved-rules-are-already-gone" });
        if (saved.by !== actor && !caps.manage)
          return decline({ i18n: "easel.mtg.only-the-player-who-saved-these" });
        delete state.savedEvents[key];
        note(state, actor, {
          i18n: "easel.mtg.forgot-the-saved-rules-for-name",
          args: { name: saved.name || { i18n: "easel.mtg.a-card" } },
        });
      } else if (action === "remember-events") {
        const card = state.cards.find((c) => c.id === payload.id);
        const key = card?.scryfall;
        if (!key) return decline({ i18n: "easel.mtg.only-cards-with-a-scryfall-id" });
        state.savedEvents ??= {};
        if (
          !Array.isArray(payload.events) ||
          !payload.events.length ||
          payload.events.length > 20
        )
          return decline({ i18n: "easel.mtg.save-between-one-and-twenty-rules" });
        let events;
        try {
          events = payload.events.map((definition) =>
            eventVocabulary.validate(definition),
          );
        } catch (error) {
          return decline(error.message);
        }
        if (
          !Object.hasOwn(state.savedEvents, key) &&
          Object.keys(state.savedEvents).length >= 500
        )
          return decline({ i18n: "easel.mtg.this-table-already-has-500-saved" });
        state.savedEvents[key] = {
          name: card.name,
          events,
          by: actor,
          at: /* @__PURE__ */ new Date().toISOString(),
        };
        note(state, actor, {
          i18n: "easel.mtg.saved-rules-for-name-for-later",
          args: { name: card.name },
        });
      } else if (action === "close-show") {
        delete me.show;
      } else if (action === "new-game") {
        if (!caps.manage)
          return decline({ i18n: "easel.mtg.only-a-table-manager-can-start" });
        state.starter = tableReset().newGame(state);
        state.looks = {};
        state.stackSeq = 0;
        state.drawn = {};
        note(state, actor, {
          i18n: "easel.mtg.started-a-new-game-value-goes",
          args: {
            value: state.players.find((p) => p.id === state.active)?.name || {
              i18n: "easel.mtg.nobody",
            },
          },
        });
      } else if (action === "player") {
        const target = state.players.find(
          (p) => p.id === (payload.player ?? actor),
        );
        if (!target || (target.id !== actor && !caps.controlOther))
          return decline({ i18n: "easel.mtg.you-do-not-control-that-player" });
        if (!int(payload.delta, -100, 100))
          return decline({ i18n: "easel.mtg.choose-a-valid-counter-adjustment" });
        if (
          ["life", "poison", "energy", "commanderTax"].includes(payload.field)
        )
          target[payload.field] = Math.max(
            payload.field === "life" ? -999 : 0,
            Math.min(999, target[payload.field] + payload.delta),
          );
        else if (
          payload.field === "mana" &&
          Object.hasOwn(target.mana, payload.key)
        )
          target.mana[payload.key] = Math.max(
            0,
            Math.min(999, target.mana[payload.key] + payload.delta),
          );
        else if (payload.field === "commanderDamage") {
          const sources = commanders(state);
          const source =
            sources.find((source2) => source2.id === payload.source) ||
            sources
              .filter((source2) => source2.owner === payload.source)
              .filter((_, i, all) => all.length === 1)[0];
          if (!source)
            return decline({
              i18n: "easel.mtg.choose-the-individual-commander-that-dealt",
            });
          target.commanderDamage[source.id] = Math.max(
            0,
            Math.min(999, damageFrom(target, source) + payload.delta),
          );
          if (source.id.startsWith("player-"))
            delete target.commanderDamage[source.owner];
        } else if (payload.field === "counter") {
          const name = clean(payload.key, 40);
          if (!name || ["__proto__", "constructor", "prototype"].includes(name))
            return decline({ i18n: "easel.mtg.choose-a-counter" });
          if (["poison", "energy"].includes(name))
            target[name] = Math.max(
              0,
              Math.min(999, target[name] + payload.delta),
            );
          else {
            target.counters ??= {};
            if (
              !Object.hasOwn(target.counters, name) &&
              Object.keys(target.counters).length >= 30
            )
              return decline({ i18n: "easel.mtg.that-player-has-too-many-kinds" });
            const next = Math.max(
              0,
              Math.min(
                999,
                (Object.hasOwn(target.counters, name)
                  ? target.counters[name]
                  : 0) + payload.delta,
              ),
            );
            if (next) target.counters[name] = next;
            else delete target.counters[name];
          }
        } else return decline({ i18n: "easel.mtg.choose-a-supported-counter" });
        note(state, actor, {
          i18n: "easel.mtg.adjusted-name-s-value-by-value2",
          args: {
            name: target.name,
            value:
              payload.field === "counter"
                ? {
                    i18n: "easel.mtg.value-counters",
                    args: { value: clean(payload.key, 40) },
                  }
                : payload.field,
            value2: payload.delta > 0 ? "+" : "",
            delta: payload.delta,
          },
        });
      } else if (action === "turn") {
        if (state.active !== actor && !caps.manage)
          return decline({ i18n: "easel.mtg.only-the-active-player-or-an" });
        const at = state.players.findIndex((p) => p.id === state.active);
        state.active =
          Array.from(
            { length: state.players.length },
            (_, i) => state.players[(at + i + 1) % state.players.length],
          ).find((player) => !lethalCommanders(state, player).length)?.id ??
          null;
        const from = state.phase;
        state.phase = 0;
        state.turn++;
        clearCombat(state);
        clearDamage(state);
        note(state, actor, { i18n: "easel.mtg.passed-the-turn" });
        enterPhase(state, actor, from, 0);
      } else if (action === "phase") {
        if (state.active !== actor && !caps.manage)
          return decline({ i18n: "easel.mtg.you-cannot-advance-this-turn" });
        if (!int(payload.phase, 0, phases.length - 1))
          return decline({ i18n: "easel.mtg.choose-a-phase" });
        const from = state.phase;
        state.phase = payload.phase;
        note(state, actor, {
          i18n: "easel.mtg.set-the-phase-to-value",
          args: { value: phases[state.phase] },
        });
        enterPhase(state, actor, from, state.phase);
      } else if (action === "roll") {
        if (!int(payload.sides ?? 20, 2, 100))
          return decline({ i18n: "easel.mtg.use-a-die-with-2-100" });
        note(state, actor, {
          i18n: "easel.mtg.rolled-value-on-a-d-sides",
          args: {
            value: host.random(1, (payload.sides ?? 20) + 1),
            sides: payload.sides ?? 20,
          },
        });
      } else if (action === "settings") {
        if (!caps.manage)
          return decline({ i18n: "easel.mtg.you-do-not-have-permission-to-2" });
        if (payload.format !== void 0) {
          if (!["commander", "standard"].includes(payload.format))
            return decline({ i18n: "easel.mtg.choose-commander-or-20-life-play" });
          state.format = payload.format;
        }
        if (payload.shape !== void 0) {
          if (!["auto", "square", "circle", "polygon"].includes(payload.shape))
            return decline({ i18n: "easel.mtg.choose-a-table-shape" });
          state.shape = payload.shape;
        }
        if (payload.size !== void 0) {
          if (
            !Number.isFinite(payload.size) ||
            payload.size < 0.4 ||
            payload.size > 1.4
          )
            return decline({ i18n: "easel.mtg.choose-a-table-size" });
          state.size = payload.size;
        }
        note(state, actor, { i18n: "easel.mtg.adjusted-the-table" });
      } else if (action === "assist") {
        const settingKeys = {
          untap: "autoUntap",
          draw: "autoDraw",
          mana: "autoMana",
        };
        if (
          Object.keys(payload).some(
            (key) => key !== "action" && !Object.hasOwn(settingKeys, key),
          ) ||
          Object.keys(settingKeys).some(
            (key) =>
              payload[key] !== void 0 && typeof payload[key] !== "boolean",
          )
        )
          return decline({ i18n: "easel.mtg.choose-a-supported-turn-preference" });
        for (const key of ["untap", "draw", "mana"])
          if (payload[key] !== void 0) {
            state.preferences ??= {};
            state.preferences[actor] ??= {};
            state.preferences[actor][settingKeys[key]] = payload[key];
          }
        note(state, actor, { i18n: "easel.mtg.changed-their-turn-preferences" });
      } else if (action === "cast") {
        const card = state.cards.find((c) => c.id === payload.id);
        if (
          !card ||
          card.controller !== actor ||
          !["hand", "command"].includes(card.zone)
        )
          return decline({ i18n: "easel.mtg.cast-a-card-from-your-hand" });
        if (isType(card, "Land")) {
          me.landsPlayed =
            me.landsPlayed?.turn === state.turn
              ? me.landsPlayed
              : { turn: state.turn, count: 0 };
          me.landsPlayed.count++;
          if (me.landsPlayed.count > 1)
            warnings.push({
              i18n: "easel.mtg.that-is-land-number-count-you",
              args: { count: me.landsPlayed.count },
            });
          if (state.active !== actor)
            warnings.push({ i18n: "easel.mtg.lands-are-normally-played-on-your" });
          relocate(state, card, "battlefield", actor);
          note(state, actor, {
            i18n: "easel.mtg.played-name",
            args: { name: card.name },
          });
        } else {
          const fromCommand = card.zone === "command";
          me.commanderCasts ??= {};
          const casts = fromCommand ? me.commanderCasts[card.id] || 0 : 0;
          const payment = payCost(me.mana, parseCost(card.mana), casts * 2);
          if (!payment.ok)
            warnings.push({
              i18n: "easel.mtg.your-mana-pool-is-missing-missing",
              args: {
                missing: payment.missing.join(", "),
                mana: card.mana || { i18n: "easel.mtg.this-spell" },
                value: casts
                  ? {
                      i18n: "easel.mtg.plus-value-commander-tax",
                      args: { value: casts * 2 },
                    }
                  : "",
              },
            });
          else if (payload.pay !== false) me.mana = payment.pool;
          const fast = keywordsOf(card).has("flash") || isType(card, "Instant");
          if (
            !fast &&
            (state.active !== actor ||
              ![3, 9].includes(state.phase) ||
              topOfStack(state))
          )
            warnings.push({ i18n: "easel.mtg.this-spell-is-normally-cast-in" });
          if (fromCommand) {
            me.commanderCasts[card.id] = casts + 1;
            me.commanderTax = (casts + 1) * 2;
          }
          state.stackSeq = (state.stackSeq || 0) + 1;
          relocate(state, card, "stack", actor);
          card.stackIndex = state.stackSeq;
          note(state, actor, {
            i18n: "easel.mtg.cast-name-value",
            args: {
              name: card.name,
              value:
                payment.ok && payload.pay !== false
                  ? { i18n: "easel.mtg.paying-from-their-pool" }
                  : "",
            },
          });
        }
      } else if (action === "resolve") {
        const top = topOfStack(state);
        if (!top) return decline({ i18n: "easel.mtg.the-stack-is-empty" });
        if (top.controller !== actor && state.active !== actor && !caps.manage)
          return decline({ i18n: "easel.mtg.the-spell-s-controller-or-the" });
        resolveTop(state);
        note(state, actor, {
          i18n: "easel.mtg.resolved-name",
          args: { name: top.name },
        });
      } else if (action === "attack") {
        const card = state.cards.find((c) => c.id === payload.id);
        if (
          !card ||
          card.zone !== "battlefield" ||
          card.controller !== actor ||
          !isType(card, "Creature")
        )
          return decline({ i18n: "easel.mtg.attack-with-a-creature-you-control" });
        if (payload.target === null) {
          delete card.attacking;
          note(state, actor, {
            i18n: "easel.mtg.removed-name-from-combat",
            args: { name: card.name },
          });
        } else {
          const target = state.players.find(
            (p) => p.id === payload.target && p.id !== actor,
          );
          if (!target)
            return decline({ i18n: "easel.mtg.choose-an-opponent-to-attack" });
          const words = keywordsOf(card);
          if (card.tapped)
            warnings.push({
              i18n: "easel.mtg.name-is-tapped",
              args: { name: card.name },
            });
          if (card.enteredTurn === state.turn && !words.has("haste"))
            warnings.push({
              i18n: "easel.mtg.name-came-under-your-control-this",
              args: { name: card.name },
            });
          if (words.has("defender"))
            warnings.push({
              i18n: "easel.mtg.name-has-defender",
              args: { name: card.name },
            });
          if (state.active !== actor)
            warnings.push({
              i18n: "easel.mtg.creatures-normally-attack-on-their-controller",
            });
          card.attacking = target.id;
          if (!words.has("vigilance")) card.tapped = true;
          note(state, actor, {
            i18n: "easel.mtg.attacked-name-with-name2",
            args: { name: target.name, name2: card.name },
          });
        }
      } else if (action === "block") {
        const card = state.cards.find((c) => c.id === payload.id);
        if (
          !card ||
          card.zone !== "battlefield" ||
          card.controller !== actor ||
          !isType(card, "Creature")
        )
          return decline({ i18n: "easel.mtg.block-with-a-creature-you-control" });
        if (payload.attacker === null) {
          delete card.blocking;
          note(state, actor, {
            i18n: "easel.mtg.stopped-blocking-with-name",
            args: { name: card.name },
          });
        } else {
          const attacker = state.cards.find(
            (c) =>
              c.id === payload.attacker &&
              c.zone === "battlefield" &&
              c.attacking != null,
          );
          if (!attacker)
            return decline({ i18n: "easel.mtg.choose-an-attacking-creature" });
          const mine = keywordsOf(card),
            theirs = keywordsOf(attacker);
          if (card.tapped)
            warnings.push({
              i18n: "easel.mtg.name-is-tapped",
              args: { name: card.name },
            });
          if (attacker.attacking !== actor)
            warnings.push({
              i18n: "easel.mtg.name-is-not-attacking-you",
              args: { name: attacker.name },
            });
          if (theirs.has("flying") && !mine.has("flying") && !mine.has("reach"))
            warnings.push({
              i18n: "easel.mtg.name-has-flying-name2-needs-flying",
              args: { name: attacker.name, name2: card.name },
            });
          card.blocking = attacker.id;
          note(state, actor, {
            i18n: "easel.mtg.blocked-name-with-name2",
            args: { name: attacker.name, name2: card.name },
          });
        }
      } else if (action === "clear-combat") {
        clearCombat(state);
        note(state, actor, { i18n: "easel.mtg.cleared-combat" });
      } else if (action === "combat-damage") {
        if (state.active !== actor && !caps.manage)
          return decline({
            i18n: "easel.mtg.the-active-player-applies-combat-damage",
          });
        const plan = combatPlan(state, counterPresets);
        if (!plan.attackers.length)
          return decline({ i18n: "easel.mtg.no-creatures-are-attacking" });
        for (const [id, amount] of Object.entries(plan.players)) {
          const target = state.players.find((p) => String(p.id) === id);
          if (target) target.life -= amount;
        }
        for (const [id, amount] of Object.entries(plan.lifelink)) {
          const target = state.players.find((p) => String(p.id) === id);
          if (target) target.life += amount;
        }
        for (const [id, sources] of Object.entries(plan.commander)) {
          const target = state.players.find((p) => String(p.id) === id);
          if (!target) continue;
          target.commanderDamage ??= {};
          for (const [source, amount] of Object.entries(sources))
            target.commanderDamage[source] =
              (target.commanderDamage[source] || 0) + amount;
        }
        for (const [id, amount] of Object.entries(plan.cards)) {
          const card = state.cards.find((c) => c.id === id);
          if (card) card.damage = (card.damage || 0) + amount;
        }
        for (const id of plan.deathtouched) {
          const card = state.cards.find((c) => c.id === id);
          if (card) card.deathtouched = true;
        }
        note(state, actor, {
          i18n: "easel.mtg.applied-combat-damage-summary",
          args: {
            summary: plan.summary.length ? plan.summary : { i18n: "easel.mtg.none" },
          },
        });
      } else if (action === "apply-check") {
        const check = rulesChecks(state, counterPresets).find(
          (item) => item.key === payload.key,
        );
        if (!check?.fix)
          return decline({ i18n: "easel.mtg.that-check-has-nothing-to-apply" });
        const card = state.cards.find((c) => c.id === check.fix.card);
        if (!card) return decline({ i18n: "easel.mtg.that-card-has-already-moved" });
        relocate(state, card, "graveyard", card.owner);
        note(state, actor, {
          i18n: "easel.mtg.put-name-into-its-owner-s",
          args: { name: card.name },
        });
      } else if (action === "token") {
        if (state.cards.length >= 2e3)
          return decline({ i18n: "easel.mtg.the-table-card-limit-has-been" });
        const meta = metadata(payload);
        if (!meta.name) return decline({ i18n: "easel.mtg.give-the-token-a-name" });
        let events;
        try {
          events = Array.isArray(payload.events)
            ? payload.events
                .slice(0, 20)
                .map((definition) => eventVocabulary.validate(definition))
            : void 0;
        } catch (error) {
          return decline(error.message);
        }
        state.cards.push(
          createCard(
            state,
            actor,
            meta,
            "battlefield",
            ordered(state, actor, "battlefield").length,
            { token: true, ...(events?.length ? { events } : {}) },
          ),
        );
        note(state, actor, {
          i18n: "easel.mtg.created-name",
          args: { name: meta.name },
        });
      } else if (
        [
          "move",
          "modify",
          "clone",
          "control",
          "take-control",
          "return-control",
          "remove",
          "attach",
          "detach",
        ].includes(action)
      ) {
        if (action === "take-control" && !caps.takeControl)
          return decline({ i18n: "easel.mtg.you-do-not-have-permission-to-3" });
        const card =
          payload.id === "library-" + actor && action === "move"
            ? ordered(state, actor, "library")[0]
            : state.cards.find((c) => c.id === payload.id);
        if (
          !card ||
          !(
            card.controller === actor ||
            (card.controller == null && card.zone === "table") ||
            (caps.controlOther && publicZones.includes(card.zone)) ||
            (action === "take-control" &&
              caps.takeControl &&
              card.zone === "battlefield")
          )
        )
          return decline({ i18n: "easel.mtg.you-do-not-have-permission-to-4" });
        const wasVisible = visibleCard(card, actor).faceup;
        const wasPublic =
          card.revealed || (publicZones.includes(card.zone) && !card.facedown);
        if (action === "attach") {
          const host2 = state.cards.find((item) => item.id === payload.host);
          if (
            !inPlay.includes(card.zone) ||
            !host2 ||
            !inPlay.includes(host2.zone)
          )
            return decline({ i18n: "easel.mtg.attach-cards-that-are-on-the" });
          const seen = /* @__PURE__ */ new Set([card.id]);
          let ancestor = host2;
          while (ancestor) {
            if (seen.has(ancestor.id))
              return decline({ i18n: "easel.mtg.a-card-cannot-attach-to-itself" });
            seen.add(ancestor.id);
            ancestor = state.cards.find(
              (item) => item.id === ancestor.attachedTo,
            );
          }
          if (card.group) leaveGroup(state, card);
          card.attachedTo = host2.id;
          note(state, actor, { i18n: "easel.mtg.attached-a-card-to-another-card" });
        } else if (action === "detach") {
          if (!card.attachedTo)
            return decline({ i18n: "easel.mtg.that-card-is-not-attached" });
          delete card.attachedTo;
          if (card.zone === "battlefield")
            Object.assign(
              card,
              openPosition(
                state,
                card.controller,
                card.id,
                card.region || "main",
              ),
            );
          note(state, actor, { i18n: "easel.mtg.detached-a-card" });
        } else if (action === "move") {
          const zone = payload.zone;
          if (!zones.includes(zone))
            return decline({ i18n: "easel.mtg.choose-a-valid-zone" });
          const target =
            zone === "table"
              ? null
              : ["hand", "library", "graveyard"].includes(zone)
                ? card.owner
                : (payload.player ?? card.controller ?? actor);
          if (
            (zone !== "table" && !state.players.some((p) => p.id === target)) ||
            (zone !== "table" &&
              target !== actor &&
              !caps.controlOther &&
              target !== card.controller &&
              !["hand", "library", "graveyard"].includes(zone))
          )
            return decline({ i18n: "easel.mtg.you-cannot-place-cards-in-that" });
          const cards = ordered(state, target, zone).filter(
            (c) => c.id !== card.id,
          );
          const before =
            payload.player !== void 0 && target !== payload.player
              ? null
              : payload.before;
          if (before != null && !cards.some((c) => c.id === before))
            return decline({ i18n: "easel.mtg.the-insertion-target-is-no-longer" });
          for (const key of ["x", "y"])
            if (
              payload[key] !== void 0 &&
              (!Number.isFinite(payload[key]) ||
                (zone === "table"
                  ? Math.abs(payload[key]) > 500
                  : payload[key] < 0 || payload[key] > 1))
            )
              return decline({ i18n: "easel.mtg.choose-a-position-inside-the-play" });
          const oldZone = card.zone;
          if (
            payload.region !== void 0 &&
            !["main", "lands"].includes(payload.region)
          )
            return decline({ i18n: "easel.mtg.choose-the-battlefield-or-the-lands" });
          const region =
            zone === "battlefield"
              ? (payload.region ??
                (oldZone === "battlefield"
                  ? card.region || "main"
                  : regionFor(card)))
              : null;
          const entering = oldZone !== zone || card.controller !== target;
          const stacking =
            zone === "battlefield" &&
            region === "lands" &&
            isType(card, "Land");
          delete card.attachedTo;
          if (card.group) leaveGroup(state, card);
          const position =
            zone === "battlefield" &&
            (entering || (card.region || "main") !== region)
              ? openPosition(state, target, card.id, region)
              : card;
          if (region) card.region = region;
          invalidateLooks(state, card.controller, oldZone);
          invalidateLooks(state, target, zone);
          card.zone = zone;
          card.controller = target;
          card.x = payload.x ?? position.x;
          card.y = payload.y ?? position.y;
          if (
            oldZone !== zone &&
            !(inPlay.includes(oldZone) && inPlay.includes(zone))
          ) {
            delete card.skipUntap;
            card.tapped = false;
            card.revealed = false;
            card.facedown = false;
            card.counters = {};
            card.counterKinds = {};
            card.controlHistory = [];
            delete card.attacking;
            delete card.blocking;
            delete card.damage;
            delete card.deathtouched;
            delete card.stackIndex;
            if (zone === "battlefield") card.enteredTurn = state.turn;
          }
          const index = payload.bottom
            ? cards.length
            : before != null
              ? cards.findIndex((c) => c.id === before)
              : ["library"].includes(zone)
                ? 0
                : cards.length;
          cards.splice(index, 0, card);
          cards.forEach((c, order) => (c.order = order));
          if (stacking) {
            if (entering) stackLand(state, card, target);
            else dropLand(state, card, target);
          }
          if (zone === "table") delete card.region;
          if (card.token && !["battlefield", "exile", "table"].includes(zone))
            state.cards = state.cards.filter((c) => c.id !== card.id);
          if (oldZone !== zone)
            note(state, actor, {
              i18n: "easel.mtg.moved-value-to-zone",
              args: {
                value:
                  wasPublic || (publicZones.includes(zone) && !card.facedown)
                    ? card.name
                    : { i18n: "easel.mtg.a-card" },
                zone,
              },
            });
        } else if (action === "modify") {
          if (!payload.changes || typeof payload.changes !== "object")
            return decline({ i18n: "easel.mtg.choose-a-card-change" });
          const changes = payload.changes;
          if (
            Object.keys(changes).some(
              (k) =>
                ![
                  "tapped",
                  "facedown",
                  "transformed",
                  "revealed",
                  "counter",
                  "mana",
                  "skipUntap",
                ].includes(k),
            )
          )
            return decline({ i18n: "easel.mtg.unsupported-card-change" });
          if (
            Object.keys(changes).some(
              (k) =>
                !["counter", "mana"].includes(k) &&
                typeof changes[k] !== "boolean",
            ) ||
            (changes.mana !== void 0 && !manaColors.includes(changes.mana))
          )
            return decline({ i18n: "easel.mtg.invalid-card-change" });
          if (changes.transformed && !card.backImage)
            return decline({ i18n: "easel.mtg.this-card-has-no-second-face" });
          if (changes.tapped !== void 0 && !inPlay.includes(card.zone))
            return decline({ i18n: "easel.mtg.only-cards-in-play-can-tap" });
          if (changes.skipUntap !== void 0) {
            const enabled =
              card.zone === "battlefield" &&
              ((operation) => operation())(
                () => turnPreferences(card.controller).untap,
              );
            if (!enabled)
              return decline({ i18n: "easel.mtg.this-card-does-not-have-automatic" });
            if (changes.skipUntap) card.skipUntap = true;
            else delete card.skipUntap;
          }
          if (changes.counter) {
            if (
              !publicZones.includes(card.zone) ||
              !int(changes.counter.delta, -100, 100)
            )
              return decline({ i18n: "easel.mtg.choose-a-valid-card-counter" });
            const preset = changes.counter.type
              ? counterPresets.find((p) => p.id === changes.counter.type)
              : counterPresets.find(
                  (p) =>
                    p.name.toLowerCase() ===
                    clean(changes.counter.name, 40).toLowerCase(),
                );
            if (changes.counter.type && !preset)
              return decline({
                i18n: "easel.mtg.choose-a-supported-counter-type-or",
              });
            const name = preset?.name || clean(changes.counter.name, 40);
            if (
              !name ||
              ["__proto__", "constructor", "prototype"].includes(name) ||
              (Object.keys(card.counters).length >= 20 &&
                !Object.hasOwn(card.counters, name))
            )
              return decline({ i18n: "easel.mtg.choose-a-counter-name" });
            const next = Math.max(
              0,
              Math.min(
                999,
                (Object.hasOwn(card.counters, name) ? card.counters[name] : 0) +
                  changes.counter.delta,
              ),
            );
            card.counterKinds ??= {};
            if (next) {
              card.counters[name] = next;
              card.counterKinds[name] = preset || { kind: "custom", name };
            } else {
              delete card.counters[name];
              delete card.counterKinds[name];
            }
          }
          for (const key of ["facedown", "transformed", "revealed"])
            if (changes[key] !== void 0) card[key] = changes[key];
          const tap =
            changes.tapped !== void 0
              ? tapCards(state, card, changes.tapped, changes.mana)
              : null;
          const mana = Object.entries(tap?.added || {})
            .map(([color, amount]) => `{${color}}`.repeat(amount))
            .join("");
          note(
            state,
            actor,
            tap && Object.keys(changes).length <= 2
              ? `${changes.tapped ? "tapped" : "untapped"} ${tap.changed.length > 1 ? tap.changed.length + " \xD7 " : ""}${wasPublic ? card.name : "a card"}${mana ? " for " + mana : ""}.`
              : {
                  i18n: "easel.mtg.updated-value",
                  args: {
                    value:
                      wasPublic ||
                      card.revealed ||
                      (publicZones.includes(card.zone) && !card.facedown)
                        ? card.name
                        : { i18n: "easel.mtg.a-card" },
                  },
                },
          );
        } else if (
          ["control", "take-control", "return-control"].includes(action)
        ) {
          const target =
            action === "take-control"
              ? actor
              : action === "return-control"
                ? (card.controlHistory?.at(-1) ?? card.owner)
                : payload.player;
          if (
            card.zone !== "battlefield" ||
            !state.players.some((p) => p.id === target)
          )
            return decline({
              i18n: "easel.mtg.control-can-be-changed-for-battlefield",
            });
          if (target === card.controller)
            return decline({
              i18n: "easel.mtg.that-player-already-controls-this-card",
            });
          card.controlHistory ??= [];
          if (action === "return-control") card.controlHistory.pop();
          else card.controlHistory.push(card.controller);
          card.controlHistory = card.controlHistory.slice(-20);
          if (card.group) leaveGroup(state, card);
          card.controller = target;
          Object.assign(
            card,
            openPosition(state, target, card.id, card.region || "main"),
          );
          if (card.region === "lands" && isType(card, "Land"))
            stackLand(state, card, target);
          note(state, actor, {
            i18n: "easel.mtg.changed-control-of-value-to-name",
            args: {
              value: wasPublic ? card.name : { i18n: "easel.mtg.a-card" },
              name: state.players.find((p) => p.id === target).name,
            },
          });
        } else if (action === "remove") {
          if (!card.token)
            return decline({ i18n: "easel.mtg.only-tokens-can-be-removed" });
          state.cards = state.cards.filter((c) => c.id !== card.id);
          note(state, actor, { i18n: "easel.mtg.removed-a-token" });
        } else {
          if (!wasVisible || state.cards.length >= 2e3)
            return decline({ i18n: "easel.mtg.only-visible-cards-can-be-copied" });
          state.cards.push(
            createCard(
              state,
              actor,
              metadata(card),
              "battlefield",
              ordered(state, actor, "battlefield").length,
              { token: true, name: card.name + " (copy)" },
            ),
          );
          note(state, actor, {
            i18n: "easel.mtg.created-a-copy-of-name",
            args: { name: card.name },
          });
        }
      } else return decline({ i18n: "easel.mtg.unknown-table-action" });
    }
    if (!batch) save(record, state);
    return warnings.length ? { ok: true, warnings } : { ok: true };
  }
  return { fresh, snapshot, play, expireStack, armStack };
}
const KEYWORDS = [
  "flying",
  "first strike",
  "double strike",
  "deathtouch",
  "haste",
  "hexproof",
  "indestructible",
  "lifelink",
  "menace",
  "reach",
  "trample",
  "vigilance",
  "defender",
  "shroud",
  "flash",
];
const COLORS = ["W", "U", "B", "R", "G", "C"];
const typeLine = (card) =>
  card.transformed && card.backType ? card.backType : card.type || "";
const isType = (card, type) =>
  new RegExp("\\b" + type + "\\b", "i").test(typeLine(card));
function keywordsOf(card) {
  const found = /* @__PURE__ */ new Set();
  for (const [name, count] of Object.entries(card.counters || {}))
    if (
      count > 0 &&
      (card.counterKinds?.[name]?.kind === "keyword" ||
        KEYWORDS.includes(name.toLowerCase()))
    )
      found.add(name.toLowerCase());
  const text = String(card.oracle || "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, "");
  for (const line of text.split("\n"))
    for (const part of line.split(/[,;]/)) {
      const word = part.trim().replace(/\.$/, "");
      if (KEYWORDS.includes(word)) found.add(word);
    }
  return found;
}
function statsOf(card, presets = []) {
  if (!isType(card, "Creature")) return null;
  const base = (value) =>
    value !== "" && value != null && Number.isFinite(Number(value))
      ? Number(value)
      : 0;
  let power = base(
      card.transformed ? card.backPower || card.power : card.power,
    ),
    toughness = base(
      card.transformed ? card.backToughness || card.toughness : card.toughness,
    );
  for (const [name, count] of Object.entries(card.counters || {})) {
    const kind =
      card.counterKinds?.[name] ||
      presets.find((preset) => preset.name === name);
    if (kind?.kind === "stat") {
      power += kind.power * count;
      toughness += kind.toughness * count;
    }
  }
  return { power, toughness };
}
function parseCost(text = "") {
  const cost = {
    generic: 0,
    W: 0,
    U: 0,
    B: 0,
    R: 0,
    G: 0,
    C: 0,
    X: 0,
    hybrid: [],
  };
  for (const [, raw] of String(text || "").matchAll(/\{([^}]+)\}/g)) {
    const symbol = raw.toUpperCase();
    if (/^\d+$/.test(symbol)) cost.generic += Number(symbol);
    else if (COLORS.includes(symbol) || symbol === "X") cost[symbol]++;
    else if (symbol.includes("/")) cost.hybrid.push(symbol.split("/"));
  }
  return cost;
}
function payCost(pool = {}, cost, extra = 0) {
  const left = Object.fromEntries(
    COLORS.map((color) => [color, Math.max(0, Number(pool[color]) || 0)]),
  );
  const missing = [];
  for (const color of COLORS) {
    const take = Math.min(left[color], cost[color]);
    left[color] -= take;
    if (cost[color] > take) missing.push(`${cost[color] - take} ${color}`);
  }
  let generic = cost.generic + extra;
  for (const options of cost.hybrid) {
    const color = options.find(
      (option) => COLORS.includes(option) && left[option] > 0,
    );
    if (color) left[color]--;
    else if (options.some((option) => /^\d+$/.test(option)))
      generic += Number(options.find((option) => /^\d+$/.test(option)));
    else if (!options.includes("P")) missing.push(options.join("/"));
  }
  for (const color of ["C", ...COLORS.filter((c) => c !== "C")]) {
    const take = Math.min(left[color], generic);
    left[color] -= take;
    generic -= take;
  }
  if (generic > 0) missing.push(`${generic} generic`);
  return { ok: !missing.length, pool: left, missing };
}
function rulesChecks(state, presets = []) {
  const checks = [];
  for (const player of state.players) {
    if (player.life <= 0)
      checks.push({
        key: "life:" + player.id,
        text: {
          i18n: "easel.mtg.name-is-at-life-life-and",
          args: { name: player.name, life: player.life },
        },
      });
    if (player.poison >= 10)
      checks.push({
        key: "poison:" + player.id,
        text: {
          i18n: "easel.mtg.name-has-poison-poison-counters-and",
          args: { name: player.name, poison: player.poison },
        },
      });
  }
  const battlefield = state.cards.filter(
    (card) => card.zone === "battlefield" && !card.facedown,
  );
  for (const card of battlefield) {
    const stats = statsOf(card, presets);
    if (!stats || keywordsOf(card).has("indestructible")) continue;
    if (stats.toughness <= 0)
      checks.push({
        key: "dies:" + card.id,
        text: {
          i18n: "easel.mtg.name-has-toughness-toughness-and-dies",
          args: { name: card.name, toughness: stats.toughness },
        },
        fix: { card: card.id },
      });
    else if ((card.damage || 0) >= stats.toughness)
      checks.push({
        key: "dies:" + card.id,
        text: {
          i18n: "easel.mtg.name-has-lethal-damage-damage-and",
          args: { name: card.name, damage: card.damage },
        },
        fix: { card: card.id },
      });
    else if (card.deathtouched && card.damage > 0)
      checks.push({
        key: "dies:" + card.id,
        text: {
          i18n: "easel.mtg.name-was-dealt-damage-by-deathtouch",
          args: { name: card.name },
        },
        fix: { card: card.id },
      });
  }
  const legends = /* @__PURE__ */ new Map();
  for (const card of battlefield.filter((card2) =>
    isType(card2, "Legendary"),
  )) {
    const key = card.controller + ":" + card.name;
    legends.set(key, [...(legends.get(key) || []), card]);
  }
  for (const [key, cards] of legends)
    if (cards.length > 1) {
      const owner = state.players.find((p) => p.id === cards[0].controller);
      checks.push({
        key: "legend:" + key,
        text: {
          i18n: "easel.mtg.value-controls-length-copies-of-the",
          args: {
            value: owner?.name || { i18n: "easel.mtg.a-player-2" },
            length: cards.length,
            name: cards[0].name,
          },
        },
      });
    }
  for (const card of battlefield.filter((card2) => card2.attacking != null)) {
    const words = keywordsOf(card);
    if (card.enteredTurn === state.turn && !words.has("haste"))
      checks.push({
        key: "sick:" + card.id,
        text: {
          i18n: "easel.mtg.name-is-attacking-without-haste-the",
          args: { name: card.name },
        },
      });
    if (words.has("defender"))
      checks.push({
        key: "defender:" + card.id,
        text: {
          i18n: "easel.mtg.name-has-defender-and-cannot-attack",
          args: { name: card.name },
        },
      });
    const blockers = battlefield.filter((other) => other.blocking === card.id);
    if (words.has("menace") && blockers.length === 1)
      checks.push({
        key: "menace:" + card.id,
        text: {
          i18n: "easel.mtg.name-has-menace-and-must-be",
          args: { name: card.name },
        },
      });
    for (const blocker of blockers) {
      const theirs = keywordsOf(blocker);
      if (words.has("flying") && !theirs.has("flying") && !theirs.has("reach"))
        checks.push({
          key: "flying:" + blocker.id,
          text: {
            i18n: "easel.mtg.name-cannot-block-name2-without-flying",
            args: { name: blocker.name, name2: card.name },
          },
        });
    }
  }
  return checks;
}
function combatPlan(state, presets = []) {
  const battlefield = state.cards.filter((card) => card.zone === "battlefield");
  const words = new Map(battlefield.map((card) => [card.id, keywordsOf(card)]));
  const stats = new Map(
    battlefield.map((card) => [card.id, statsOf(card, presets)]),
  );
  const attackers = battlefield.filter(
    (card) => card.attacking != null && stats.get(card.id),
  );
  const plan = {
    attackers: [],
    players: {},
    lifelink: {},
    cards: {},
    commander: {},
    deathtouched: [],
    deaths: [],
    summary: [],
  };
  const damage = new Map(
    battlefield.map((card) => [card.id, card.damage || 0]),
  );
  const touched = new Set(
    battlefield.filter((card) => card.deathtouched).map((card) => card.id),
  );
  const has = (card, word) => words.get(card.id).has(word);
  const lethal = (card) => {
    const s = stats.get(card.id);
    return (
      !has(card, "indestructible") &&
      (s.toughness <= 0 ||
        damage.get(card.id) >= s.toughness ||
        (touched.has(card.id) && damage.get(card.id) > 0))
    );
  };
  const blockersOf = (attacker) =>
    battlefield
      .filter((card) => card.blocking === attacker.id && stats.get(card.id))
      .sort((a, b) => a.order - b.order);
  const gain = (source, amount) => {
    if (amount > 0 && has(source, "lifelink"))
      plan.lifelink[source.controller] =
        (plan.lifelink[source.controller] || 0) + amount;
  };
  const hitCard = (source, target, amount) => {
    if (amount <= 0) return;
    damage.set(target.id, damage.get(target.id) + amount);
    plan.cards[target.id] = (plan.cards[target.id] || 0) + amount;
    if (has(source, "deathtouch")) touched.add(target.id);
    gain(source, amount);
  };
  const hitPlayer = (source, player, amount) => {
    if (amount <= 0) return;
    plan.players[player] = (plan.players[player] || 0) + amount;
    gain(source, amount);
    if (state.commanderSources?.[source.id]) {
      plan.commander[player] ??= {};
      plan.commander[player][source.id] =
        (plan.commander[player][source.id] || 0) + amount;
    }
  };
  const step = (deals) => {
    const living = new Set(
      battlefield
        .filter((card) => stats.get(card.id) && !lethal(card))
        .map((card) => card.id),
    );
    for (const attacker of attackers) {
      const blockers = blockersOf(attacker);
      if (living.has(attacker.id) && deals(attacker)) {
        let left = stats.get(attacker.id).power;
        const alive = blockers.filter((card) => living.has(card.id));
        if (!blockers.length) hitPlayer(attacker, attacker.attacking, left);
        else if (left > 0) {
          alive.forEach((blocker, index) => {
            const need = has(attacker, "deathtouch")
              ? 1
              : Math.max(
                  0,
                  stats.get(blocker.id).toughness - damage.get(blocker.id),
                );
            const give =
              index === alive.length - 1 && !has(attacker, "trample")
                ? left
                : Math.min(left, need);
            hitCard(attacker, blocker, give);
            left -= give;
          });
          if (has(attacker, "trample") && left > 0)
            hitPlayer(attacker, attacker.attacking, left);
        }
      }
      for (const blocker of blockers)
        if (living.has(blocker.id) && deals(blocker))
          hitCard(blocker, attacker, stats.get(blocker.id).power);
    }
  };
  const early = (card) =>
    has(card, "first strike") || has(card, "double strike");
  if ([...attackers, ...attackers.flatMap(blockersOf)].some(early)) step(early);
  step((card) => !has(card, "first strike") || has(card, "double strike"));
  plan.deathtouched = [...touched].filter((id) => plan.cards[id]);
  plan.deaths = battlefield
    .filter((card) => stats.get(card.id) && plan.cards[card.id] && lethal(card))
    .map((card) => card.id);
  const nameOf = (id) =>
    state.players.find((p) => String(p.id) === String(id))?.name || "a player";
  for (const attacker of attackers)
    plan.attackers.push({
      id: attacker.id,
      name: attacker.name,
      target: attacker.attacking,
      targetName: nameOf(attacker.attacking),
      blockers: blockersOf(attacker).map((card) => ({
        id: card.id,
        name: card.name,
      })),
    });
  for (const [id, amount] of Object.entries(plan.players))
    plan.summary.push({
      i18n: "easel.mtg.value-takes-amount",
      args: { value: nameOf(id), amount },
    });
  for (const [id, amount] of Object.entries(plan.lifelink))
    plan.summary.push({
      i18n: "easel.mtg.value-gains-amount",
      args: { value: nameOf(id), amount },
    });
  for (const id of plan.deaths)
    plan.summary.push({
      i18n: "easel.mtg.name-would-die",
      args: { name: battlefield.find((card) => card.id === id).name },
    });
  return plan;
}
export {
  KEYWORDS,
  combatPlan,
  createRules,
  isType,
  keywordsOf,
  parseCost,
  payCost,
  rulesChecks,
  statsOf,
  typeLine,
};
