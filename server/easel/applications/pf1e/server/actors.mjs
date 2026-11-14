const copy = (value) => JSON.parse(JSON.stringify(value === undefined ? null : value));
const list = (value) => (Array.isArray(value) ? value : []);
const ABILITY = "(str|dex|con|int|wis|cha)";
const SIZES = ["fine", "diminutive", "tiny", "small", "medium", "large", "huge", "gargantuan", "colossal"];

export const uid = () => "u" + Easel.Random.integer(1, 2147483647).toString(36);

const whole = (low, high) => (value) => {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error("That needs to be a number.");
  return Math.max(low, Math.min(high, Math.trunc(number)));
};
const amount = (low, high) => (value) => {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error("That needs to be a number.");
  return Math.max(low, Math.min(high, Math.round(number * 100) / 100));
};
const text = (limit) => (value) => String(value === null || value === undefined ? "" : value).slice(0, limit);
const flag = (value) => !!value;
const score = (value) => (value === null || value === "" || value === "-" ? null : whole(0, 99)(value));
const oneOf = (values) => (value) => {
  if (!values.includes(value)) throw new Error("Choose one of: " + values.join(", ") + ".");
  return value;
};
const SKILL = "[a-z]{3}(?::[a-z0-9-]{1,30})?";

const SETTABLE = [
  [new RegExp("^abilities\\." + ABILITY + "\\.base$"), score],
  [new RegExp("^abilities\\." + ABILITY + "\\.(damage|drain)$"), whole(0, 99)],
  [/^hp\.(damage|nonlethal|temp)$/, whole(0, 99999)],
  [/^hp\.stable$/, flag],
  [new RegExp("^skills\\." + SKILL + "\\.ranks$"), whole(0, 40)],
  [new RegExp("^skills\\." + SKILL + "\\.misc$"), whole(-99, 99)],
  [new RegExp("^skills\\." + SKILL + "\\.classSkill$"), flag],
  [new RegExp("^skills\\." + SKILL + "\\.label$"), text(40)],
  [/^details\.(alignment|deity|gender|age|height|weight|languages|homeland|player|race)$/, text(200)],
  [/^notes$/, text(20000)],
  [/^currency\.(pp|gp|sp|cp)$/, whole(0, 99999999)],
  [/^xp$/, whole(0, 99999999)],
  [/^speed\.(land|fly|swim|climb|burrow)$/, whole(0, 1000)],
  [/^favored\.(hp|skill)$/, whole(0, 40)],
  [/^size$/, oneOf(SIZES)],
  [/^toggles\.[A-Za-z0-9:_-]{1,60}$/, flag],
  [/^casting\.[A-Za-z0-9_]{1,30}\.slotBonus\.[1-9]$/, whole(0, 9)],
  [/^casting\.[A-Za-z0-9_]{1,30}\.used\.[0-9]$/, whole(0, 99)],
  [/^uses\.[A-Za-z0-9:_ '()-]{1,90}$/, whole(0, 999)],
];

export function setPath(doc, path, value) {
  const rule = SETTABLE.find(([pattern]) => pattern.test(path));
  if (!rule) throw new Error("A character sheet has no field called " + path + ".");
  const parts = path.split(".");
  let target = doc;
  if (parts[0] === "uses" || parts[0] === "toggles") {
    doc[parts[0]] = doc[parts[0]] && typeof doc[parts[0]] === "object" ? doc[parts[0]] : {};
    doc[parts[0]][parts.slice(1).join(".")] = rule[1](value);
    return doc;
  }
  for (const part of parts.slice(0, -1)) {
    if (!target[part] || typeof target[part] !== "object") target[part] = {};
    target = target[part];
  }
  target[parts[parts.length - 1]] = rule[1](value);
  return doc;
}

const ITEM_FIELDS = {
  name: text(120),
  quantity: amount(0, 99999),
  weight: amount(0, 99999),
  price: amount(0, 99999999),
  equipped: flag,
  masterwork: flag,
  enhancement: whole(0, 10),
  description: text(4000),
  "weapon.damage": (value) => {
    const dice = String(value).replace(/\s+/g, "").toLowerCase();
    if (!/^(\d{1,2}d\d{1,3}|\d{1,3})$/.test(dice)) throw new Error("Weapon damage looks like 1d8 or 2d6.");
    return dice;
  },
  "weapon.critRange": whole(2, 20),
  "weapon.critMult": whole(2, 6),
  "weapon.damageType": text(40),
  "weapon.strRating": whole(0, 20),
  "weapon.offhand": flag,
  "weapon.range": whole(0, 2000),
  "armor.bonus": whole(0, 30),
  "armor.maxDex": (value) => (value === null || value === "" ? null : whole(0, 20)(value)),
  "armor.acp": whole(-20, 0),
  "armor.spellFailure": whole(0, 100),
  "uses.used": whole(0, 9999),
  "uses.max": whole(0, 9999),
};

export function updateItem(doc, itemUid, changes) {
  const item = list(doc.items).find((entry) => entry.uid === itemUid);
  if (!item) throw new Error("That item is not carried.");
  for (const [key, value] of Object.entries(changes || {})) {
    const rule = ITEM_FIELDS[key];
    if (!rule) throw new Error("An item has no " + key + ".");
    const [branch, leaf] = key.split(".");
    if (leaf) {
      if (!item[branch] || typeof item[branch] !== "object") throw new Error("This item has no " + branch + " statistics.");
      item[branch][leaf] = rule(value);
    } else item[key] = rule(value);
  }
  if (changes && changes.equipped && (item.type === "armor" || item.type === "shield")) for (const other of doc.items) if (other !== item && other.type === item.type) other.equipped = false;
  return item;
}

export function itemFrom(entry, quantity = 1) {
  if (!entry || entry.kind !== "item") throw new Error("That is not an item.");
  const item = { uid: uid(), entryId: entry.id, name: entry.name, type: entry.type || "gear", quantity: Math.max(1, Number(quantity) || 1), weight: Number(entry.weight) || 0, price: Number(entry.price) || 0, equipped: false, enhancement: 0, masterwork: false, slot: entry.slot || "", description: entry.description || "" };
  for (const key of ["weapon", "armor", "changes", "defenses", "flags", "use", "uses"]) if (entry[key] !== undefined) item[key] = copy(entry[key]);
  return item;
}

function substitute(value, choice) {
  const key = choice.toLowerCase().replace(/[^a-z0-9]/g, "_");
  if (typeof value === "string") return value.split("{choiceKey}").join(key).split("{choice}").join(choice.toLowerCase());
  if (Array.isArray(value)) return value.map((entry) => substitute(entry, choice));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([name, entry]) => [name, substitute(entry, choice)]));
  return value;
}

export function featFrom(entry, options = {}, system = null) {
  if (!entry || entry.kind !== "feat") throw new Error("That is not a feat.");
  const feat = { uid: uid(), entryId: entry.id, name: entry.name, type: entry.type || "General", text: entry.benefit || "", prerequisites: entry.prerequisites || "" };
  for (const key of ["changes", "flags", "weapons", "armors", "defenses"]) if (entry[key] !== undefined) feat[key] = copy(entry[key]);
  if (entry.choice) {
    const choice = String(options.choice || "").trim().slice(0, 60);
    if (!choice) throw new Error(entry.name + " needs a choice: " + entry.choice.label + ".");
    let label = choice;
    if (entry.choice.kind === "skill" && system) {
      const base = system.skills[choice.split(":")[0]];
      if (!base) throw new Error("Choose a skill for " + entry.name + ".");
      label = choice.includes(":") ? base.name + " (" + choice.split(":")[1] + ")" : base.name;
    }
    feat.name = entry.name + " (" + label + ")";
    feat.choice = choice;
    for (const key of ["changes", "weapons"]) if (feat[key]) feat[key] = substitute(feat[key], choice);
  }
  return feat;
}

export function spellFrom(entry, listName, level) {
  if (!entry || entry.kind !== "spell") throw new Error("That is not a spell.");
  const levels = entry.levels || {};
  const found = level !== undefined && level !== null && level !== "" ? Number(level) : levels[listName] !== undefined ? levels[listName] : entry.level;
  if (!Number.isInteger(found) || found < 0 || found > 9) throw new Error("Choose a spell level from 0 to 9 for " + entry.name + ".");
  return { uid: uid(), entryId: entry.id, name: entry.name, level: found, school: entry.school || "", offList: levels[listName] === undefined };
}

export function buffFrom(entry, options = {}) {
  if (!entry || entry.kind !== "buff") throw new Error("That is not an effect.");
  const buff = { uid: uid(), entryId: entry.id, name: entry.name, active: true, text: entry.text || "", level: Math.max(1, Math.min(40, Math.trunc(Number(options.level) || 1))), leveled: !!entry.leveled };
  for (const key of ["changes", "flags", "defenses"]) if (entry[key] !== undefined) buff[key] = copy(entry[key]);
  if (options.rounds !== undefined && options.rounds !== null && options.rounds !== "" && Number(options.rounds) > 0) buff.rounds = Math.min(100000, Math.trunc(Number(options.rounds)));
  return buff;
}

export function raceFor(entry, options = {}) {
  if (!entry || entry.kind !== "race") throw new Error("That is not a race.");
  const race = { entryId: entry.id, name: entry.name, traits: copy(entry.traits || []), changes: copy(entry.changes || []) };
  for (const key of ["flags", "senses", "weapons", "defenses", "classSkills", "naturalAttacks"]) if (entry[key] !== undefined) race[key] = copy(entry[key]);
  if (entry.choice === "ability") {
    const ability = String(options.ability || "");
    if (!/^(str|dex|con|int|wis|cha)$/.test(ability)) throw new Error("Choose which ability score gets the +2 for " + entry.name + ".");
    race.changes.push({ target: ability, type: "racial", value: 2 });
    race.ability = ability;
  }
  return race;
}

export function applyRace(doc, entry, options) {
  doc.race = raceFor(entry, options);
  doc.size = SIZES.includes(entry.size) ? entry.size : "medium";
  doc.speed = { ...(doc.speed || {}), land: Number(entry.speed) || 30 };
  if (entry.languages && !(doc.details && doc.details.languages)) doc.details = { ...(doc.details || {}), languages: entry.languages };
  return doc;
}

export function removeFrom(doc, name, entryUid) {
  if (!["items", "feats", "features", "buffs"].includes(name)) throw new Error("Nothing can be removed from " + name + ".");
  const before = list(doc[name]).length;
  doc[name] = list(doc[name]).filter((entry) => entry.uid !== entryUid);
  if (doc[name].length === before) throw new Error("That is no longer on the sheet.");
  return doc;
}

export function prepare(doc, derived, key, spellUid) {
  const caster = list(derived.casting).find((entry) => entry.key === key);
  if (!caster || caster.type !== "prepared") throw new Error("This class does not prepare spells.");
  const state = doc.casting[key] || (doc.casting[key] = { spells: [], prepared: [], used: {} });
  const spell = list(state.spells).find((entry) => entry.uid === spellUid);
  if (!spell) throw new Error("Add the spell to the list before preparing it.");
  const row = caster.levels.find((entry) => entry.level === spell.level);
  if (!row || !row.able || !row.prepares) throw new Error("No level " + spell.level + " spells can be prepared yet.");
  state.prepared = list(state.prepared);
  if (state.prepared.filter((entry) => entry.level === spell.level).length >= row.prepares) throw new Error("Every level " + spell.level + " slot is already filled.");
  state.prepared.push({ uid: uid(), spellUid, entryId: spell.entryId, name: spell.name, level: spell.level, cast: false });
  return doc;
}

export function summary(doc, derived) {
  if (doc.mode === "statblock") {
    const stat = doc.statblock || {};
    return ["CR " + (stat.cr || "—"), [stat.type, list(stat.subtypes).length ? "(" + stat.subtypes.join(", ") + ")" : ""].filter(Boolean).join(" ")].filter(Boolean).join(" · ");
  }
  const classes = list(derived.levels).map((level) => level.name + " " + level.level).join(" / ");
  return [doc.race ? doc.race.name : "", classes || "No class yet"].filter(Boolean).join(" ");
}

export function fromMonster(entry, blank) {
  if (!entry || entry.kind !== "monster") throw new Error("That is not a monster.");
  return { ...blank, kind: "npc", mode: "statblock", size: SIZES.includes(entry.size) ? entry.size : "medium", statblock: copy(entry.statblock), entryId: entry.id };
}

export const TOKEN_SCALE = { fine: 1, diminutive: 1, tiny: 1, small: 1, medium: 1, large: 2, huge: 3, gargantuan: 4, colossal: 6 };

const LIST_KEYS = ["changes", "flags", "resources", "attacks", "toggles", "toggle", "when", "use", "defenses", "weapons", "armors", "classSkills", "senses", "naturalAttacks", "group", "tags"];

export function addToList(doc, entry, options = {}) {
  const kind = entry.kind;
  doc.lists = doc.lists && typeof doc.lists === "object" ? doc.lists : {};
  doc.lists[kind] = list(doc.lists[kind]);
  if (!entry.repeatable && doc.lists[kind].some((existing) => existing.entryId === entry.id)) throw new Error(entry.name + " is already on the sheet.");
  const { id, kind: ignored, pack, source, ...rest } = copy(entry);
  void ignored;
  void pack;
  void source;
  const added = { ...rest, uid: uid(), entryId: id, name: entry.name, text: entry.text || entry.description || entry.benefit || "" };
  if (options.level !== undefined) added.level = Math.max(1, Math.min(40, Math.trunc(Number(options.level)) || 1));
  doc.lists[kind].push(added);
  return undefined;
}
