import { layout } from "./layout.mjs";

const colors = layout.colors;
const seats = layout.seats;
const clone = (value) => JSON.parse(JSON.stringify(value));
const fail = (message) => {
  const error = new Error(message);
  error.declined = true;
  throw error;
};
const text = (value, limit) =>
  typeof value === "string" ? value.slice(0, limit) : "";
const number = (value, fallback = 0) =>
  Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const lower = (value) => String(value || "").toLowerCase();
const keywords = [
  "Deathtouch",
  "Defender",
  "Double Strike",
  "First Strike",
  "Flying",
  "Haste",
  "Hexproof",
  "Indestructible",
  "Lifelink",
  "Menace",
  "Reach",
  "Trample",
  "Vigilance",
  "Exerted",
  "Frozen",
  "Monstrous",
  "Renowned",
  "Goaded",
  "Phased Out",
];
const ranges = {
  "commander-damage": [0, 21],
  suspend: [0, 99],
  mana: [0, 99],
  loyalty: [0, 99],
  plusxy: [-999, 999],
  counter: [-99, 999],
  text: [-99, 999],
  "player-counter": [0, 99],
  rhystic: [-999, 999],
};
const image = (value) =>
  typeof value === "string" &&
  (/^https?:\/\/[^\s"'<>\\]{4,800}$/.test(value) ||
    /^[a-z0-9-]+\.(jpg|png)$/.test(value))
    ? value
    : "";
export const cardSpec = (spec, depth = 0) => {
  if (!spec || typeof spec !== "object") fail("A card is missing.");
  const card = {
    name: text(spec.name, 200) || "Card",
    type: text(spec.type, 200),
    cmc: clamp(number(spec.cmc), 0, 1000),
    oracle: text(spec.oracle, 3000),
    face: image(spec.face),
  };
  if (spec.power !== undefined) card.power = text(String(spec.power), 8);
  if (spec.toughness !== undefined)
    card.toughness = text(String(spec.toughness), 8);
  if (spec.loyalty !== undefined) card.loyalty = text(String(spec.loyalty), 8);
  if (spec.back) card.back = image(spec.back);
  if (spec.token) card.token = true;
  if (typeof spec.sid === "string" && /^[0-9a-f-]{36}$/.test(spec.sid))
    card.sid = spec.sid;
  if (!depth && spec.dfc) card.dfc = cardSpec(spec.dfc, 1);
  return card;
};
const forward = (rot) => [
  Math.sin((rot * Math.PI) / 180),
  Math.cos((rot * Math.PI) / 180),
];
const inside = (object, area, w, h) =>
  Math.abs(object.x - area.x) <= w / 2 && Math.abs(object.z - area.z) <= h / 2;

export function createRules(host) {
  const now = () => host.now?.() ?? Date.now();
  const fresh = (previous) => {
    const state = {
      version: 1,
      seats: Object.fromEntries(
        colors.map((color) => [
          color,
          previous?.seats?.[color] || { user: "", name: "" },
        ]),
      ),
      players: Object.fromEntries(
        colors.map((color) => [
          color,
          { life: 40, tax: [0, 0], turns: 0, mulligan: 7 },
        ]),
      ),
      hands: Object.fromEntries(colors.map((color) => [color, [[], []]])),
      objects: {},
      order: [],
      turn: { enabled: false, color: "White", started: 0 },
      timersOn: true,
      reveal: {},
      cascade: {},
      log: [],
      next: 1,
    };
    for (const entry of clone(layout.initial)) {
      const object = { ...entry };
      if (object.kind === "card") {
        object.faceDown = false;
        object.owner = "";
        if (object.tracker) object.pressed = 0;
      }
      if (object.kind === "bag") object.locked = true;
      state.objects[object.id] = object;
      state.order.push(object.id);
    }
    return state;
  };

  let state, actor, color;
  const id = () => "o" + state.next++;
  const seatOf = (user) =>
    colors.find((seat) => state.seats[seat].user === user) || "";
  const say = (message, options = {}) => {
    state.log.push({
      t: now(),
      color: options.color ?? color ?? "",
      text: message,
      ...(options.to ? { to: options.to } : {}),
      ...(options.kind ? { kind: options.kind } : {}),
      ...(options.meta ? { meta: options.meta } : {}),
    });
    if (state.log.length > 300) state.log.splice(0, state.log.length - 300);
  };
  const tell = (message) => say(message, { to: color });
  const name = (seat) => state.seats[seat]?.name || seat;
  const object = (key) => state.objects[key] || fail("That object is gone.");
  const holder = (key) =>
    colors.find((seat) => state.hands[seat].some((hand) => hand.includes(key)));
  const unhand = (key) => {
    for (const seat of colors)
      for (const hand of state.hands[seat]) {
        const index = hand.indexOf(key);
        if (index >= 0) hand.splice(index, 1);
      }
  };
  const unorder = (key) => {
    const index = state.order.indexOf(key);
    if (index >= 0) state.order.splice(index, 1);
  };
  const raise = (key) => {
    unorder(key);
    state.order.push(key);
  };
  const remove = (key) => {
    unhand(key);
    unorder(key);
    delete state.objects[key];
  };
  const onTable = (key) => state.order.includes(key);
  const piles = () =>
    state.order
      .map((key) => state.objects[key])
      .filter((item) => item.kind === "card" || item.kind === "deck");
  const pileAt = (x, z, tolerance = 1.1, except = []) =>
    piles()
      .filter(
        (item) =>
          !except.includes(item.id) &&
          Math.abs(item.x - x) <= tolerance &&
          Math.abs(item.z - z) <= tolerance * 1.4,
      )
      .pop();
  const cardsOf = (item) =>
    item.kind === "deck"
      ? item.cards
      : [
          {
            id: item.id,
            card: item.card,
            transformed: item.transformed,
            counters: item.counters,
            keywords: item.keywords,
            pt: item.pt,
            owner: item.owner,
          },
        ];
  const strip = (entry) => {
    const card = { id: entry.id, card: entry.card };
    for (const key of ["transformed", "owner"])
      if (entry[key]) card[key] = entry[key];
    return card;
  };
  const makeCard = (entry, x, z, rot, faceDown) => ({
    id: entry.id || id(),
    kind: "card",
    x,
    z,
    rot,
    faceDown,
    card: entry.card,
    owner: entry.owner || "",
    ...(entry.transformed ? { transformed: true } : {}),
  });
  const place = (entries, x, z, rot, faceDown, options = {}) => {
    if (!entries.length) return null;
    const target = options.fresh ? null : pileAt(x, z, 1.1, options.except);
    if (target) {
      if (target.kind === "card") {
        const below = strip(target);
        target.kind = "deck";
        target.cards = [below];
        target.name = "";
        delete target.card;
        delete target.counters;
        delete target.keywords;
        delete target.pt;
        delete target.transformed;
        delete target.owner;
        delete target.highlight;
      }
      const added = entries.map(strip);
      if (options.bottom) target.cards.push(...added);
      else target.cards.unshift(...added.reverse());
      raise(target.id);
      return target;
    }
    let made;
    if (entries.length === 1) made = makeCard(entries[0], x, z, rot, faceDown);
    else
      made = {
        id: id(),
        kind: "deck",
        x,
        z,
        rot,
        faceDown,
        name: options.name || "",
        cards: entries.map(strip),
      };
    state.objects[made.id] = made;
    state.order.push(made.id);
    return made;
  };
  const settle = (deck) => {
    if (deck.kind !== "deck") return;
    if (deck.cards.length === 0) remove(deck.id);
    else if (deck.cards.length === 1) {
      const only = deck.cards[0];
      const card = makeCard(only, deck.x, deck.z, deck.rot, deck.faceDown);
      const order = state.order.indexOf(deck.id);
      delete state.objects[deck.id];
      state.objects[card.id] = card;
      if (order >= 0) state.order[order] = card.id;
    }
  };
  const takeTop = (pile, count = 1) => {
    if (pile.kind === "card") {
      unorder(pile.id);
      delete state.objects[pile.id];
      return [strip(pile)];
    }
    const taken = pile.cards.splice(0, count);
    settle(pile);
    return taken;
  };
  const toHand = (seat, entries, index = 0, at) => {
    const hand = state.hands[seat][index];
    const made = entries.map((entry) => {
      const card = makeCard(entry, 0, 0, seats[seat].base, false);
      state.objects[card.id] = card;
      return card.id;
    });
    hand.splice(at === undefined ? hand.length : clamp(at, 0, hand.length), 0, ...made);
    return made;
  };
  const shuffle = (list) => {
    for (let index = list.length - 1; index > 0; index--) {
      const swap = host.random(0, index + 1);
      [list[index], list[swap]] = [list[swap], list[index]];
    }
    return list;
  };
  const libraryPile = (seat) => {
    const zone = seats[seat].library;
    return piles()
      .filter((item) => inside(item, zone, 3.2, 4.4))
      .pop();
  };
  const library = (seat) => {
    const pile = libraryPile(seat);
    if (!pile) fail("No deck found in your library zone.");
    return pile;
  };
  const libraryDeck = (seat) => {
    const pile = libraryPile(seat);
    if (!pile || pile.kind !== "deck")
      fail("No deck found in your library zone.");
    return pile;
  };
  const offset = (seat, along, across) => {
    const { library: zone, forward: f, right: r } = seats[seat];
    return [
      zone.x + f[0] * along + r[0] * across,
      zone.z + f[1] * along + r[1] * across,
    ];
  };
  const uprightRot = (seat) => (seats[seat].library.rot + 180) % 360;
  const cmc = (card) =>
    /Land/.test(card.type || "") && !card.cmc ? -1 : number(card.cmc);
  const visible = (item) =>
    item.transformed && item.card.dfc ? item.card.dfc : item.card;
  const toGraveyard = (seat, entries) => {
    const [x, z] = offset(seat, -3.6, 0);
    return place(entries, x, z, uprightRot(seat), false);
  };
  const toExile = (seat, entries) => {
    const [x, z] = offset(seat, 3.17, 0);
    return place(entries, x, z, (seats[seat].library.rot + 270) % 360, false);
  };
  const toBottom = (seat, entries) => {
    shuffle(entries);
    const pile = libraryPile(seat);
    if (pile?.kind === "card") {
      const top = strip(pile);
      const { x, z, rot } = pile;
      remove(pile.id);
      place([top, ...entries], x, z, rot, true, { fresh: true });
    } else if (pile) place(entries, pile.x, pile.z, pile.rot, true, { bottom: true });
    else {
      const zone = seats[seat].library;
      place(entries, zone.x, zone.z, zone.rot, true, { fresh: true });
    }
  };
  const gather = (ids) => {
    const entries = [];
    for (const key of ids) {
      const item = object(key);
      if (item.kind !== "card" && item.kind !== "deck") continue;
      const owner = holder(key);
      if (owner && owner !== color) fail("That card is in another hand.");
      entries.push(...cardsOf(item).map(strip));
      remove(key);
    }
    return entries;
  };
  const requireSeat = () => {
    if (!color) fail("Take a seat first.");
  };
  const requireTurnOwner = (seat) => {
    if (seat !== color) fail("Only " + seat + " can use these controls.");
  };

  const skipped = (seat) =>
    Object.values(state.objects).some(
      (item) =>
        item.kind === "token" &&
        item.template === "skipper" &&
        item.faceDown &&
        item.color === seat &&
        onTable(item.id),
    );
  const seated = (seat) => !!state.seats[seat].user;
  const active = (seat) => seated(seat) && !skipped(seat);
  const startTurn = (seat) => {
    for (let guard = 0; guard < colors.length; guard++) {
      state.turn = { enabled: true, color: seat, started: now() };
      if (!skipped(seat)) break;
      say("Skipping " + name(seat) + "'s turn.", { color: seat });
      seat = nextSeat(seat);
    }
    state.players[seat].turns++;
    for (const item of Object.values(state.objects))
      if (item.highlight?.turn) delete item.highlight;
  };
  const nextSeat = (seat) => {
    const index = colors.indexOf(seat);
    for (let step = 1; step <= colors.length; step++) {
      const candidate = colors[(index + step) % colors.length];
      if (seated(candidate)) return candidate;
    }
    return seat;
  };

  const lifeChange = (seat, before) => {
    const player = state.players[seat];
    if (player.life === before) return;
    const last = state.log[state.log.length - 1];
    const meta =
      last?.meta?.kind === "life" &&
      last.meta.seat === seat &&
      now() - last.t < 3000
        ? last.meta
        : { kind: "life", seat, start: before };
    const difference = player.life - meta.start;
    const message =
      seat +
      (difference === 0
        ? " life unchanged"
        : (difference > 0 ? " gained " : " lost ") +
          Math.abs(difference) +
          " life") +
      " |" +
      player.life +
      "|";
    if (last?.meta === meta) {
      last.text = message;
      last.t = now();
    } else say(message, { color: seat, meta });
  };

  const revealNext = (seat, mode) => {
    const pile = library(seat);
    const record = state.reveal[seat];
    let count =
      record && record.mode === mode && now() - record.t <= 10000
        ? record.n
        : 0;
    const [entry] = takeTop(pile);
    let x, z;
    if (mode === "fan") {
      const up = Math.floor(count / 12),
        side = count - up * 12;
      [x, z] = offset(seat, 18 + 3.1 * up, -2.25 * side);
      const card = place([entry], x, z, uprightRot(seat), false, {
        fresh: true,
      });
      card.highlight = { color: seat, until: now() + 10000 };
    } else {
      [x, z] = offset(seat, 0, -2.4);
      place([entry], x, z, uprightRot(seat), false);
    }
    count++;
    state.reveal[seat] = { mode, n: count, t: now() };
    say(count + ": " + entry.card.name + (entry.card.type ? " | " + entry.card.type : ""), {
      color: seat,
    });
  };

  const seatButton = (seat, button, count) => {
    requireTurnOwner(seat);
    const repeat = clamp(Math.floor(count), 1, 99);
    const available = () => {
      const pile = libraryPile(seat);
      return pile ? cardsOf(pile).length : 0;
    };
    const total = Math.min(repeat, available());
    if (button === "untap") return untap(seat);
    if (!total) fail("No deck found in your library zone.");
    const plural = total > 1 ? " cards" : " card";
    if (button === "draw") {
      for (let index = 0; index < total; index++)
        toHand(seat, takeTop(library(seat)), 0);
      if (repeat > 1) tell("drawing " + total + plural);
    } else if (button === "scry") {
      for (let index = 0; index < total; index++)
        toHand(seat, takeTop(library(seat)), 1);
      if (repeat > 1) tell("scrying " + total + plural);
    } else if (button === "mill") {
      for (let index = 0; index < total; index++)
        toGraveyard(seat, takeTop(library(seat)));
      if (repeat > 1) tell("milling " + total + plural);
    } else if (button === "fan" || button === "stack") {
      if (repeat > 1) tell("revealing " + total + plural);
      for (let index = 0; index < total; index++) revealNext(seat, button);
    } else fail("Unknown table button.");
  };

  const untap = (seat) => {
    const mat = seats[seat].playmat;
    const flashes = [];
    for (const key of state.order) {
      const item = state.objects[key];
      if (item.kind !== "card" && item.kind !== "deck") continue;
      if (!inside(item, mat, mat.w, mat.h)) continue;
      let untaps = true;
      if (item.kind === "card") {
        if (item.keywords?.includes("Frozen")) untaps = false;
        if (item.counters?.stun > 0) {
          item.counters.stun--;
          untaps = false;
        }
        if (item.keywords?.includes("Exerted")) {
          item.keywords = item.keywords.filter((word) => word !== "Exerted");
          untaps = false;
        }
        const face = visible(item);
        const named = lower(face.name);
        if (/mana vault|basalt monolith|grim monolith/.test(named))
          untaps = false;
        if (lower(face.oracle).includes("doesn't untap during your untap step"))
          untaps = false;
        if (/battle/i.test(face.type || "")) untaps = false;
      }
      if (untaps) item.rot = mat.rot;
      else if (item.kind === "card") flashes.push(item.id);
    }
    for (const key of flashes)
      state.objects[key].highlight = { color: seat, until: now() + 1500 };
  };

  const mulligan = (seat, unfriendly, force) => {
    requireTurnOwner(seat);
    const mat = seats[seat].playmat;
    const occupied = piles().some((item) => inside(item, mat, mat.w, mat.h));
    if (occupied && !force)
      return {
        confirm:
          "Cards detected in the play area = accidental mulligan press in the middle of a game?\nIf you still wish to mulligan, double click the button.",
      };
    const deck = libraryPile(seat);
    if (!deck || deck.kind !== "deck") fail("No deck found in your library zone.");
    const player = state.players[seat];
    player.mulligan = unfriendly ? Math.max(1, player.mulligan - 1) : 7;
    const hand = state.hands[seat][0].splice(0);
    for (const key of hand) {
      deck.cards.unshift(strip(state.objects[key]));
      delete state.objects[key];
    }
    shuffle(deck.cards);
    const count = Math.min(player.mulligan, deck.cards.length);
    toHand(seat, deck.cards.splice(0, count), 0);
    settle(deck);
    say(seat + " mulliganed to " + count + ".", { color: seat });
  };

  const beginSearch = (seat, mode, value, types, repeat) => {
    if (state.cascade[seat]?.hit && state.objects[state.cascade[seat].hit])
      fail(
        mode === "cascade"
          ? "You need to decline (✗) or accept (✓) the previous cascade before cascading again."
          : "You need to decline (✗) or accept (✓) the previous card.",
      );
    const deck = libraryPile(seat);
    if (!deck) fail("No deck found in your library zone.");
    const cards = cardsOf(deck);
    const match = (entry) =>
      mode === "cascade"
        ? cmc(entry.card) !== -1 && cmc(entry.card) <= value
        : types.some((type) =>
            lower(entry.card.name + " " + entry.card.type).includes(lower(type)),
          );
    const found = cards.findIndex(match);
    if (found < 0) {
      delete state.cascade[seat];
      tell(
        mode === "cascade"
          ? "No valid cards found, skipping the cascade procedure.\n(maybe you entered 0 when you have no 0CMC spells left?)"
          : "No valid cards found, skipping the procedure",
      );
      return;
    }
    const progress = state.cascade[seat]?.repeat
      ? state.cascade[seat].done + 1 + "/" + state.cascade[seat].repeat + " "
      : "";
    tell(
      progress +
        (mode === "cascade"
          ? "cascading for CMC=" + value
          : "revealing cards until type: " + types.join("/")),
    );
    const revealed = takeTop(deck, found + 1);
    const hitEntry = revealed.pop();
    let pile = null;
    if (revealed.length) {
      const [x, z] = offset(seat, 0, -2.5);
      pile = place(revealed, x, z, uprightRot(seat), false, { fresh: true });
    }
    const [x, z] = offset(seat, 0, -5);
    const hit = place([hitEntry], x, z, uprightRot(seat), false, {
      fresh: true,
    });
    hit.highlight = { color: seat, until: now() + 10000 };
    hit.prompt = seat;
    state.cascade[seat] = {
      ...(state.cascade[seat] || { repeat: repeat > 1 ? repeat : 0, done: 0 }),
      mode,
      value,
      types,
      hit: hit.id,
      pile: pile?.id || "",
    };
  };
  const resolveSearch = (seat, accept) => {
    const record = state.cascade[seat];
    if (!record?.hit || !state.objects[record.hit]) fail("There is nothing to resolve.");
    const hit = state.objects[record.hit];
    delete hit.prompt;
    const rest = [];
    if (record.pile && state.objects[record.pile])
      rest.push(...gather([record.pile]));
    if (!accept) rest.push(...gather([hit.id]));
    if (rest.length) toBottom(seat, rest);
    record.done++;
    record.hit = "";
    if (record.repeat && record.done < record.repeat)
      beginSearch(seat, record.mode, record.value, record.types, record.repeat);
    else delete state.cascade[seat];
  };

  const getBasic = (seat, land) => {
    const deck = libraryDeck(seat);
    const index = deck.cards.findIndex((entry) => {
      const words = lower(entry.card.name + " " + entry.card.type).replace(/[^\w\s]/g, "");
      return words.includes("basic") && words.includes("land") && words.includes(lower(land));
    });
    if (index < 0) fail("No basic " + land + " found in your library.");
    const [entry] = deck.cards.splice(index, 1);
    const [x, z] = offset(seat, 0, -2.4);
    place([entry], x, z, uprightRot(seat), false, { fresh: true });
    shuffle(deck.cards);
    settle(deck);
  };

  const spawnObject = (item) => {
    item.id = id();
    state.objects[item.id] = item;
    state.order.push(item.id);
    return item;
  };
  const fromBag = (bag, x, z) => {
    const base = { x, z, rot: seats[color]?.base ?? 0 };
    switch (bag.template) {
      case "commander-damage":
        return spawnObject({ ...base, kind: "counter", template: "commander-damage", tint: bag.color, value: 0 });
      case "die":
        return spawnObject({ ...base, kind: "die", template: "die", sides: bag.sides, value: bag.sides });
      case "keyword":
        return spawnObject({ ...base, kind: "token", template: "keyword", keyword: bag.keyword });
      case "status":
        return spawnObject({ ...base, kind: "token", template: "status", status: bag.status });
      case "suspend":
      case "loyalty":
      case "counter":
        return spawnObject({ ...base, kind: "counter", template: bag.template, value: 0 });
      case "mana":
        return spawnObject({ ...base, kind: "counter", template: "mana", mana: bag.mana, value: 0 });
      case "plusxy":
        return spawnObject({ ...base, kind: "counter", template: "plusxy", value: 1, value2: 1 });
      case "text":
        return spawnObject({ ...base, kind: "counter", template: "text", value: 0, text: "Text" });
      case "notecard":
        return spawnObject({ ...base, kind: "note", template: "notecard", text: "" });
      case "drop-counter":
        return spawnObject({ ...base, kind: "token", template: "drop-counter" });
      case "player-counter":
        return spawnObject({ ...base, kind: "counter", template: "player-counter", counter: bag.counter, value: 0 });
      case "rhystic":
        return spawnObject({ ...base, kind: "counter", template: "rhystic", value: 1, tint: color });
      case "skipper":
        return spawnObject({ ...base, kind: "token", template: "skipper", color, faceDown: false });
      case "krark":
        return spawnObject({ ...base, kind: "tile", template: "krark", thumb: false, count: 1 });
      default:
        fail("Nothing can be taken from that.");
    }
  };

  const flipCoins = (tile, mode, count) => {
    let line = "",
      successes = 0,
      failures = 0;
    const flip = () => {
      if (tile.thumb) {
        const a = host.random(1, 3),
          b = host.random(1, 3);
        line += "[" + (a === 2 ? "✓" : "✗") + (b === 2 ? "✓" : "✗") + "]";
        return a === 2 || b === 2;
      }
      const coin = host.random(1, 3) === 2;
      line += coin ? "✓" : "✗";
      return coin;
    };
    const record = (success) => (success ? successes++ : failures++);
    if (mode === "one") record(flip());
    else if (mode === "x") {
      for (let index = 0; index < clamp(Math.floor(count), 1, 100); index++)
        record(flip());
    } else if (mode === "fail") {
      for (let guard = 0; guard < 200; guard++) {
        const success = flip();
        record(success);
        if (!success) break;
      }
    } else if (mode === "success") {
      for (let guard = 0; guard < 200; guard++) {
        const success = flip();
        record(success);
        if (success) break;
      }
    } else fail("Unknown coin flip.");
    say(line + "\nSuccesses: " + successes + " | Fails: " + failures, {
      color: "",
    });
  };

  const lifeCommands = (message) => {
    const normalized = lower(message).replace(/ /g, "_");
    const match = normalized.match(
      /(extort|drain|opponents_lose|everyone_loses|double_my_life|reset_life|set_life)_(-?\d+)/,
    );
    if (!match) return false;
    const command = match[1],
      amount = Number(match[2]);
    const sayers = {
      extort: "extorted everyone for",
      drain: "drained everyone for",
      opponents_lose: "opponents lost",
      everyone_loses: "made everyone lose",
      double_my_life: "doubled their life this many times:",
      reset_life: "reset life totals to",
      set_life: "",
    };
    if (command !== "set_life" && command !== "reset_life" && !active(color)) {
      tell("You have a Turn Skipper active!");
      return true;
    }
    const players = state.players;
    let extorted = 0;
    for (const seat of colors) {
      if (command === "reset_life") {
        players[seat].life = amount;
        players[seat].turns = 0;
        if (amount === 40) players[seat].tax = [0, 0];
        continue;
      }
      const mine = seat === color;
      if (!mine && !active(seat)) continue;
      const before = players[seat].life;
      if (command === "extort" && !mine) {
        players[seat].life -= amount;
        extorted += amount;
      } else if (command === "drain")
        players[seat].life += mine ? amount : -amount;
      else if (command === "opponents_lose" && !mine)
        players[seat].life -= amount;
      else if (command === "everyone_loses") players[seat].life -= amount;
      else if (command === "double_my_life" && mine)
        players[seat].life *= 2 ** clamp(amount, 0, 10);
      else if (command === "set_life" && mine) {
        sayers.set_life =
          "life total changed by " +
          Math.abs(amount - before) +
          ". Setting it to";
        players[seat].life = amount;
      }
      if (players[seat].life !== before) lifeChange(seat, before);
    }
    if (command === "extort") {
      const before = players[color].life;
      players[color].life += extorted;
      lifeChange(color, before);
    }
    say(color + " " + sayers[command] + " " + amount, { color });
    return true;
  };

  const chat = (raw, user) => {
    const message = text(raw, 2000).trim();
    if (!message) fail("A message must contain 1..2000 characters.");
    const bare = lower(message).replace(/[^\w\s]/g, "");
    if (color && lifeCommands(message)) return;
    say(message, { color, kind: "chat", meta: { name: host.name(user) } });
    if (!color) return;
    if (bare === "my turn" || bare === "no my turn") startTurn(color);
    const turn = bare.match(/your turn (\w+)/);
    if (turn) {
      const seat = colors.find((candidate) => lower(candidate) === turn[1]);
      if (seat && seated(seat)) startTurn(seat);
    }
    if (bare === "timers on") state.timersOn = true;
    if (bare === "timers off") state.timersOn = false;
  };

  const actions = {
    sit({ seat }) {
      if (!colors.includes(seat)) fail("Choose a seat color.");
      if (state.seats[seat].user && state.seats[seat].user !== actor)
        fail(seat + " is taken.");
      if (color) state.seats[color] = { user: "", name: "" };
      state.seats[seat] = { user: actor, name: host.name(actor) };
      say(host.name(actor) + " sat at " + seat + ".", { color: seat });
    },
    stand() {
      requireSeat();
      say(name(color) + " left " + color + ".", { color });
      state.seats[color] = { user: "", name: "" };
    },
    move({ moves, onto, toHand: handTarget, toBag }) {
      requireSeat();
      if (!Array.isArray(moves) || !moves.length || moves.length > 200)
        fail("Choose objects to move.");
      const items = moves.map((move) => {
        const item = object(String(move.id));
        if (item.locked) fail("That object is locked.");
        const owner = holder(item.id);
        if (owner && owner !== color) fail("That card is in another hand.");
        return { item, move, owner };
      });
      if (toBag) {
        const bag = object(String(toBag));
        if (bag.kind !== "bag") fail("That is not a bag.");
        for (const { item } of items)
          if (item.kind !== "card" && item.kind !== "deck") remove(item.id);
        return;
      }
      if (handTarget) {
        const index = handTarget.index === 1 ? 1 : 0;
        let at = number(handTarget.at, undefined);
        for (const { item } of items) {
          if (item.kind !== "card" && item.kind !== "deck") continue;
          const entries = cardsOf(item).map(strip);
          const previous = state.hands[color][index].indexOf(item.id);
          if (previous >= 0 && at !== undefined && previous < at) at--;
          remove(item.id);
          const made = toHand(color, entries, index, at);
          if (at !== undefined) at += made.length;
        }
        return;
      }
      if (onto) {
        const target = object(String(onto));
        if (target.kind === "card" || target.kind === "deck") {
          if (!onTable(target.id)) fail("That pile is not on the table.");
          for (const { item } of items) {
            if (item.id === target.id) continue;
            if (item.kind === "card" || item.kind === "deck") {
              const entries = cardsOf(item).map(strip);
              remove(item.id);
              place(entries, target.x, target.z, target.rot, target.faceDown);
            } else if (item.template === "drop-counter" && target.kind === "card") {
              target.counters = { ...(target.counters || {}), counter: target.counters?.counter ?? 0 };
              remove(item.id);
            }
          }
          return;
        }
      }
      for (const { item, move, owner } of items) {
        const x = clamp(number(move.x, item.x), layout.world.x0, layout.world.x1);
        const z = clamp(number(move.z, item.z), layout.world.z0, layout.world.z1);
        if (owner) {
          unhand(item.id);
          Object.assign(item, { x, z, rot: seats[color].base, faceDown: false });
          state.order.push(item.id);
        } else {
          Object.assign(item, { x, z });
          if (move.rot !== undefined) item.rot = ((Math.round(number(move.rot)) % 360) + 360) % 360;
          raise(item.id);
        }
        if (item.template === "skipper") {
          item.color = color;
          for (const seat of colors)
            if (inside(item, seats[seat].playmat, seats[seat].playmat.w, seats[seat].playmat.h))
              item.color = seat;
        }
        if (item.template === "rhystic") {
          item.tint = color;
          say("Did You Pay " + item.value + "?", { color });
        }
      }
    },
    take({ id: key, x, z, toHand: handTarget, count, onto }) {
      requireSeat();
      const pile = object(String(key));
      if (!onTable(pile.id) || pile.kind !== "deck") fail("Take cards from a deck.");
      const entries = takeTop(pile, clamp(Math.floor(number(count, 1)), 1, 200));
      const target = onto && state.objects[onto];
      if (handTarget) toHand(color, entries, handTarget.index === 1 ? 1 : 0, number(handTarget.at, undefined));
      else if (target && onTable(target.id) && (target.kind === "card" || target.kind === "deck"))
        place(entries, target.x, target.z, target.rot, target.faceDown);
      else
        place(entries, number(x, pile.x), number(z, pile.z), pile.rot, pile.faceDown, { fresh: true });
    },
    deal({ id: key, count, seat }) {
      requireSeat();
      const pile = object(String(key));
      if (!onTable(pile.id)) fail("Deal from a deck on the table.");
      const target = colors.includes(seat) && seated(seat) ? seat : color;
      const total = clamp(Math.floor(number(count, 1)), 1, 200);
      for (let index = 0; index < total && state.objects[pile.id]; index++)
        toHand(target, takeTop(state.objects[pile.id]), 0);
    },
    flip({ ids }) {
      requireSeat();
      for (const key of ids || []) {
        const item = object(String(key));
        if (holder(item.id) || item.locked) continue;
        if (item.kind === "deck") {
          item.cards.reverse();
          item.faceDown = !item.faceDown;
        } else if (item.kind === "card" || item.template === "skipper")
          item.faceDown = !item.faceDown;
        raise(item.id);
      }
    },
    transform({ id: key }) {
      requireSeat();
      const item = object(String(key));
      if (item.kind !== "card" || !item.card.dfc) fail("That card has only one face.");
      item.transformed = !item.transformed;
    },
    rotate({ ids, by }) {
      requireSeat();
      const amount = number(by, 90);
      for (const key of ids || []) {
        const item = object(String(key));
        if (holder(item.id) || item.locked) continue;
        item.rot = (((item.rot + amount) % 360) + 360) % 360;
      }
    },
    group({ ids }) {
      requireSeat();
      const items = (ids || []).map((key) => object(String(key))).filter(
        (item) => (item.kind === "card" || item.kind === "deck") && onTable(item.id),
      );
      if (items.length < 2) return;
      const [first] = items;
      const { x, z, rot, faceDown } = first;
      const entries = gather(items.map((item) => item.id));
      place(entries, x, z, rot, faceDown, { fresh: true });
    },
    shuffle({ id: key }) {
      requireSeat();
      const pile = object(String(key));
      if (pile.kind !== "deck") return;
      shuffle(pile.cards);
      say(color + " shuffled " + (pile.name || "a deck") + ".", { color });
    },
    search({ id: key }) {
      requireSeat();
      const pile = object(String(key));
      if (pile.kind !== "deck" || !onTable(pile.id)) fail("Search a deck on the table.");
      say(name(color) + " is searching " + (pile.name || "a deck") + ".", { color });
      return { search: { id: pile.id, cards: pile.cards.map((entry) => ({ id: entry.id, ...visibleEntry(entry) })) } };
    },
    pick({ id: key, card, x, z, toHand: handTarget }) {
      requireSeat();
      const pile = object(String(key));
      if (pile.kind !== "deck") fail("That deck is gone.");
      const index = pile.cards.findIndex((entry) => entry.id === card);
      if (index < 0) fail("That card is no longer in the deck.");
      const [entry] = pile.cards.splice(index, 1);
      settle(pile);
      if (handTarget) toHand(color, [entry], handTarget.index === 1 ? 1 : 0);
      else {
        const [px, pz] = [number(x, pile.x + 2.5), number(z, pile.z)];
        place([entry], px, pz, uprightRot(color), false, { fresh: true });
      }
      const fresh = state.objects[pile.id];
      if (fresh?.kind === "deck") return { search: { id: fresh.id, cards: fresh.cards.map((item) => ({ id: item.id, ...visibleEntry(item) })) } };
      return { search: null };
    },
    remove({ ids }) {
      requireSeat();
      for (const key of ids || []) {
        const item = object(String(key));
        if (item.locked) continue;
        const owner = holder(item.id);
        if (owner && owner !== color) continue;
        remove(item.id);
      }
    },
    spawn({ cards, at, deck, name: title, faceDown }) {
      requireSeat();
      if (!Array.isArray(cards) || !cards.length || cards.length > 250)
        fail("Spawn between 1 and 250 cards.");
      const specs = cards.map((spec) => ({ id: id(), card: cardSpec(spec), owner: color }));
      let x, z, rot;
      if (at && typeof at === "object") {
        x = clamp(number(at.x), layout.world.x0, layout.world.x1);
        z = clamp(number(at.z), layout.world.z0, layout.world.z1);
        rot = uprightRot(color);
      } else {
        const spot = seats[color].spawn[at === "part" ? "part" : "main"];
        ({ x, z, rot } = spot);
      }
      if (deck) {
        place(specs, x, z, rot, !!faceDown, { fresh: true, name: text(title, 100) });
      } else
        specs.forEach((spec, index) => {
          const [, fz] = forward(rot);
          place([spec], clamp(x - fz * index * 2.4, layout.world.x0, layout.world.x1), z, rot, !!faceDown, { fresh: true });
        });
    },
    import({ name: title, main, commander, sideboard }) {
      requireSeat();
      const list = (items) =>
        (Array.isArray(items) ? items : []).slice(0, 250).map((spec) => ({ id: id(), card: cardSpec(spec), owner: color }));
      const library = list(main),
        commanders = list(commander),
        side = list(sideboard);
      if (!library.length && !commanders.length) fail("The deck list is empty.");
      const seat = seats[color];
      if (library.length) {
        shuffle(library);
        const occupied = libraryPile(color);
        if (occupied) {
          const { x, z, rot } = seat.spawn.main;
          place(library, x, z, rot, true, { fresh: true, name: text(title, 100) });
        } else
          place(library, seat.library.x, seat.library.z, seat.library.rot, true, { fresh: true, name: text(title, 100) });
      }
      commanders.forEach((entry, index) => {
        const zone = seat.commander[index] || seat.commander[0];
        place([entry], zone.x, zone.z, uprightRot(color), false, { fresh: true });
      });
      if (side.length) {
        const { x, z, rot } = seat.spawn.part;
        place(side, x, z, rot, true, { fresh: true, name: "Sideboard" });
      }
      say(name(color) + " imported " + (text(title, 100) || "a deck") + ".", { color });
    },
    button({ button, count, seat }) {
      requireSeat();
      return seatButton(colors.includes(seat) ? seat : color, String(button), number(count, 1));
    },
    mulligan({ unfriendly, force }) {
      requireSeat();
      return mulligan(color, !!unfriendly, !!force);
    },
    keybind({ index, ids, hover }) {
      requireSeat();
      const key = Math.floor(number(index));
      const selection = (ids || []).map(String).filter((item) => state.objects[item]);
      const chosen = selection.length ? selection : hover && state.objects[hover] ? [String(hover)] : [];
      const names = {
        1: "untap", 2: "draw", 3: "scry", 4: "mill", 5: "revealFan", 6: "revealStack",
        7: "move to graveyard", 8: "move to exile", 9: "move to bottom of library", 0: "end turn",
      };
      tell("keybind " + key + ": " + (key === 0 && !state.turn.enabled ? "enable turns" : names[key]));
      if (key === 0) {
        if (!state.turn.enabled) startTurn(color);
        else if (state.turn.color === color) startTurn(nextSeat(color));
        return;
      }
      if (key >= 1 && key <= 4)
        return seatButton(color, ["", "untap", "draw", "scry", "mill"][key], 1);
      if (key === 5 || key === 6) return seatButton(color, key === 5 ? "fan" : "stack", 1);
      const entries = gather(chosen);
      if (!entries.length) return;
      if (key === 7) toGraveyard(color, entries);
      if (key === 8) toExile(color, entries);
      if (key === 9) toBottom(color, entries);
    },
    graveyard({ ids }) {
      requireSeat();
      toGraveyard(color, gather((ids || []).map(String)));
    },
    exile({ ids }) {
      requireSeat();
      toExile(color, gather((ids || []).map(String)));
    },
    bottom({ ids }) {
      requireSeat();
      toBottom(color, gather((ids || []).map(String)));
    },
    cascade({ cmc: value, repeat }) {
      requireSeat();
      const amount = Math.floor(number(value, -1));
      if (amount < 0) fail("you entered a strange value");
      state.cascade[color] = { repeat: clamp(Math.floor(number(repeat, 0)), 0, 20), done: 0 };
      if (state.cascade[color].repeat <= 1) state.cascade[color].repeat = 0;
      beginSearch(color, "cascade", amount, [], state.cascade[color].repeat);
    },
    cascadeCard({ id: key }) {
      requireSeat();
      const card = object(String(key));
      const mat = seats[color].playmat;
      if (card.kind !== "card" || !inside(card, mat, mat.w, mat.h)) fail("Cascade from a card in your play area.");
      const value = cmc(visible(card)) - 1;
      if (value < 0) fail("That card has no CMC to cascade from.");
      state.cascade[color] = { repeat: 0, done: 0 };
      beginSearch(color, "cascade", value, [], 0);
    },
    revealUntil({ types, repeat }) {
      requireSeat();
      const list = (Array.isArray(types) ? types : []).map((type) => text(type, 40).trim()).filter(Boolean).slice(0, 10);
      if (!list.length) fail("you did not select any card-types to look for");
      state.cascade[color] = { repeat: clamp(Math.floor(number(repeat, 0)), 0, 20), done: 0 };
      if (state.cascade[color].repeat <= 1) state.cascade[color].repeat = 0;
      beginSearch(color, "type", 0, list, state.cascade[color].repeat);
    },
    resolve({ accept }) {
      requireSeat();
      resolveSearch(color, !!accept);
    },
    basic({ land }) {
      requireSeat();
      const lands = ["Plains", "Island", "Swamp", "Mountain", "Forest"];
      if (!lands.includes(land)) fail("Choose a basic land type.");
      getBasic(color, land);
    },
    tokenCopy({ id: key, exact }) {
      requireSeat();
      const card = object(String(key));
      if (card.kind !== "card" || !onTable(card.id)) fail("Copy a card on the table.");
      const [fx, fz] = forward(card.rot);
      const copy = clone(card);
      copy.id = id();
      copy.x = clamp(card.x - fx * 3.2, layout.world.x0, layout.world.x1);
      copy.z = clamp(card.z - fz * 3.2, layout.world.z0, layout.world.z1);
      delete copy.highlight;
      delete copy.prompt;
      if (!exact) copy.token = true;
      state.objects[copy.id] = copy;
      state.order.push(copy.id);
    },
    sortHand() {
      requireSeat();
      const hand = state.hands[color][0];
      const values = hand.map((key) => cmc(state.objects[key].card));
      const order = hand.map((key, index) => [key, values[index]]).sort((a, b) => a[1] - b[1]);
      state.hands[color][0] = order.map(([key]) => key);
    },
    randomDiscard() {
      requireSeat();
      const hand = state.hands[color][0];
      if (!hand.length) fail("Your hand is empty.");
      const key = hand[host.random(0, hand.length)];
      const card = state.objects[key];
      say(color + " randomly discarded " + card.card.name + ".", { color });
      toGraveyard(color, gather([key]));
    },
    card({ id: key, plus, counter, pt, keyword, stun }) {
      requireSeat();
      const card = object(String(key));
      if (card.kind !== "card") fail("Choose a card.");
      card.counters = { ...(card.counters || {}) };
      if (plus !== undefined) {
        if (plus === null) delete card.counters.plus;
        else card.counters.plus = clamp(Math.round(number(plus)), -999, 999);
      }
      if (counter !== undefined) {
        if (counter === null) delete card.counters.counter;
        else card.counters.counter = clamp(Math.round(number(counter)), -999, 999);
      }
      if (stun !== undefined) {
        if (!stun) delete card.counters.stun;
        else card.counters.stun = clamp(Math.round(number(stun)), 0, 99);
      }
      if (pt !== undefined) {
        if (pt === null) delete card.pt;
        else card.pt = [clamp(Math.round(number(pt[0])), -999, 999), clamp(Math.round(number(pt[1])), -999, 999)];
      }
      if (keyword !== undefined) {
        if (!keywords.includes(keyword)) fail("Unknown keyword.");
        const list = new Set(card.keywords || []);
        if (list.has(keyword)) list.delete(keyword);
        else list.add(keyword);
        card.keywords = [...list];
      }
    },
    counter({ id: key, delta, set, field }) {
      requireSeat();
      const item = object(String(key));
      const property = field === "value2" ? "value2" : "value";
      if (item.kind !== "counter") fail("That is not a counter.");
      const [min, max] = ranges[item.template] || [-999, 999];
      const value = set !== undefined ? number(set) : item[property] + number(delta);
      item[property] = clamp(Math.round(value), min, max);
    },
    text({ id: key, value }) {
      requireSeat();
      const item = object(String(key));
      if (item.kind !== "note" && item.template !== "text") fail("That object has no text.");
      item.text = text(value, item.kind === "note" ? 1000 : 60);
    },
    life({ seat, delta, set }) {
      requireSeat();
      if (!colors.includes(seat)) fail("Choose a seat.");
      const player = state.players[seat];
      const before = player.life;
      if (set !== undefined) player.life = clamp(Math.round(number(set)), -9999, 9999);
      else player.life = clamp(player.life + Math.round(number(delta)), -9999, 9999);
      lifeChange(seat, before);
    },
    resetLife({ seat }) {
      requireSeat();
      if (!colors.includes(seat)) fail("Choose a seat.");
      state.players[seat].life = 40;
      say(seat + " reset their life to |40|", { color: seat });
    },
    tax({ seat, index, delta }) {
      requireSeat();
      if (!colors.includes(seat)) fail("Choose a seat.");
      const slot = index === 1 ? 1 : 0;
      const tax = state.players[seat].tax;
      tax[slot] = clamp(tax[slot] + (number(delta) < 0 ? -2 : 2), 0, 100);
    },
    turnCount({ seat, delta }) {
      requireSeat();
      if (!colors.includes(seat)) fail("Choose a seat.");
      state.players[seat].turns = Math.max(0, state.players[seat].turns + (number(delta) < 0 ? -1 : 1));
    },
    turn({ seat }) {
      requireSeat();
      if (seat === undefined) {
        if (!state.turn.enabled) startTurn(color);
        else if (state.turn.color === color) startTurn(nextSeat(color));
        else fail("It is not your turn.");
        return;
      }
      if (!colors.includes(seat) || !seated(seat)) fail("That seat is empty.");
      startTurn(seat);
    },
    roll({ id: key }) {
      requireSeat();
      const die = object(String(key));
      if (die.kind !== "die") fail("Roll a die.");
      if (die.template === "first") {
        const players = colors.filter(seated);
        if (!players.length) fail("Nobody is seated.");
        const seat = players[host.random(0, players.length)];
        die.value = seat;
        say(name(seat) + " goes first!", { color: seat });
      } else if (die.template === "planar") {
        const faces = ["Chaos", "Planeswalk", "", "", "", ""];
        die.value = faces[host.random(0, 6)];
        say(color + " rolled the planar die: " + (die.value || "blank"), { color });
      } else {
        die.value = host.random(1, die.sides + 1);
        const shown = die.sides === 2 ? (die.value === 1 ? "Heads" : "Tails") : die.value;
        say(name(color) + " rolled a " + shown + " (d" + die.sides + ")", { color });
      }
      die.rolled = now();
    },
    coin({ id: key, mode, count }) {
      requireSeat();
      const tile = object(String(key));
      if (tile.template !== "krark") fail("Use Krark's Coin Flipper.");
      if (mode === "thumb") {
        tile.thumb = !tile.thumb;
        return;
      }
      if (mode === "x") {
        if (!Number.isFinite(Number(count))) fail("X must be a number");
        tile.count = clamp(Math.floor(Number(count)), 1, 100);
      }
      flipCoins(tile, mode, tile.count);
    },
    tracker({ id: key, room, level }) {
      requireSeat();
      const card = object(String(key));
      if (!card.tracker) fail("That card has no tracker.");
      if (level !== undefined) {
        card.pressed = clamp(card.pressed + (number(level) < 0 ? -1 : 1), 0, card.tracker.rooms.length);
        return;
      }
      const index = Math.floor(number(room));
      if (index < 1 || index > card.tracker.rooms.length) fail("Choose a room.");
      if (card.pressed === index) {
        card.pressed = 0;
        return;
      }
      card.pressed = index;
      const tokens = card.tracker.rooms[index - 1].tokens.map((slot) => card.tracker.tokens[slot]).filter(Boolean);
      const [fx, fz] = forward(card.rot);
      tokens.forEach((token, offsetIndex) =>
        place(
          [{ id: id(), card: cardSpec({ ...token, token: true }), owner: color }],
          clamp(card.x - fx * 3.2 + offsetIndex * 0.8, layout.world.x0, layout.world.x1),
          clamp(card.z - fz * 3.2, layout.world.z0, layout.world.z1),
          card.rot,
          false,
          { fresh: true },
        ),
      );
    },
    unpack({ id: key }) {
      requireSeat();
      const bag = object(String(key));
      if (bag.template !== "planechase") fail("That cannot be unpacked.");
      if (bag.unpacked) fail("Planechase is already unpacked.");
      bag.decks.forEach((deck, index) =>
        place(
          shuffle(deck.cards.map((card) => ({ id: id(), card: cardSpec(card) }))),
          -10 + index * 5,
          0,
          180,
          true,
          { fresh: true, name: deck.name },
        ),
      );
      spawnObject({ kind: "die", template: "planar", x: 15, z: 0, rot: 0, value: "" });
      bag.unpacked = true;
    },
    take_from_bag({ id: key, x, z }) {
      requireSeat();
      const bag = object(String(key));
      if (bag.kind !== "bag") fail("That is not a bag.");
      fromBag(bag, clamp(number(x, bag.x), layout.world.x0, layout.world.x1), clamp(number(z, bag.z), layout.world.z0, layout.world.z1));
    },
    chat({ message }) {
      chat(message, actor);
    },
    playmat({ url }) {
      requireSeat();
      state.playmats = state.playmats || {};
      if (!url) delete state.playmats[color];
      else {
        const value = image(String(url));
        if (!value) fail("Use an http or https image address for the playmat.");
        state.playmats[color] = value;
      }
      tell(url ? "attempting to set playmat image to " + url : "playmat removed");
    },
    emote({ kind }) {
      requireSeat();
      if (kind === "response") say(name(color) + " has a response!", { color });
      else if (kind === "couldyounot") say(name(color) + ' asks: "Could you not?"', { color });
      else if (kind === "handcounts")
        tell(
          "number of cards in hands:\n" +
            colors
              .filter(seated)
              .map((seat) => seat + ": " + String(state.hands[seat][0].length + state.hands[seat][1].length).padStart(2, "0"))
              .join("\n"),
        );
      else fail("Unknown emote.");
    },
    reset() {
      if (!host.can("manage", actor)) fail("Only game administrators can reset the table.");
      state = fresh(state);
      say("The table was reset.", { color: "" });
    },
  };
  const visibleEntry = (entry) => ({ card: entry.transformed && entry.card.dfc ? entry.card.dfc : entry.card });

  const snapshot = (current, user) => {
    const viewer = colors.find((seat) => current.seats[seat].user === user) || "";
    const hidden = (item) => ({
      id: item.id,
      kind: item.kind,
      back: item.card?.back || "",
    });
    const show = (item) => {
      if (item.kind === "deck") {
        const top = item.cards[0];
        const { cards, ...rest } = item;
        return {
          ...rest,
          count: cards.length,
          back: top?.card.back || "",
          top: item.faceDown ? null : top && (top.transformed && top.card.dfc ? top.card.dfc : top.card),
        };
      }
      if (item.kind === "card" && item.faceDown)
        return { ...hidden(item), x: item.x, z: item.z, rot: item.rot, faceDown: true, counters: item.counters, highlight: item.highlight };
      return item;
    };
    const objects = current.order.map((key) => show(current.objects[key]));
    const hands = {};
    for (const seat of colors)
      hands[seat] = current.hands[seat].map((hand) =>
        hand.map((key) =>
          seat === viewer ? current.objects[key] : hidden(current.objects[key]),
        ),
      );
    return {
      seats: current.seats,
      players: current.players,
      turn: current.turn,
      timersOn: current.timersOn,
      playmats: current.playmats || {},
      cascade: viewer && current.cascade[viewer] ? current.cascade[viewer] : null,
      objects,
      hands,
      viewer,
      log: current.log.filter((entry) => !entry.to || entry.to === viewer).slice(-150),
      now: now(),
    };
  };

  return {
    fresh: () => fresh(),
    snapshot,
    play(user, payload) {
      const action = actions[payload?.action];
      if (!action) fail("Unknown action.");
      state = host.load();
      if (!state?.version) state = fresh();
      actor = user;
      color = seatOf(user);
      if (payload.action !== "chat" && payload.action !== "reset" && !host.can("play", user))
        fail("Spectators cannot change the table.");
      const result = action(payload) || {};
      host.persist(state);
      return { ok: true, ...result };
    },
  };
}
