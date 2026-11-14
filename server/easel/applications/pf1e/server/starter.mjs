import { tavern } from "./demo.mjs";

const copy = (value) => JSON.parse(JSON.stringify(value === undefined ? null : value));
const SAMPLES = "/assets/easel.vtt.table-0.1.0/client/samples/";

const HEROES = {
  Aldric: {
    race: ["race:human", { ability: "str" }],
    classId: "class:fighter",
    abilities: { str: 16, dex: 13, con: 14, int: 10, wis: 12, cha: 8 },
    feats: [["Power Attack"], ["Weapon Focus", { choice: "longsword" }], ["Toughness"], ["Cleave"]],
    items: [["Longsword", true], ["Chainmail", true], ["Heavy steel shield", true], ["Light crossbow", false], ["Crossbow bolts (10)", false], ["Backpack", false], ["Rope, hemp (50 ft.)", false], ["Potion of cure light wounds", false, 2]],
    skills: { clm: 2, itm: 2, sur: 2 },
    details: { alignment: "LG" },
    currency: { gp: 35 },
  },
  Mira: {
    race: ["race:elf", {}],
    classId: "class:wizard",
    abilities: { str: 8, dex: 14, con: 12, int: 16, wis: 12, cha: 10 },
    feats: [["Improved Initiative"]],
    items: [["Quarterstaff", true], ["Dagger", false], ["Spellbook", false], ["Spell component pouch", false], ["Wand of magic missile", false]],
    skills: { spl: 2, kar: 2, kpl: 2, khi: 2, per: 2, apr: 2 },
    spells: ["Detect Magic", "Light", "Ray of Frost", "Mage Hand", "Read Magic", "Prestidigitation", "Acid Splash", "Magic Missile", "Mage Armor", "Sleep", "Burning Hands", "Shield", "Color Spray", "Grease"],
    prepared: ["Detect Magic", "Light", "Ray of Frost", "Mage Hand", "Magic Missile", "Magic Missile", "Mage Armor"],
    details: { alignment: "NG" },
    currency: { gp: 60 },
  },
  Pip: {
    race: ["race:halfling", {}],
    classId: "class:rogue",
    abilities: { str: 10, dex: 16, con: 12, int: 14, wis: 10, cha: 12 },
    feats: [["Weapon Finesse"]],
    items: [["Rapier", true], ["Shortbow", true], ["Arrows (20)", false], ["Leather", true], ["Dagger", false], ["Thieves' tools", false]],
    skills: { acr: 2, dev: 2, ste: 2, per: 2, slt: 2, blf: 2, clm: 2, esc: 2, dip: 2, sen: 2 },
    details: { alignment: "CG" },
    currency: { gp: 48 },
  },
};

const MONSTERS = { "Cellar Rat": "monster:dire-rat", "The Collector": "monster:wight" };

function hero(name, engine, sheets) {
  const plan = HEROES[name];
  let doc = engine.blank("character");
  for (const [ability, score] of Object.entries(plan.abilities)) doc.abilities[ability].base = score;
  sheets.applyRace(doc, engine.library.require(plan.race[0], "race"), plan.race[1]);
  for (let level = 0; level < 2; level++) doc = engine.addLevel(doc, engine.library.require(plan.classId, "class"), { hp: "auto" }).doc;
  for (const [feat, options] of plan.feats) doc.feats.push(sheets.featFrom(engine.library.find("feat", feat), options || {}, engine.system));
  for (const [item, equipped, quantity] of plan.items) doc.items.push({ ...sheets.itemFrom(engine.library.find("item", item), quantity || 1), equipped: !!equipped });
  for (const [skill, ranks] of Object.entries(plan.skills)) doc.skills[skill] = { ranks, misc: 0 };
  doc.details = { ...doc.details, ...plan.details };
  doc.currency = { ...doc.currency, ...plan.currency };
  if (plan.spells) {
    const key = plan.classId.split(":")[1];
    const state = doc.casting[key] || (doc.casting[key] = { spells: [], prepared: [], used: {} });
    for (const spell of plan.spells) state.spells.push(sheets.spellFrom(engine.library.find("spell", spell), engine.library.require(plan.classId).casting.list));
    for (const spell of plan.prepared) sheets.prepare(doc, engine.derive(doc), key, state.spells.find((entry) => entry.name === spell).uid);
  }
  return doc;
}

export function populate({ engine, table, sheets, store }) {
  const geometry = Easel.Interfaces.create("easel.maps.geometry@1");
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
  const counts = {};
  for (const entry of tavern.tokens) {
    let actor = null;
    let doc = null;
    if (HEROES[entry.name]) doc = hero(entry.name, engine, sheets);
    else if (MONSTERS[entry.name]) doc = { ...sheets.fromMonster(engine.library.require(MONSTERS[entry.name], "monster"), engine.blank("npc")), spawned: true };
    if (doc) {
      counts[entry.name] = (counts[entry.name] || 0) + 1;
      actor = new easel.pf1e.Creature();
      actor.name = entry.name + (counts[entry.name] > 1 ? " " + counts[entry.name] : "");
      actor.portrait = SAMPLES + entry.image;
      actor.tokenImage = SAMPLES + entry.image;
      store(actor, doc);
    }
    const scale = doc ? sheets.TOKEN_SCALE[doc.size] || 1 : 1;
    const token = new easel.vtt.Token();
    token.sceneId = scene.id;
    token.groundId = ground.id;
    token.name = actor ? actor.name : entry.name;
    token.image = SAMPLES + entry.image;
    token.x = entry.x;
    token.y = entry.y;
    token.width = cell * scale;
    token.height = cell * scale;
    token.hidden = Boolean(entry.hidden);
    token.disposition = entry.disposition;
    token.vision = { sight: true, range: 0, light: entry.light ? { radius: entry.light, color: "#bfe0ff" } : null };
    if (actor) {
      token.actorId = actor.id;
      token.actorType = actor.type;
    }
    token.save();
  }
  const welcome = new easel.vtt.JournalEntry();
  welcome.name = "Welcome to your Pathfinder table";
  welcome.playerVisible = true;
  welcome.content = [
    "# Playing",
    "",
    "**Open a character** by double-clicking its token, or from the Characters tab.",
    "**Roll** by clicking any ability, save, skill or attack on the sheet. Hold Shift for a full attack.",
    "**Cast** from the Spells page: prepared spells are crossed off, spell slots are counted.",
    "**Apply damage or healing** by selecting tokens on the map, then clicking a button on a roll in chat.",
    "**Switch on** feats such as Power Attack, rage, sneak attack and spell effects on the Effects page.",
    "",
    "# For the game master",
    "",
    "- The Library tab holds monsters, items, spells, feats and effects. Drag a monster onto the map to place it.",
    "- Drag an item, spell, feat or effect onto an open sheet to add it.",
    "- Paste a stat block with Import to add any monster to the library.",
    "- Three starting characters are in the Characters tab. Right-click one to give it to a player.",
    "- Start an encounter from the Encounter tab; initiative rolls use each sheet.",
  ].join("\n");
  welcome.save();
  void table;
}
