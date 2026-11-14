import { pathfinder } from "./system.mjs";
import { corePacks, KINDS } from "./content/index.mjs";
import * as sheets from "./actors.mjs";
import * as cards from "./rolls.mjs";
import { registerCore } from "./core.mjs";
import { populate } from "./starter.mjs";

const table = Easel.Interfaces.create("easel.vtt.table@1");
const engine = Easel.Interfaces.create("easel.wotcogl35.engine@1");
const copy = (value) => JSON.parse(JSON.stringify(value === undefined ? null : value));
const list = (value) => (Array.isArray(value) ? value : []);
const ROLL_MODES = ["public", "gm", "blind", "self"];
const mode = (value) => (ROLL_MODES.includes(value) ? value : "public");
const CUSTOM = { id: "custom", source: "This table" };
const SAMPLES = "/assets/easel.vtt.table-0.1.0/client/samples/";

engine.configure(pathfinder());
for (const pack of corePacks()) engine.library.addPack(pack);
const system = engine.system;

const cache = new Map();
const exists = (id) => easel.pf1e.Creature.ids().includes(id);
const creature = (id) => {
  if (!exists(id)) throw new Error("That character was not found.");
  return new easel.pf1e.Creature(id);
};
const creatures = () => easel.pf1e.Creature.ids().map((id) => new easel.pf1e.Creature(id));

function sheetOf(record) {
  const hit = cache.get(record.id);
  if (hit && record.stamp && hit.stamp === record.stamp) return hit;
  const doc = engine.normalize(copy(record.sheet));
  const entry = { stamp: record.stamp, doc, derived: engine.derive(doc) };
  cache.set(record.id, entry);
  return entry;
}

function store(record, doc) {
  record.sheet = doc;
  record.kind = doc.kind === "npc" ? "npc" : "character";
  record.stamp = sheets.uid();
  record.save();
  cache.delete(record.id);
}

function edit(record, change) {
  const doc = copy(sheetOf(record).doc);
  const result = change(doc, sheetOf(record).derived);
  store(record, result && result.kind ? result : doc);
}

const member = (userId) => Application.users.list().some((user) => user.id === userId && user.role !== "spectator");
const displayName = (userId) => (Application.users.list().find((user) => user.id === userId) || {}).displayName || "Player";
const changed = (library = false) => {
  Application.events.emit("easel.pf1e.changed", { library });
  Application.events.emit("easel.vtt.changed", {});
};

function post(record, userId, card, rollMode = "public") {
  return table.post({ userId, speakerName: record ? record.name : displayName(userId), speakerActorId: record ? record.id : "", speakerActorType: record ? record.type : "", rollMode: mode(rollMode), card });
}

function say(userId, text, rollMode = "public") {
  return table.post({ userId, speakerName: displayName(userId), rollMode: mode(rollMode), text });
}

function targets(ids, userId, need) {
  const found = [];
  const seen = new Set();
  for (const id of list(ids).slice(0, 40)) {
    let actorId = String(id);
    if (easel.vtt.Token.ids().includes(actorId)) actorId = new easel.vtt.Token(actorId).actorId || "";
    if (!actorId || seen.has(actorId) || !exists(actorId)) continue;
    seen.add(actorId);
    const record = new easel.pf1e.Creature(actorId);
    const rights = record.access(userId);
    if (need === "write" ? rights.write : rights.control) found.push(record);
  }
  if (!found.length) throw new Error("Select the tokens this applies to. Tokens need a character sheet, and you can only change your own.");
  return found;
}

const game = {
  table,
  cards,
  sheets,
  rolls: engine.registry("rolls"),
  actions: engine.registry("actions"),
  kinds: engine.registry("kinds"),
  sections: engine.registry("sections"),
  cardActions: engine.registry("cardActions"),
  creature,
  creatures,
  exists,
  sheetOf,
  store,
  edit,
  post,
  say,
  targets,
  changed,
  displayName,
  isGM: (userId) => table.isGM(userId),
};

registerCore(engine, game, KINDS);
engine.install(game);
const shipped = new Map(engine.library.entries);
const kinds = game.kinds;

function visible(section, sheet) {
  if (section.statblock === false && sheet.doc.mode === "statblock") return false;
  if (!section.when) return true;
  return typeof section.when === "function" ? !!section.when(sheet) : !!engine.evaluate(sheet.derived, section.when);
}

function systemInfo() {
  return {
    id: system.id,
    name: system.name,
    abilityNames: system.abilityNames,
    saves: system.saves,
    skills: Object.fromEntries(Object.entries(system.skills).map(([id, skill]) => [id, { name: skill.name, ability: skill.ability, trained: !!skill.trained, group: !!skill.group }])),
    conditions: Object.fromEntries(Object.entries(system.conditions).map(([id, condition]) => [id, { name: condition.name, text: condition.text || "" }])),
    sizes: Object.fromEntries(Object.entries(engine.tables.SIZES).map(([id, size]) => [id, size.label])),
    alignments: system.alignments,
    classes: engine.library.list("class").map((entry) => ({ id: entry.id, name: entry.name, hd: entry.hd, npc: !!entry.npc, casting: !!entry.casting })),
    races: engine.library.list("race").map((entry) => ({ id: entry.id, name: entry.name, choice: entry.choice || "" })),
    kinds: kinds.list().map((kind) => ({ id: kind.id, label: kind.label, singular: kind.singular || kind.id, icon: kind.icon || "file", creatable: !!kind.form, onSheet: kind.onSheet !== false, count: engine.library.count(kind.id) })),
    packs: engine.library.packs,
    extensions: engine.installed.map((entry) => entry.name),
    options: system.options,
  };
}

function listing(userId) {
  return creatures()
    .map((record) => ({ record, rights: record.access(userId) }))
    .filter(({ rights }) => rights.read)
    .map(({ record, rights }) => {
      const { doc, derived } = sheetOf(record);
      return { id: record.id, name: record.name, image: record.portrait || record.tokenImage || "", kind: record.kind, monster: doc.mode === "statblock", summary: sheets.summary(doc, derived), hp: { value: derived.hp.current, max: derived.hp.max }, status: derived.hp.status, canWrite: rights.write, canControl: rights.control, ownerUserIds: rights.gm ? [...record.ownerUserIds] : [] };
    });
}

function sheetPayload(record, userId) {
  const rights = record.access(userId);
  const sheet = sheetOf(record);
  const { data, ...derived } = sheet.derived;
  void data;
  return { id: record.id, name: record.name, portrait: record.portrait || "", kind: record.kind, summary: sheets.summary(sheet.doc, sheet.derived), canWrite: rights.write, canControl: rights.control, gm: rights.gm, doc: sheet.doc, derived, sections: game.sections.ids().map((id) => ({ id, ...game.sections.get(id) })).filter((section) => visible(section, sheet)).map(({ when, ...section }) => (section.type === "values" ? { ...section, rows: list(section.rows).map((row) => ({ label: row.label, value: Math.trunc(engine.evaluate(sheet.derived, row.value)) + (row.unit ? " " + row.unit : "") })) } : section)) };
}

function describe(entry) {
  const kind = kinds.get(entry.kind) || {};
  return { id: entry.id, name: entry.name, detail: kind.describe ? kind.describe(entry) : entry.summary || "", source: entry.source || "", custom: entry.pack === "custom", group: kind.group ? kind.group(entry) : entry.group || "" };
}

function initiativeFor(record, userId, rollMode = "public") {
  const { derived } = sheetOf(record);
  const roll = engine.check({ bonus: derived.init.total });
  post(record, userId, cards.checkCard(roll, { title: "Initiative", parts: derived.init.parts }), rollMode);
  return roll.total + derived.init.total / 100;
}
game.initiativeFor = initiativeFor;

table.start({
  lineOfSight: true,
  actor: (type, id) => {
    if (!exists(id)) return null;
    const record = new easel.pf1e.Creature(id);
    return { name: record.name, image: record.tokenImage || record.portrait || "", scale: sheets.TOKEN_SCALE[sheetOf(record).doc.size] || 1 };
  },
  tokenBars: (token, userId, gm) => {
    if (!token.actorId || !exists(token.actorId)) return [];
    const record = new easel.pf1e.Creature(token.actorId);
    if (!gm && !record.canRead(userId)) return [];
    const hp = sheetOf(record).derived.hp;
    return hp.max > 0 ? [{ value: Math.max(0, hp.current), max: hp.max }] : [];
  },
  initiative: (combatant, context) => {
    if (combatant.actorId && exists(combatant.actorId)) return initiativeFor(new easel.pf1e.Creature(combatant.actorId), context.userId);
    const roll = engine.check({ bonus: 0 });
    table.post({ userId: context.userId, speakerName: combatant.name, card: cards.checkCard(roll, { title: "Initiative" }) });
    return roll.total;
  },
  command: (text, context) => {
    const match = /^\/(?:r|roll)\s+(.+)$/i.exec(text);
    if (!match) return false;
    const [formula, ...label] = match[1].split("#");
    const result = engine.roll(formula.trim());
    table.post({ userId: context.userId, speakerName: context.displayName || "Player", rollMode: mode(context.rollMode), card: { system: "pf1e", type: "roll", title: label.join("#").trim() || "Roll", sections: [{ formula: result.formula, dice: result.dice, total: result.total }], rows: [], actions: [] } });
    return true;
  },
  cardView: (card, userId, gm) => cards.forViewer(card, gm),
  tokenDeleted: (token) => {
    if (!token.actorId || !exists(token.actorId)) return;
    const record = new easel.pf1e.Creature(token.actorId);
    if (!sheetOf(record).doc.spawned || record.tokens().length) return;
    cache.delete(record.id);
    record.remove();
  },
});

Application.events.register("easel.pf1e.state", { valid: 1, actors: "array", system: "field" });
Application.events.register("easel.pf1e.sheet", { valid: 1, actorId: "string", sheet: "field" });
Application.events.register("easel.pf1e.entries", { valid: 1, kind: "string", entries: "array" });
Application.events.register("easel.pf1e.entry", { valid: 1, entry: "field" });
Application.events.register("easel.pf1e.notice", { valid: 1, message: "string" });
Application.events.register("easel.pf1e.changed", { valid: 1, library: "boolean" });
Application.events.register("easel.pf1e.error", { valid: 1, message: "string" });

const handle = (name, fields, handler) => {
  Application.events.register("easel.pf1e." + name, { valid: 2, ...fields });
  Application.events.on("easel.pf1e." + name, (payload, connection) => {
    try {
      handler(payload, connection, connection.user.id);
    } catch (error) {
      connection.send("easel.pf1e.error", { message: error.message || String(error) });
    }
  });
};

function writable(actorId, userId) {
  const record = creature(actorId);
  if (!record.canWrite(userId)) throw new Error("Only an owner can change this character.");
  return record;
}

function controllable(actorId, userId) {
  const record = creature(actorId);
  if (!record.canControl(userId)) throw new Error("You do not control this character.");
  return record;
}

handle("refresh", {}, (_, connection, userId) => connection.send("easel.pf1e.state", { actors: listing(userId), system: systemInfo() }));

handle("open", { actorId: "string" }, ({ actorId }, connection, userId) => {
  const record = creature(actorId);
  if (!record.canRead(userId)) throw new Error("You cannot open that character.");
  connection.send("easel.pf1e.sheet", { actorId, sheet: sheetPayload(record, userId) });
});

function uniqueName(name) {
  const taken = new Set(creatures().map((record) => record.name));
  if (!taken.has(name)) return name;
  let number = 2;
  while (taken.has(name + " " + number)) number += 1;
  return name + " " + number;
}

const tokenArt = (entry) => (/undead/.test(entry.type || "") ? SAMPLES + "token-skull.svg" : /animal|vermin|beast|dragon|ooze|aberration|plant/.test(entry.type || "") ? SAMPLES + "token-beast.svg" : "");

function createCreature(name, doc, userId, image = "") {
  const record = new easel.pf1e.Creature();
  record.name = String(name).trim().slice(0, 120) || "New character";
  record.ownerUserIds = table.isGM(userId) ? [] : [userId];
  if (image) {
    record.portrait = image;
    record.tokenImage = image;
  }
  store(record, doc);
  return record;
}

handle("actorCreate", { name: "string", kind: "string", entryId: "string" }, ({ name, kind, entryId }, connection, userId) => {
  if (!member(userId)) throw new Error("Spectators cannot create characters.");
  if (entryId) {
    if (!table.isGM(userId)) throw new Error("Only the game master adds monsters.");
    const entry = engine.library.require(entryId, "monster");
    createCreature(uniqueName(name || entry.name), sheets.fromMonster(entry, engine.blank("npc")), userId, tokenArt(entry));
  } else {
    if (kind === "npc" && !table.isGM(userId)) throw new Error("Only the game master creates non-player characters.");
    createCreature(name, engine.blank(kind === "npc" ? "npc" : "character"), userId);
  }
  changed();
});

handle("actorUpdate", { actorId: "*easel.pf1e.Creature", changes: "field" }, ({ actorId, changes }, connection, userId) => {
  const record = writable(actorId, userId);
  let renamed = false;
  for (const [key, value] of Object.entries(changes)) {
    if (key === "name") {
      record.name = String(value).trim().slice(0, 120) || record.name;
      renamed = true;
    } else if (key === "portrait") {
      record.portrait = String(value).slice(0, 400);
      record.tokenImage = record.portrait;
      for (const token of record.tokens()) {
        token.image = record.portrait;
        token.save();
      }
    } else if (key === "ownerUserIds") {
      if (!table.isGM(userId)) throw new Error("Only the game master assigns characters.");
      const members = new Set(Application.users.list().map((user) => user.id));
      record.ownerUserIds = [...new Set(list(value).map(String))].filter((id) => members.has(id));
    } else if (key === "set") {
      const doc = copy(sheetOf(record).doc);
      for (const [path, next] of Object.entries(value || {})) sheets.setPath(doc, path, next);
      store(record, doc);
    } else throw new Error("A character has no " + key + ".");
  }
  record.save();
  if (renamed)
    for (const token of record.tokens()) {
      token.name = record.name;
      token.save();
    }
  changed();
});

handle("actorDelete", { actorId: "*easel.pf1e.Creature" }, ({ actorId }, connection, userId) => {
  const record = writable(actorId, userId);
  for (const token of record.tokens()) {
    for (const id of easel.vtt.Combatant.ids()) {
      const combatant = new easel.vtt.Combatant(id);
      if (combatant.tokenId === token.id) combatant.remove();
    }
    token.remove();
  }
  if (record.defaultTokenId) {
    const prototype = record.defaultTokenId;
    record.defaultTokenId = undefined;
    record.save();
    new easel.vtt.Token(prototype).remove();
  }
  cache.delete(record.id);
  record.remove();
  changed();
});

handle("actorAdd", { actorId: "*easel.pf1e.Creature", entryId: "string", options: "field" }, ({ actorId, entryId, options }, connection, userId) => {
  const record = writable(actorId, userId);
  const entry = engine.library.require(entryId);
  const kind = kinds.get(entry.kind);
  if (!kind || kind.onSheet === false) throw new Error("A " + entry.kind + " cannot be added to a character.");
  edit(record, (doc, derived) => {
    if (doc.mode === "statblock" && !kind.statblock) throw new Error("A stat block creature takes its numbers from the stat block; only items and effects can be added.");
    return (kind.add || sheets.addToList)(doc, entry, options || {}, derived, game);
  });
  changed();
});

handle("actorRemove", { actorId: "*easel.pf1e.Creature", list: "string", uid: "string" }, ({ actorId, list: name, uid }, connection, userId) => {
  const record = writable(actorId, userId);
  edit(record, (doc) => {
    if (name.startsWith("spells:")) {
      const state = doc.casting[name.slice(7)];
      if (!state) throw new Error("That spell list was not found.");
      state.spells = list(state.spells).filter((spell) => spell.uid !== uid);
      state.prepared = list(state.prepared).filter((spell) => spell.spellUid !== uid);
    } else if (name.startsWith("prepared:")) {
      const state = doc.casting[name.slice(9)];
      if (!state) throw new Error("That spell list was not found.");
      state.prepared = list(state.prepared).filter((spell) => spell.uid !== uid);
    } else if (name.startsWith("list:")) {
      const before = list(doc.lists[name.slice(5)]).length;
      doc.lists[name.slice(5)] = list(doc.lists[name.slice(5)]).filter((entry) => entry.uid !== uid);
      if (doc.lists[name.slice(5)].length === before) throw new Error("That is no longer on the sheet.");
    } else sheets.removeFrom(doc, name, uid);
  });
  changed();
});

handle("actorItem", { actorId: "*easel.pf1e.Creature", uid: "string", changes: "field" }, ({ actorId, uid, changes }, connection, userId) => {
  const record = writable(actorId, userId);
  edit(record, (doc) => {
    sheets.updateItem(doc, uid, changes);
  });
  changed();
});

handle("actorAction", { actorId: "*easel.pf1e.Creature", action: "string", data: "field" }, ({ actorId, action, data }, connection, userId) => {
  const entry = game.actions.get(action);
  if (!entry) throw new Error("A character cannot " + action + ".");
  const run = typeof entry === "function" ? entry : entry.run;
  const record = entry.needs === "control" ? controllable(actorId, userId) : writable(actorId, userId);
  edit(record, (doc, derived) => run(doc, derived, data || {}, { record, userId, game, engine }));
  changed();
});

handle("roll", { actorId: "*easel.pf1e.Creature", kind: "string", id: "string", options: "field" }, ({ actorId, kind, id, options }, connection, userId) => {
  const record = controllable(actorId, userId);
  const build = game.rolls.get(kind);
  if (!build) throw new Error("There is no " + kind + " roll.");
  const rollMode = mode((options || {}).rollMode);
  const card = build({ record, sheet: sheetOf(record), id, options: options || {}, userId, rollMode, game, engine });
  if (card) post(record, userId, card, rollMode);
  changed();
});

handle("card", { action: "string", targets: "array", payload: "field", rollMode: "string" }, ({ action, targets: ids, payload, rollMode }, connection, userId) => {
  const run = game.cardActions.get(action);
  if (!run) throw new Error("That button does nothing at this table.");
  run({ targets: ids, payload: payload || {}, userId, rollMode: mode(rollMode), game, engine });
  changed();
});

handle("apply", { targets: "array", payload: "field" }, ({ targets: ids, payload }, connection, userId) => {
  game.cardActions.get("apply")({ targets: ids, payload, userId, rollMode: "public", game, engine });
  changed();
});

handle("saves", { targets: "array", save: "string", dc: "integer", rollMode: "string" }, ({ targets: ids, save, dc, rollMode }, connection, userId) => {
  game.cardActions.get("save")({ targets: ids, payload: { save, dc }, userId, rollMode: mode(rollMode), game, engine });
});

handle("effect", { targets: "array", entryId: "string", level: "integer", rounds: "integer" }, ({ targets: ids, entryId, level, rounds }, connection, userId) => {
  game.cardActions.get("effect")({ targets: ids, payload: { entryId, level, rounds }, userId, rollMode: "public", game, engine });
  changed();
});

handle("library", { kind: "string" }, ({ kind }, connection) => {
  if (!kinds.has(kind)) throw new Error("The library has no " + kind + " section.");
  connection.send("easel.pf1e.entries", { kind, entries: engine.library.list(kind).map(describe) });
});

handle("lookup", { id: "string" }, ({ id }, connection) => {
  connection.send("easel.pf1e.entry", { entry: engine.library.require(id) });
});

function customRecord(id) {
  for (const recordId of easel.pf1e.Entry.ids()) {
    const record = new easel.pf1e.Entry(recordId);
    if (record.entryId === id) return record;
  }
  return null;
}

handle("entrySave", { entry: "field" }, ({ entry }, connection, userId) => {
  table.requireGM(connection);
  const kind = kinds.get(String(entry.kind));
  if (!kind || !kind.form) throw new Error("New " + (kind ? kind.label.toLowerCase() : "entries of that kind") + " come from a content module.");
  if (entry.id && !String(entry.id).startsWith(String(entry.kind) + ":")) throw new Error("That entry id does not match its kind.");
  const built = kind.form(entry, game);
  if (JSON.stringify(built).length > 60000) throw new Error("That entry is too large.");
  const stored = engine.library.put(built, CUSTOM);
  const record = customRecord(stored.id) || new easel.pf1e.Entry();
  record.kind = stored.kind;
  record.name = stored.name.slice(0, 120);
  record.entryId = stored.id;
  record.userId = userId;
  record.data = stored;
  record.save();
  cache.clear();
  connection.send("easel.pf1e.entry", { entry: stored });
  changed(true);
});

handle("entryDelete", { id: "string" }, ({ id }, connection) => {
  table.requireGM(connection);
  const record = customRecord(id);
  if (!record) throw new Error("Only entries made at this table can be deleted.");
  record.remove();
  if (shipped.has(id)) engine.library.put(shipped.get(id), engine.library.packs.find((pack) => pack.id === shipped.get(id).pack) || { id: shipped.get(id).pack, source: shipped.get(id).source });
  else engine.library.remove(id);
  cache.clear();
  changed(true);
});

handle("spawn", { entryId: "string", sceneId: "*easel.vtt.Scene", groundId: "string", x: "number", y: "number" }, ({ entryId, sceneId, groundId, x, y }, connection, userId) => {
  table.requireGM(connection);
  const entry = engine.library.require(entryId, "monster");
  const record = createCreature(uniqueName(entry.name), { ...sheets.fromMonster(entry, engine.blank("npc")), spawned: true }, userId, tokenArt(entry));
  table.tokenCreate({ sceneId, groundId, actorType: record.type, actorId: record.id, name: "", x, y }, connection);
  const token = record.tokens()[0];
  if (token) {
    token.disposition = "hostile";
    token.save();
  }
  changed();
});

Application.events.on("easel.vtt.turnStarted", ({ combatantId }) => {
  if (!easel.vtt.Combatant.ids().includes(combatantId)) return;
  const combatant = new easel.vtt.Combatant(combatantId);
  if (!combatant.actorId || !exists(combatant.actorId)) return;
  const record = new easel.pf1e.Creature(combatant.actorId);
  const sheet = sheetOf(record);
  const result = engine.tick(sheet.doc, sheet.derived);
  if (JSON.stringify(result.doc) === JSON.stringify(sheet.doc)) return;
  store(record, result.doc);
  const gm = Application.users.list().find((user) => user.role === "administrator");
  if (result.ended.length) table.post({ userId: gm ? gm.id : "", speakerName: record.name, rollMode: record.kind === "npc" ? "gm" : "public", text: result.ended.join(", ") + (result.ended.length > 1 ? " end" : " ends") + " for " + record.name + "." });
  Application.events.emit("easel.pf1e.changed", { library: false });
});

Server.events.on("Load.Data.Ready", () => {
  for (const id of easel.pf1e.Entry.ids()) {
    const record = new easel.pf1e.Entry(id);
    try {
      engine.library.put(copy(record.data), CUSTOM);
    } catch {}
  }
  if (!easel.vtt.Scene.ids().length) populate({ engine, table, sheets, store });
});
