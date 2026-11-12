import { tavern, stage } from "./demo.mjs";

const table = Easel.Interfaces.create("easel.vtt.table@1");
const dice = Easel.Interfaces.create("easel.dice.formula@1");
const geometry = Easel.Interfaces.create("easel.maps.geometry@1");
const copy = (value) => JSON.parse(JSON.stringify(value ?? null));
const SAMPLES = "/assets/easel.vtt.table-0.1.0/client/samples/";
const STATS = ["might", "agility", "wits", "presence"];
const modifier = (score) => Math.floor(((Number(score) || 10) - 10) / 2);
const signed = (value) => (value >= 0 ? "+" : "") + value;

const layout = {
  tagline: "@summary",
  taglinePlaceholder: "Calling, origin, level…",
  tabs: [
    {
      id: "main",
      label: "Character",
      blocks: [
        { type: "stats", title: "Attributes", items: [{ id: "might", label: "Might", modifier: "half" }, { id: "agility", label: "Agility", modifier: "half" }, { id: "wits", label: "Wits", modifier: "half" }, { id: "presence", label: "Presence", modifier: "half" }] },
        { type: "resources", title: "Condition", items: [{ id: "hp", label: "Health" }, { id: "focus", label: "Focus", color: "#8b9dff" }] },
        { type: "fields", title: "Details", items: [{ id: "defense", label: "Defense", type: "number" }, { id: "speed", label: "Speed", type: "number" }, { id: "level", label: "Level", type: "number" }] },
      ],
    },
    { id: "skills", label: "Skills", blocks: [{ type: "list", id: "skills", title: "Skills", roll: "bonus", addLabel: "Add a skill", emptyText: "No skills yet.", columns: [{ id: "name", label: "Skill" }, { id: "bonus", label: "Bonus", type: "number" }] }] },
    { id: "gear", label: "Gear", blocks: [{ type: "list", id: "gear", title: "Carried", addLabel: "Add an item", emptyText: "Nothing carried.", columns: [{ id: "name", label: "Item" }, { id: "quantity", label: "Quantity", type: "number" }] }] },
    { id: "notes", label: "Notes", blocks: [{ type: "text", id: "notes", title: "Notes", rows: 12, placeholder: "Background, bonds, reminders…" }] },
  ],
};

const blank = () => ({ might: 10, agility: 10, wits: 10, presence: 10, hp: { value: 10, max: 10 }, focus: { value: 3, max: 3 }, defense: 10, speed: 6, level: 1, skills: [], gear: [], notes: "" });
const characters = () => easel.tabletop.Character.ids().map((id) => new easel.tabletop.Character(id));
const character = (id) => {
  if (!easel.tabletop.Character.ids().includes(id)) throw new Error("That character was not found.");
  return new easel.tabletop.Character(id);
};
const sheetOf = (record) => ({ ...blank(), ...copy(record.sheet) });

function rollCard(title, formula, userId, speaker, rollMode = "public", extra = {}) {
  const result = dice.roll(formula);
  table.post({ userId, speakerName: speaker, rollMode, ...extra, card: { content: { title, formula: result.formula, total: result.total, rolls: result.dice.map((die) => ({ sides: die.sides, value: die.value, dropped: die.dropped })) } } });
  return result;
}

table.start({
  lineOfSight: true,
  actor: (type, id) => {
    const record = character(id);
    return { name: record.name, image: record.tokenImage || record.portrait || "" };
  },
  tokenBars: (token, userId, gm) => {
    if (!token.actorId || !easel.tabletop.Character.ids().includes(token.actorId)) return [];
    const record = new easel.tabletop.Character(token.actorId);
    if (!gm && !record.canRead(userId)) return [];
    const health = sheetOf(record).hp;
    return Number(health.max) > 0 ? [{ value: Number(health.value) || 0, max: Number(health.max) }] : [];
  },
  initiative: (combatant, context) => {
    const bonus = combatant.actorId && easel.tabletop.Character.ids().includes(combatant.actorId) ? modifier(sheetOf(new easel.tabletop.Character(combatant.actorId)).agility) : 0;
    return rollCard("Initiative", "d20" + (bonus ? signed(bonus) : ""), context.userId, combatant.name).total;
  },
  command: (text, context) => {
    const match = /^\/(?:r|roll)\s+(.+)$/i.exec(text);
    if (!match) return false;
    const [formula, ...label] = match[1].split("#");
    rollCard(label.join("#").trim() || "Roll", formula.trim(), context.userId, context.displayName || "Player", context.rollMode);
    return true;
  },
});

Application.events.register("easel.tabletop.state", { valid: 1, actors: "array", layout: "field" });
Application.events.register("easel.tabletop.changed", { valid: 1 });
Application.events.register("easel.tabletop.error", { valid: 1, message: "string" });

const handle = (name, fields, handler) => {
  Application.events.register("easel.tabletop." + name, { valid: 2, ...fields });
  Application.events.on("easel.tabletop." + name, (payload, connection) => {
    try {
      handler(payload, connection);
    } catch (error) {
      connection.send("easel.tabletop.error", { message: error.message || String(error) });
    }
  });
};
const changed = () => {
  Application.events.emit("easel.tabletop.changed", {});
  Application.events.emit("easel.vtt.changed", {});
};

handle("refresh", {}, (_, connection) => {
  const userId = connection.user.id;
  const actors = characters()
    .map((record) => ({ record, rights: record.access(userId) }))
    .filter(({ rights }) => rights.read)
    .map(({ record, rights }) => ({ id: record.id, name: record.name, portrait: record.portrait || "", tokenImage: record.tokenImage || "", summary: record.summary, sheet: sheetOf(record), canWrite: rights.write, canControl: rights.control, ownerUserIds: [...record.ownerUserIds] }));
  connection.send("easel.tabletop.state", { actors, layout });
});

handle("actorCreate", { name: "string" }, ({ name }, connection) => {
  if (!Application.users.list().some((user) => user.id === connection.user.id && user.role !== "spectator")) throw new Error("Spectators cannot create characters.");
  const record = new easel.tabletop.Character();
  record.name = String(name).trim().slice(0, 120) || "New character";
  record.ownerUserIds = table.isGM(connection.user.id) ? [] : [connection.user.id];
  record.sheet = blank();
  record.save();
  changed();
});

handle("actorUpdate", { actorId: "*easel.tabletop.Character", changes: "field" }, ({ actorId, changes }, connection) => {
  const record = character(actorId);
  if (!record.canWrite(connection.user.id)) throw new Error("Only an owner can change this character.");
  for (const [key, value] of Object.entries(changes)) {
    if (key === "name") record.name = String(value).trim().slice(0, 120) || record.name;
    else if (key === "summary") record.summary = String(value).slice(0, 200);
    else if (key === "portrait") {
      record.portrait = String(value).slice(0, 400);
      record.tokenImage = record.portrait;
      for (const token of record.tokens()) {
        token.image = record.portrait;
        token.save();
      }
    } else if (key === "sheet") {
      if (!value || typeof value !== "object") throw new Error("A sheet change names a path and a value.");
      const sheet = sheetOf(record);
      const parts = String(value.path).split(".");
      if (!parts.length || parts.length > 4 || parts.some((part) => !/^[A-Za-z0-9]{1,40}$/.test(part))) throw new Error("That is not a sheet field.");
      let target = sheet;
      for (const part of parts.slice(0, -1)) {
        if (target[part] === undefined || target[part] === null || typeof target[part] !== "object") throw new Error("That is not a sheet field.");
        target = target[part];
      }
      target[parts[parts.length - 1]] = typeof value.value === "string" ? value.value.slice(0, 20000) : value.value;
      record.sheet = sheet;
    } else if (key === "listAdd" || key === "listRemove") {
      const sheet = sheetOf(record);
      const list = String(value.id);
      if (!["skills", "gear"].includes(list)) throw new Error("That list cannot be changed.");
      if (key === "listAdd") {
        if (sheet[list].length >= 60) throw new Error("That list is full.");
        sheet[list].push(list === "skills" ? { name: "", bonus: 0 } : { name: "", quantity: 1 });
      } else sheet[list].splice(Number(value.index), 1);
      record.sheet = sheet;
    } else if (key === "ownerUserIds") {
      if (!table.isGM(connection.user.id)) throw new Error("Only the game master assigns characters.");
      const members = new Set(Application.users.list().map((user) => user.id));
      record.ownerUserIds = [...new Set(value.map(String))].filter((id) => members.has(id));
    } else throw new Error("A character has no " + key + ".");
  }
  record.save();
  if (record.name) {
    for (const token of record.tokens()) {
      if (token.name !== record.name && "name" in changes) {
        token.name = record.name;
        token.save();
      }
    }
  }
  changed();
});

handle("actorDelete", { actorId: "*easel.tabletop.Character" }, ({ actorId }, connection) => {
  const record = character(actorId);
  if (!record.canWrite(connection.user.id)) throw new Error("Only an owner can delete this character.");
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
  record.remove();
  changed();
});

handle("actorRoll", { actorId: "*easel.tabletop.Character", label: "string", modifier: "number", rollMode: "string" }, ({ actorId, label, modifier: bonus, rollMode }, connection) => {
  const record = character(actorId);
  if (!record.canControl(connection.user.id)) throw new Error("You do not control this character.");
  const value = Math.max(-99, Math.min(99, Math.round(bonus)));
  rollCard(String(label).slice(0, 80) || "Check", "d20" + (value ? signed(value) : ""), connection.user.id, record.name, ["public", "gm", "blind", "self"].includes(rollMode) ? rollMode : "public", { speakerActorId: record.id, speakerActorType: record.type });
});

Server.events.on("Load.Data.Ready", () => {
  if (easel.vtt.Scene.ids().length) return;
  const map = geometry.emptyBattleMap((prefix) => prefix);
  const ground = map.layers[0];
  map.size = copy(tavern.size);
  ground.name = "Ground floor";
  ground.grid = copy(tavern.grid);
  ground.ambient = tavern.ambient;
  ground.gmBrightness = 0.55;
  ground.image = { ref: SAMPLES + tavern.image, position: { x: 0, y: 0 }, size: copy(tavern.size) };
  ground.children.find((layer) => layer.type === "wall").items = copy([...tavern.walls, ...tavern.doors, ...tavern.columns]);
  ground.children.find((layer) => layer.type === "light").items = copy(tavern.lights).map((light) => ({ ...light, enabled: true }));
  ground.children.push(geometry.createLayer("drawing", "drawing", { name: "Drawings" }));
  const scene = new easel.vtt.Scene();
  scene.name = tavern.name;
  scene.map = map;
  scene.active = true;
  scene.navigation = true;
  scene.sort = 0;
  scene.save();
  const cell = tavern.grid.size;
  const presets = { Aldric: { summary: "Sellsword, level 2", might: 16, agility: 12, wits: 10, presence: 11, hp: 22, defense: 15 }, Mira: { summary: "Hedge mage, level 2", might: 8, agility: 12, wits: 17, presence: 13, hp: 12, defense: 11 }, Pip: { summary: "Cutpurse, level 2", might: 10, agility: 17, wits: 13, presence: 12, hp: 15, defense: 14 } };
  for (const entry of tavern.tokens) {
    let actor = null;
    if (entry.player) {
      const preset = presets[entry.name] || {};
      actor = new easel.tabletop.Character();
      actor.name = entry.name;
      actor.portrait = SAMPLES + entry.image;
      actor.tokenImage = SAMPLES + entry.image;
      actor.summary = preset.summary || "";
      actor.sheet = { ...blank(), might: preset.might ?? 10, agility: preset.agility ?? 10, wits: preset.wits ?? 10, presence: preset.presence ?? 10, hp: { value: preset.hp ?? 10, max: preset.hp ?? 10 }, defense: preset.defense ?? 10, skills: [{ name: "Notice", bonus: 3 }, { name: "Athletics", bonus: 2 }], gear: [{ name: "Travelling pack", quantity: 1 }, { name: "Torch", quantity: 3 }] };
      actor.save();
    }
    const token = new easel.vtt.Token();
    token.sceneId = scene.id;
    token.groundId = ground.id;
    token.name = entry.name;
    token.image = SAMPLES + entry.image;
    token.x = entry.x;
    token.y = entry.y;
    token.width = cell;
    token.height = cell;
    token.hidden = Boolean(entry.hidden);
    token.disposition = entry.disposition;
    token.vision = { sight: true, range: 0, light: entry.light ? { radius: entry.light, color: "#bfe0ff" } : null };
    if (actor) {
      token.actorId = actor.id;
      token.actorType = actor.type;
    }
    token.save();
  }
  const show = new easel.vtt.Scene();
  show.name = "Arrival at Ravenhold";
  show.kind = "stage";
  show.map = geometry.emptyBattleMap((prefix) => prefix);
  const box = copy(stage);
  const withArt = (elements) => {
    for (const element of elements) {
      if (element.key) element.key = SAMPLES + element.key;
      if (element.children) withArt(element.children);
    }
  };
  withArt(box.elements);
  show.stage = box;
  show.navigation = true;
  show.sort = 1;
  show.save();
  const welcome = new easel.vtt.JournalEntry();
  welcome.name = "Welcome to your table";
  welcome.playerVisible = true;
  welcome.content = ["# Finding your way", "", "**Move** a token by dragging it, or select it and use the arrow keys.", "**Measure** with the ruler tool, or press R.", "**Ping** a spot by holding Alt and clicking.", "**Roll** by typing /r 2d6+3 in chat, or click a die above the message box.", "**Open a character** by double-clicking its token.", "", "# For the game master", "", "- Right-click a scene tab to edit it, rename it, or show it to players.", "- In edit mode, draw walls, doors, pillars and lights. Changes save as you go.", "- Drag a character from the sidebar onto the map to place its token.", "- Drop an image file on the map to place it as a token, or as scenery while editing.", "- Open the stage scene to try staged dialogue with toggles."].join("\n");
  welcome.save();
});
