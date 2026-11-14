import { ABILITIES, SIZES, carryingCapacity, loadOf, reducedSpeed, sizedDamage, iterativeAttacks, signed, copy } from "./tables.mjs";

const list = (value) => (Array.isArray(value) ? value : []);
const int = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : fallback);
const modifierOf = (score) => Math.floor((score - 10) / 2);
const part = (label, value, type = "") => ({ label, type, value });
const safe = (text) => String(text).replace(/[^A-Za-z0-9_]/g, "_");

export function blankCreature(kind = "character") {
  const abilities = {};
  for (const ability of ABILITIES) abilities[ability] = { base: 10, damage: 0, drain: 0 };
  return {
    kind,
    mode: "built",
    size: "medium",
    abilities,
    race: null,
    levels: [],
    hp: { damage: 0, nonlethal: 0, temp: 0, stable: false },
    skills: {},
    feats: [],
    features: [],
    items: [],
    buffs: [],
    conditions: [],
    casting: {},
    lists: {},
    resources: {},
    uses: {},
    toggles: {},
    speed: { land: 30 },
    favored: { hp: 0, skill: 0 },
    currency: { pp: 0, gp: 0, sp: 0, cp: 0 },
    xp: 0,
    details: { alignment: "", deity: "", gender: "", age: "", height: "", weight: "", languages: "" },
    notes: "",
    statblock: null,
  };
}

export function normalize(input, kind) {
  const base = blankCreature(kind || (input && input.kind) || "character");
  const doc = { ...base, ...copy(input || {}) };
  for (const ability of ABILITIES) doc.abilities[ability] = { ...base.abilities[ability], ...((input && input.abilities && input.abilities[ability]) || {}) };
  for (const key of ["hp", "speed", "favored", "currency", "details"]) doc[key] = { ...base[key], ...(doc[key] && typeof doc[key] === "object" ? doc[key] : {}) };
  for (const key of ["levels", "feats", "features", "items", "buffs", "conditions"]) doc[key] = list(doc[key]);
  for (const key of ["skills", "casting", "lists", "resources", "uses", "toggles"]) if (!doc[key] || typeof doc[key] !== "object" || Array.isArray(doc[key])) doc[key] = {};
  for (const key of Object.keys(doc.lists)) doc.lists[key] = list(doc.lists[key]);
  if (!SIZES[doc.size]) doc.size = "medium";
  return doc;
}

export class Context {
  constructor(engine, doc) {
    this.engine = engine;
    this.system = engine.system;
    this.doc = doc;
    this.statblock = doc.mode === "statblock";
    this.sources = [];
    this.flags = {};
    this.notes = [];
    this.proficiency = { weapons: new Set(), armor: new Set() };
    this.classSkills = new Set();
    this.senses = [];
    this.defenses = { dr: [], resist: {}, immune: [], vulnerable: [], sr: 0 };
    this.naturalAttacks = [];
    this.specialAttacks = [];
    this.resourceRules = [];
    this.toggleRules = [];
    this.resistance = [];
    this.features = [];
    this.classLevels = {};
    this.unarmed = "";
    this.data = {};
    this.state = {};
  }

  source(id, label, part, extra = {}) {
    if (!part) return;
    const source = { id: String(id), label: String(label), changes: list(part.changes), vars: extra.vars || {}, part };
    this.sources.push(source);
    Object.assign(this.flags, part.flags || {});
    for (const name of list(part.weapons)) this.proficiency.weapons.add(String(name).toLowerCase());
    for (const name of list(part.armors)) this.proficiency.armor.add(String(name).toLowerCase());
    for (const name of list(part.classSkills)) this.classSkills.add(String(name));
    for (const sense of list(part.senses)) if (!this.senses.includes(sense)) this.senses.push(sense);
    for (const attack of list(part.naturalAttacks)) this.naturalAttacks.push({ ...attack, source: label });
    list(part.attacks).forEach((attack, index) => this.specialAttacks.push({ attack, source, index }));
    for (const resource of list(part.resources)) if (resource && resource.id) this.resourceRules.push({ resource, source });
    for (const toggle of list(part.toggles)) if (toggle && toggle.id) this.toggleRules.push({ id: String(toggle.id), label: String(toggle.label || label) });
    const defenses = part.defenses || {};
    for (const entry of list(defenses.dr)) this.defenses.dr.push(entry);
    for (const [type, amount] of Object.entries(defenses.resist || {})) this.defenses.resist[type] = Math.max(this.defenses.resist[type] || 0, int(amount));
    for (const name of list(defenses.immune)) if (!this.defenses.immune.includes(name)) this.defenses.immune.push(name);
    for (const name of list(defenses.vulnerable)) if (!this.defenses.vulnerable.includes(name)) this.defenses.vulnerable.push(name);
    if (defenses.sr) this.resistance.push({ value: defenses.sr, vars: extra.vars });
  }

  number(value, vars) {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    if (typeof value !== "string" || !value.trim()) return 0;
    if (/^[+-]?\d+(\.\d+)?$/.test(value.trim())) return Number(value);
    try {
      const result = this.engine.formula.evaluate(value, vars ? { ...this.data, ...vars } : this.data);
      return typeof result === "boolean" ? Number(result) : Number.isFinite(result) ? result : 0;
    } catch {
      return 0;
    }
  }

  active(source, change, scope) {
    if (source.part.toggle && !this.doc.toggles[source.part.toggle]) return false;
    if (source.part.when && !this.number(source.part.when, scope)) return false;
    if (change) {
      if (change.toggle && !this.doc.toggles[change.toggle]) return false;
      if (change.when && !this.number(change.when, scope)) return false;
    }
    return true;
  }

  evaluate(targets, vars) {
    const wanted = new Set(targets);
    const found = [];
    for (const source of this.sources) {
      for (const change of source.changes) {
        if (!change || !wanted.has(change.target)) continue;
        const scope = { ...source.vars, ...(vars || {}) };
        if (!this.active(source, change, scope)) continue;
        if (change.note) {
          this.notes.push({ target: change.target, text: String(change.note), source: source.label });
          continue;
        }
        const raw = change.formula !== undefined ? change.formula : change.value;
        const value = Math.trunc(this.number(raw, scope));
        if (!value) continue;
        found.push({ key: String(change.type || "untyped"), value, source: source.id, label: source.label, target: change.target });
      }
    }
    return found;
  }

  dice(targets, vars) {
    const wanted = new Set(targets);
    const found = [];
    for (const source of this.sources) {
      for (const change of source.changes) {
        if (!change || !wanted.has(change.target)) continue;
        const scope = { ...source.vars, ...(vars || {}) };
        if (!this.active(source, change, scope)) continue;
        const count = change.count !== undefined ? Math.trunc(this.number(change.count, scope)) : 0;
        const formula = count > 0 ? count + "d" + int(change.die, 6) : typeof change.dice === "string" ? change.dice : "";
        if (formula) found.push({ formula, type: change.damageType || "", crit: false, label: source.label });
      }
    }
    return found;
  }

  stack(mods) {
    if (!mods.length) return { total: 0, parts: [] };
    const result = this.engine.stacking.resolve(mods, this.system.bonusTypes, "strongestBonusStackPenalties");
    return { total: result.total, parts: result.active.map((entry) => ({ label: entry.label, type: entry.key, value: entry.value })) };
  }

  total(targets, vars, extra = []) {
    return this.stack([...extra, ...this.evaluate(targets, vars)]);
  }
}

function collect(ctx) {
  const { doc, system, engine } = ctx;
  if (!ctx.statblock) {
    if (doc.race) ctx.source("race", doc.race.name || "Race", doc.race);
    for (const entry of doc.levels) {
      const id = String(entry.classId || "");
      const definition = engine.lookup(id) || {};
      const level = Math.max(0, int(entry.level));
      if (!level) continue;
      const key = safe(entry.key || id.split(":").pop() || "class");
      ctx.classLevels[key] = { level };
      const vars = { class: { level } };
      ctx.source("class:" + key, entry.name || definition.name || "Class", { changes: definition.changes, weapons: definition.weapons, armors: definition.armors, classSkills: definition.classSkills || entry.classSkills, flags: definition.flags, resources: definition.resources, attacks: definition.attacks, toggles: definition.toggles }, { vars });
      for (const feature of list(definition.features)) {
        if (int(feature.level, 1) > level) continue;
        if (feature.replacedAt && int(feature.replacedAt) <= level) continue;
        ctx.source("feature:" + key + ":" + (feature.id || feature.name), feature.name, feature, { vars });
        ctx.features.push({ key: key + ":" + (feature.id || feature.name), name: feature.name, level: int(feature.level, 1), source: entry.name || definition.name || "", text: feature.text || "", uses: feature.uses || null, roll: feature.roll || null, use: feature.use || null, toggle: feature.toggle || "", vars });
        if (feature.unarmed) ctx.unarmed = feature.unarmed[Math.min(level, feature.unarmed.length) - 1] || ctx.unarmed;
      }
    }
    for (const feat of doc.feats) ctx.source("feat:" + (feat.uid || feat.id || feat.name), feat.name || "Feat", feat);
    for (const feature of doc.features) {
      ctx.source("feature:" + (feature.uid || feature.name), feature.name || "Feature", feature);
      ctx.features.push({ key: "own:" + (feature.uid || feature.name), uid: feature.uid, name: feature.name, level: 0, source: feature.source || "", text: feature.text || "", uses: feature.uses || null, roll: feature.roll || null, use: feature.use || null, toggle: feature.toggle || "", vars: {}, own: true });
    }
    for (const item of doc.items) {
      if (!item || !item.equipped) continue;
      const vars = { item: { enhancement: int(item.enhancement) } };
      if (["armor", "shield", "weapon", "ammo"].includes(item.type)) {
        if (list(item.changes).length || item.defenses || item.resources) ctx.source("item:" + item.uid, item.name, { changes: item.changes, defenses: item.defenses, resources: item.resources }, { vars });
      } else ctx.source("item:" + item.uid, item.name, item, { vars });
    }
  }
  for (const [kind, entries] of Object.entries(doc.lists)) for (const entry of entries) if (entry) ctx.source("list:" + kind + ":" + (entry.uid || entry.name), entry.name || kind, entry, { vars: { entry: { level: int(entry.level, 1) } } });
  for (const buff of doc.buffs) if (buff && buff.active) ctx.source("buff:" + (buff.entryId || buff.name), buff.name || "Effect", buff, { vars: { buff: { level: int(buff.level, 1) } } });
  for (const id of doc.conditions) {
    const condition = system.conditions[id];
    if (condition) ctx.source("condition:" + id, condition.name, condition);
  }
  for (const resource of list(system.resources)) if (resource && resource.id) ctx.resourceRules.push({ resource, source: { id: "system", label: system.name || "Rules", vars: {}, part: {} } });
  engine.run("sources", ctx);
}

function baseData(ctx, extra) {
  const { doc } = ctx;
  const data = { level: 0, hd: 0, bab: 0, classes: ctx.classLevels, toggles: {}, resources: {}, ranks: {}, size: SIZES[doc.size].step, armor: { worn: 0, shield: 0, category: 0 }, load: 0, ...extra };
  for (const ability of ABILITIES) data[ability] = { mod: 0, score: 10 };
  for (const source of ctx.sources) {
    if (source.part.toggle) data.toggles[safe(source.part.toggle)] = 0;
    for (const change of source.changes) if (change && change.toggle) data.toggles[safe(change.toggle)] = 0;
  }
  for (const rule of ctx.toggleRules) data.toggles[safe(rule.id)] = 0;
  for (const [id, on] of Object.entries(doc.toggles)) data.toggles[safe(id)] = on ? 1 : 0;
  for (const rule of ctx.resourceRules) data.resources[safe(rule.resource.id)] = Math.max(0, int(doc.resources[rule.resource.id]));
  for (const id of Object.keys(ctx.system.skills)) data.ranks[id] = 0;
  for (const [id, raw] of Object.entries(doc.skills)) data.ranks[safe(id)] = Math.max(0, int(raw && raw.ranks));
  return data;
}

function levels(derived, ctx) {
  const { doc, system, engine } = ctx;
  const state = ctx.state;
  if (ctx.statblock) {
    const stat = doc.statblock || {};
    const hd = Math.max(1, int((stat.hp || {}).hd, 1));
    Object.assign(derived, { level: hd, hd, levels: [], cr: stat.cr === undefined ? "" : String(stat.cr), xp: int(stat.xp) });
    state.bab = int(stat.bab);
    ctx.data = baseData(ctx, { level: hd, hd, bab: state.bab });
    return;
  }
  let hd = 0;
  let bab = 0;
  let rolled = 0;
  const saveBase = {};
  for (const save of Object.keys(system.saves)) saveBase[save] = 0;
  const found = [];
  for (const entry of doc.levels) {
    const level = Math.max(0, int(entry.level));
    if (!level) continue;
    const definition = engine.lookup(String(entry.classId || "")) || entry;
    hd += level;
    bab += (system.progressions.bab[definition.bab || entry.bab] || system.progressions.bab.poor)(level);
    for (const save of Object.keys(system.saves)) saveBase[save] += (system.progressions.save[(definition.saves || entry.saves || {})[save]] || system.progressions.save.poor)(level);
    rolled += list(entry.hp).slice(0, level).reduce((sum, value) => sum + int(value), 0);
    found.push({ key: safe(entry.key || String(entry.classId).split(":").pop()), classId: entry.classId, name: entry.name || definition.name || "Class", level, hd: int(definition.hd || entry.hd, 8), ranks: int(definition.ranks !== undefined ? definition.ranks : entry.ranks, 2) });
  }
  Object.assign(derived, { levels: found, level: hd, hd });
  Object.assign(state, { bab, rolled, saveBase });
  ctx.data = baseData(ctx, { level: hd, hd, bab });
}

function gear(derived, ctx) {
  const { doc } = ctx;
  let weight = 0;
  let armor = null;
  let shield = null;
  const weapons = [];
  const fitted = { fine: 0.1, diminutive: 0.1, tiny: 0.1, small: 0.5, medium: 1, large: 2, huge: 5, gargantuan: 8, colossal: 12 }[doc.size] || 1;
  if (!ctx.statblock) {
    for (const item of doc.items) {
      if (!item) continue;
      const scale = ["weapon", "armor", "shield"].includes(item.type) && item.sized !== false ? fitted : 1;
      weight += (Number(item.weight) || 0) * scale * Math.max(0, Number(item.quantity === undefined ? 1 : item.quantity) || 0);
      if (!item.equipped) continue;
      if (item.type === "armor" && !armor) armor = item;
      else if (item.type === "shield" && !shield) shield = item;
      else if (item.type === "weapon") weapons.push(item);
    }
    weight += Math.floor((int(doc.currency.pp) + int(doc.currency.gp) + int(doc.currency.sp) + int(doc.currency.cp)) / 50);
  }
  ctx.state.gear = { weight: Math.round(weight * 100) / 100, armor, shield, weapons };
  const categories = { light: 1, medium: 2, heavy: 3 };
  ctx.data.armor = { worn: armor ? 1 : 0, shield: shield ? 1 : 0, category: armor ? categories[(armor.armor || {}).category] || 1 : 0 };
}

function abilities(derived, ctx) {
  const { doc } = ctx;
  const stat = ctx.statblock ? doc.statblock || {} : null;
  const found = {};
  for (const ability of ABILITIES) {
    const raw = doc.abilities[ability] || {};
    let base = raw.base;
    if (stat) base = stat.abilities && stat.abilities[ability] !== undefined ? stat.abilities[ability] : 10;
    const damage = Math.max(0, int(raw.damage));
    const drain = Math.max(0, int(raw.drain));
    if (base === null || base === undefined || base === "") {
      found[ability] = { base: null, score: null, mod: 0, baseMod: 0, damage, drain, parts: [] };
      continue;
    }
    const stacked = ctx.total([ability]);
    const score = Math.max(0, int(base, 10) + stacked.total - drain);
    found[ability] = { base: int(base, 10), score, mod: modifierOf(score) - Math.floor(damage / 2), baseMod: modifierOf(int(base, 10)), damage, drain, parts: [part("Base", int(base, 10)), ...stacked.parts] };
  }
  derived.abilities = found;
  for (const ability of ABILITIES) ctx.data[ability] = { score: found[ability].score === null ? 0 : found[ability].score, mod: found[ability].mod };
  derived.bab = ctx.state.bab + ctx.total(["bab"]).total;
  ctx.data.bab = derived.bab;
  ctx.state.delta = {};
  for (const ability of ABILITIES) ctx.state.delta[ability] = found[ability].mod - found[ability].baseMod;
}

function resources(derived, ctx) {
  derived.resources = {};
  for (const { resource, source } of ctx.resourceRules) {
    if (source.part && !ctx.active(source, null, source.vars)) continue;
    const id = String(resource.id);
    const max = Math.max(0, Math.trunc(ctx.number(resource.max, source.vars)) + ctx.total(["resource." + id], source.vars).total);
    const previous = derived.resources[id];
    const value = Math.max(0, int(ctx.doc.resources[id]));
    derived.resources[id] = { id, name: resource.name || id, value, max: previous ? Math.max(previous.max, max) : max, left: Math.max(0, (previous ? Math.max(previous.max, max) : max) - value), counts: resource.counts === "up" ? "up" : "down", recover: resource.recover || { rest: "all" }, unit: resource.unit || "", text: resource.text || "", source: source.label };
  }
}

function encumbrance(derived, ctx) {
  if (ctx.statblock) {
    Object.assign(derived, { encumbrance: null, acp: 0, maxDex: null, spellFailure: 0, armorPenaltyToAttacks: 0, armor: { worn: "", shield: "", proficient: true } });
    ctx.state.acMods = [];
    return;
  }
  const { doc } = ctx;
  const { armor, shield, weight } = ctx.state.gear;
  const strength = derived.abilities.str.score === null ? 10 : derived.abilities.str.score;
  const capacity = carryingCapacity(strength + ctx.total(["carry"]).total, doc.size, ctx.flags.quadruped ? 4 : 2);
  const load = loadOf(weight, capacity);
  ctx.data.load = { light: 0, medium: 1, heavy: 2, overloaded: 3 }[load];
  derived.encumbrance = { weight, ...capacity, load };
  const armorData = armor ? armor.armor || {} : {};
  const shieldData = shield ? shield.armor || {} : {};
  const acMods = [];
  if (armor) acMods.push({ key: "armor", value: int(armorData.bonus) + int(armor.enhancement), source: "item:" + armor.uid, label: armor.name });
  if (shield) acMods.push({ key: "shield", value: int(shieldData.bonus) + int(shield.enhancement), source: "item:" + shield.uid, label: shield.name });
  const dexLimits = [];
  if (armor && armorData.maxDex !== null && armorData.maxDex !== undefined) dexLimits.push(int(armorData.maxDex) + ctx.total(["armorMaxDex"]).total);
  if (shield && shieldData.maxDex !== null && shieldData.maxDex !== undefined) dexLimits.push(int(shieldData.maxDex));
  if (load === "medium") dexLimits.push(3);
  if (load === "heavy" || load === "overloaded") dexLimits.push(1);
  const relief = ctx.total(["acp"]).total;
  const itemAcp = (item, data) => (item ? Math.min(0, int(data.acp) + (item.masterwork || int(item.enhancement) > 0 ? 1 : 0)) : 0);
  const armorAcp = Math.min(0, itemAcp(armor, armorData) + (armor ? relief : 0)) + itemAcp(shield, shieldData);
  const loadAcp = load === "medium" ? -3 : load === "heavy" || load === "overloaded" ? -6 : 0;
  derived.acp = Math.min(armorAcp, loadAcp);
  derived.maxDex = dexLimits.length ? Math.min(...dexLimits) : null;
  derived.spellFailure = (armor ? int(armorData.spellFailure) : 0) + (shield ? int(shieldData.spellFailure) : 0);
  const armorKnown = !armor || ctx.flags.allArmor || ctx.proficiency.armor.has(String(armorData.category || "light")) || ctx.proficiency.armor.has(String(armor.name || "").toLowerCase());
  const shieldKnown = !shield || ctx.flags.allArmor || ctx.proficiency.armor.has(shieldData.category === "tower" ? "tower" : "shields");
  derived.armorPenaltyToAttacks = (armorKnown ? 0 : itemAcp(armor, armorData)) + (shieldKnown ? 0 : itemAcp(shield, shieldData));
  derived.armor = { worn: armor ? armor.name : "", shield: shield ? shield.name : "", proficient: armorKnown && shieldKnown };
  ctx.state.acMods = acMods;
  ctx.state.load = load;
}

function hitPointStatus(current, nonlethal, conScore, stable) {
  if (conScore !== null && current <= -conScore) return "dead";
  if (conScore === null && current <= 0) return "destroyed";
  if (current < 0) return stable ? "stable" : "dying";
  if (current === 0) return "disabled";
  if (nonlethal > current) return "unconscious";
  if (nonlethal === current) return "staggered";
  return "ok";
}

function hitPoints(derived, ctx) {
  const { doc } = ctx;
  const found = derived.abilities;
  const hd = derived.hd;
  const bonus = ctx.total(["hp"]);
  let max;
  let parts;
  let conScore;
  if (ctx.statblock) {
    const stat = doc.statblock || {};
    const ability = ctx.flags.hpAbility || (found.con.score === null ? "cha" : "con");
    max = Math.max(1, int((stat.hp || {}).max, 1) + ctx.state.delta[ability] * hd + bonus.total);
    parts = [part("Stat block", int((stat.hp || {}).max, 1)), ...bonus.parts];
    conScore = found.con.score;
  } else {
    const mod = ctx.flags.hpAbility ? found[ctx.flags.hpAbility].mod : found.con.mod;
    const perLevel = hd ? Math.max(hd, ctx.state.rolled + mod * hd) : 0;
    max = Math.max(hd ? 1 : 0, perLevel + int(doc.favored.hp) + bonus.total);
    parts = [part("Hit dice", ctx.state.rolled), part("Constitution", mod * hd), ...(int(doc.favored.hp) ? [part("Favored class", int(doc.favored.hp))] : []), ...bonus.parts];
    conScore = ctx.flags.hpAbility ? null : found.con.score;
  }
  const current = max - Math.max(0, int(doc.hp.damage));
  const forced = ctx.total(["hp.nonlethal"]);
  const nonlethal = Math.max(0, int(doc.hp.nonlethal)) + Math.max(0, forced.total);
  derived.hp = { max, current, temp: Math.max(0, int(doc.hp.temp)), nonlethal, lasting: Math.max(0, forced.total), damage: Math.max(0, int(doc.hp.damage)), status: hitPointStatus(current, nonlethal, conScore, !!doc.hp.stable), parts };
  if (ctx.statblock) derived.hp.formula = String(((doc.statblock || {}).hp || {}).formula || "");
}

function armorClass(derived, ctx) {
  const loseDex = !!ctx.flags.loseDex;
  const size = SIZES[ctx.doc.size].attack;
  const changes = [...ctx.state.acMods, ...(!ctx.statblock && size ? [{ key: "size", value: size, source: "size", label: "Size" }] : []), ...ctx.evaluate(["ac"])];
  const usable = loseDex ? changes.filter((mod) => mod.key !== "dodge") : changes;
  const all = ctx.stack(usable);
  const touch = ctx.stack(usable.filter((mod) => !["armor", "shield", "natural", "naturalEnhancement"].includes(mod.key)));
  const flat = ctx.stack(usable.filter((mod) => mod.key !== "dodge"));
  if (ctx.statblock) {
    const ac = (ctx.doc.statblock || {}).ac || {};
    const delta = ctx.state.delta.dex;
    const total = int(ac.total, 10);
    const flatBase = int(ac.flat, total);
    const touchBase = int(ac.touch, total);
    derived.ac = loseDex ? { total: flatBase + Math.min(0, delta) + all.total, touch: touchBase - (total - flatBase) + Math.min(0, delta) + touch.total, flat: flatBase + Math.min(0, delta) + flat.total } : { total: total + delta + all.total, touch: touchBase + delta + touch.total, flat: flatBase + Math.min(0, delta) + flat.total };
    Object.assign(derived.ac, { dex: derived.abilities.dex.mod, parts: [part("Stat block", total), ...(delta ? [part("Dexterity change", delta)] : []), ...all.parts], notes: String(ac.notes || "") });
    return;
  }
  let dex = derived.abilities.dex.mod;
  if (derived.maxDex !== null) dex = Math.min(dex, derived.maxDex);
  if (loseDex) dex = Math.min(dex, 0);
  derived.ac = { total: 10 + dex + all.total, touch: 10 + dex + touch.total, flat: 10 + Math.min(dex, 0) + flat.total, dex, parts: [part("Base", 10), part("Dexterity", dex), ...all.parts] };
  if (ctx.flags.uncannyDodge && !loseDex) derived.ac.flat = derived.ac.total;
}

function saves(derived, ctx) {
  const { system } = ctx;
  derived.saves = {};
  for (const [save, rule] of Object.entries(system.saves)) {
    const stacked = ctx.total([save, "saves"]);
    if (ctx.statblock) {
      const base = int((((ctx.doc.statblock || {}).saves) || {})[save]);
      const delta = ctx.state.delta[rule.ability];
      derived.saves[save] = { total: base + delta + stacked.total, base, parts: [part("Stat block", base), ...(delta ? [part(system.abilityNames[rule.ability] + " change", delta)] : []), ...stacked.parts] };
    } else {
      const ability = derived.abilities[rule.ability].mod;
      const base = ctx.state.saveBase[save];
      derived.saves[save] = { total: base + ability + stacked.total, base, parts: [part("Base", base), part(system.abilityNames[rule.ability], ability), ...stacked.parts] };
    }
  }
}

function initiative(derived, ctx) {
  const stacked = ctx.total(["init"]);
  if (ctx.statblock) {
    const base = int((ctx.doc.statblock || {}).init);
    derived.init = { total: base + ctx.state.delta.dex + stacked.total, parts: [part("Stat block", base), ...stacked.parts] };
  } else derived.init = { total: derived.abilities.dex.mod + stacked.total, parts: [part("Dexterity", derived.abilities.dex.mod), ...stacked.parts] };
}

function speed(derived, ctx) {
  const { doc } = ctx;
  if (ctx.statblock) {
    const stat = (doc.statblock || {}).speed || {};
    derived.speed = { base: int(stat.land, 30), land: int(stat.land, 30) + ctx.total(["speed"]).total };
    if (ctx.flags.halfSpeed) derived.speed.land = Math.floor(derived.speed.land / 2 / 5) * 5;
    for (const mode of ["fly", "swim", "climb", "burrow"]) if (int(stat[mode])) derived.speed[mode] = int(stat[mode]);
    if (ctx.flags.immobile) for (const mode of Object.keys(derived.speed)) derived.speed[mode] = 0;
    derived.speed.notes = String(stat.notes || "");
    return;
  }
  const load = ctx.state.load;
  const base = int(doc.speed.land !== undefined ? doc.speed.land : 30);
  let land = base + ctx.total(["speed"]).total;
  const slowed = !ctx.flags.steadySpeed && (ctx.data.armor.category > int(ctx.flags.armorSpeed, 1) || load === "medium" || load === "heavy");
  if (slowed) land = reducedSpeed(land);
  if (load === "overloaded") land = Math.min(land, 5);
  if (ctx.flags.halfSpeed) land = Math.floor(land / 2 / 5) * 5;
  if (ctx.flags.immobile) land = 0;
  derived.speed = { land, base };
  for (const mode of ["fly", "swim", "climb", "burrow"]) if (int(doc.speed[mode])) derived.speed[mode] = ctx.flags.immobile ? 0 : int(doc.speed[mode]) + ctx.total(["speed." + mode]).total;
}

function skills(derived, ctx) {
  const { doc, system } = ctx;
  const found = derived.abilities;
  derived.skills = {};
  if (ctx.statblock) {
    const stat = doc.statblock || {};
    const delta = ctx.state.delta;
    const named = {};
    for (const [name, value] of Object.entries(stat.skills || {})) named[String(name).toLowerCase()] = int(value);
    for (const [id, rule] of Object.entries(system.skills)) {
      if (rule.group) continue;
      const listed = named[rule.name.toLowerCase()];
      const stacked = ctx.total(["skill." + id, "skills", "skills." + rule.ability]);
      const base = listed !== undefined ? listed : found[rule.ability].baseMod + (rule.size ? SIZES[doc.size][rule.size] : 0);
      derived.skills[id] = { name: rule.name, ability: rule.ability, ranks: listed !== undefined ? 1 : 0, classSkill: false, total: base + delta[rule.ability] + stacked.total, usable: listed !== undefined || !rule.trained, trained: !!rule.trained, listed: listed !== undefined, parts: [part(listed !== undefined ? "Stat block" : system.abilityNames[rule.ability], base), ...stacked.parts] };
    }
    for (const [name, value] of Object.entries(stat.skills || {})) {
      if (Object.values(system.skills).some((rule) => rule.name.toLowerCase() === name.toLowerCase())) continue;
      const match = /^(.+?)\s*\((.+)\)$/.exec(name);
      const group = match ? Object.entries(system.skills).find(([, rule]) => rule.name.toLowerCase() === match[1].toLowerCase()) : null;
      const ability = group ? group[1].ability : "int";
      const stacked = ctx.total(["skills", "skills." + ability]);
      derived.skills["x:" + name.toLowerCase().replace(/[^a-z0-9]+/g, "-")] = { name, ability, ranks: 1, classSkill: false, total: int(value) + delta[ability] + stacked.total, usable: true, trained: false, listed: true, parts: [part("Stat block", int(value)), ...stacked.parts] };
    }
    derived.skillPoints = null;
    derived.feats = { count: list(stat.feats).length, allowed: list(stat.feats).length, names: list(stat.feats) };
    return;
  }
  let spent = 0;
  const ids = [...Object.keys(system.skills).filter((id) => !system.skills[id].group), ...Object.keys(doc.skills).filter((id) => id.includes(":") && system.skills[id.split(":")[0]])];
  for (const id of ids) {
    const rule = system.skills[id.split(":")[0]];
    const raw = doc.skills[id] || {};
    const ranks = Math.max(0, int(raw.ranks));
    spent += ranks;
    const key = raw.ability || rule.ability;
    const ability = found[key].mod;
    const classSkill = ctx.classSkills.has(id) || ctx.classSkills.has(id.split(":")[0]) || !!raw.classSkill;
    const stacked = ctx.total(["skill." + id, "skill." + id.split(":")[0], "skills", "skills." + key]);
    const parts = [part(system.abilityNames[key], ability)];
    let total = ability + stacked.total;
    const add = (label, value) => {
      if (!value) return;
      parts.push(part(label, value));
      total += value;
    };
    add("Ranks", ranks);
    add("Class skill", classSkill && ranks ? system.classSkillBonus : 0);
    add("Armor check", rule.acp ? derived.acp : 0);
    add("Size", rule.size ? SIZES[doc.size][rule.size] : 0);
    add("Other", int(raw.misc));
    derived.skills[id] = { name: id.includes(":") ? rule.name + " (" + (raw.label || id.split(":")[1]) + ")" : rule.name, ability: key, ranks, classSkill, total, usable: !rule.trained || ranks > 0, trained: !!rule.trained, parts: [...parts, ...stacked.parts] };
  }
  let budget = 0;
  for (const level of derived.levels) budget += Math.max(1, level.ranks + found.int.mod) * level.level;
  const hd = derived.hd;
  derived.skillPoints = { total: budget + int(doc.favored.skill) + ctx.total(["skillRanks"]).total, spent, max: hd };
  derived.feats = { count: doc.feats.length, allowed: (hd ? 1 + Math.floor((hd - 1) / 2) : 0) + ctx.total(["feats"]).total };
  derived.abilityIncreases = Math.floor(hd / 4);
}

function proficientWith(ctx, item) {
  const weapon = item.weapon || {};
  if (ctx.flags.allWeapons) return true;
  return [String(item.name || "").toLowerCase(), String(weapon.base || "").toLowerCase(), String(weapon.category || "").toLowerCase()].some((name) => name && ctx.proficiency.weapons.has(name));
}

function weaponAttack(ctx, derived, item) {
  const { doc } = ctx;
  const weapon = item.weapon || {};
  const ranged = weapon.group === "ranged";
  const thrown = !ranged && weapon.thrown && doc.toggles["thrown:" + item.uid];
  const kind = ranged || thrown ? "ranged" : "melee";
  const hands = weapon.handed === "two" || (weapon.handed === "one" && doc.toggles["twohand:" + item.uid]) ? "two" : weapon.offhand ? "off" : "one";
  const strMult = hands === "two" ? 1.5 : hands === "off" ? 0.5 : 1;
  const str = derived.abilities.str.mod;
  const dex = derived.abilities.dex.mod;
  const finesse = kind === "melee" && (ctx.flags.finesse || weapon.agile) && (weapon.finesse || weapon.handed === "light") && dex > str;
  const attackAbility = kind === "ranged" || finesse ? dex : str;
  const enhancement = int(item.enhancement);
  const quality = enhancement > 0 ? enhancement : item.masterwork ? 1 : 0;
  const vars = { weapon: { strMult, twoHanded: hands === "two" ? 1 : 0, ranged: kind === "ranged" ? 1 : 0, light: weapon.handed === "light" ? 1 : 0, enhancement }, item: { enhancement } };
  const attackMods = [];
  if (quality) attackMods.push({ key: "enhancement", value: quality, source: "item:" + item.uid, label: enhancement > 0 ? "Enhancement" : "Masterwork" });
  const proficient = proficientWith(ctx, item);
  if (!proficient) attackMods.push({ key: "untyped", value: -4, source: "nonproficient", label: "Not proficient" });
  if (derived.armorPenaltyToAttacks) attackMods.push({ key: "untyped", value: derived.armorPenaltyToAttacks, source: "armor", label: "Armor not proficient" });
  const name = String(weapon.base || item.name || "").toLowerCase();
  const attack = ctx.total(["attack", "attack." + kind, "attack.weapon." + name], vars, attackMods);
  const size = SIZES[doc.size].attack;
  const base = derived.bab + attackAbility + size + attack.total;
  const bonuses = iterativeAttacks(derived.bab).map((value) => value - derived.bab + base);
  if (ctx.flags.flurry && weapon.monk && doc.toggles.flurry) bonuses.splice(1, 0, bonuses[0]);
  let strDamage = 0;
  const mode = weapon.strDamage || (ranged ? (weapon.thrown ? "full" : "none") : "full");
  if (mode === "full") strDamage = str >= 0 ? Math.floor(str * (kind === "melee" ? strMult : 1)) : str;
  else if (mode === "penalty") strDamage = Math.min(0, str);
  else if (mode === "composite") strDamage = str >= 0 ? Math.min(str, int(weapon.strRating)) : str;
  const damageMods = [];
  if (enhancement > 0) damageMods.push({ key: "enhancement", value: enhancement, source: "item:" + item.uid, label: "Enhancement" });
  const damage = ctx.total(["damage", "damage." + kind, "damage.weapon." + name], vars, damageMods);
  const dice = sizedDamage(weapon.damage || "1d4", weapon.sized === false ? "medium" : doc.size);
  const bonus = strDamage + damage.total;
  const parts = [{ formula: dice + (bonus ? signed(bonus) : ""), type: weapon.damageType || "", crit: true }];
  for (const extra of list(weapon.extraDamage)) parts.push({ formula: String(extra.formula), type: extra.type || "", crit: false });
  parts.push(...ctx.dice(["damage.dice", "damage.dice." + kind], vars));
  return { id: "item:" + item.uid, name: item.name, kind, bonuses, damage: parts, crit: { range: Math.max(2, Math.min(20, int(weapon.critRange, 20))), mult: Math.max(2, int(weapon.critMult, 2)) }, range: int(weapon.range), reach: !!weapon.reach, nonlethal: !!weapon.nonlethal, proficient, properties: list(weapon.properties), attackParts: [part("Base attack", derived.bab), part(kind === "ranged" || finesse ? "Dexterity" : "Strength", attackAbility), ...(size ? [part("Size", size)] : []), ...attack.parts] };
}

function naturalAttack(ctx, derived, attack, index, count) {
  const primary = attack.primary !== false;
  const str = derived.abilities.str.mod;
  const strMult = primary ? (count === 1 ? 1.5 : 1) : 0.5;
  const vars = { weapon: { strMult, twoHanded: 0, ranged: 0, light: 0, enhancement: 0 }, item: { enhancement: 0 } };
  const mods = primary ? [] : [{ key: "untyped", value: ctx.flags.multiattack ? -2 : -5, source: "secondary", label: "Secondary attack" }];
  const total = ctx.total(["attack", "attack.melee", "attack.natural"], vars, mods);
  const size = SIZES[ctx.doc.size].attack;
  const bonus = derived.bab + str + size + total.total;
  const flat = (str >= 0 ? Math.floor(str * strMult) : str) + ctx.total(["damage", "damage.melee", "damage.natural"], vars).total;
  const dice = sizedDamage(attack.damage || "1d4", attack.sized === false ? "medium" : ctx.doc.size);
  return { id: "natural:" + index, name: attack.name || "Natural attack", kind: "melee", bonuses: Array.from({ length: Math.max(1, int(attack.count, 1)) }, () => bonus), damage: [{ formula: dice + (flat ? signed(flat) : ""), type: attack.type || "", crit: true }], crit: { range: int(attack.critRange, 20), mult: int(attack.critMult, 2) }, range: 0, natural: true, proficient: true, properties: [], attackParts: [part("Base attack", derived.bab), part("Strength", str), ...(size ? [part("Size", size)] : []), ...total.parts] };
}

function specialAttack(ctx, derived, { attack, source, index }) {
  const scope = source.vars;
  if (!ctx.active(source, attack, scope)) return null;
  const kind = attack.kind === "melee" ? "melee" : "ranged";
  const tags = list(attack.tags).map(String);
  const vars = { ...scope, weapon: { strMult: 1, twoHanded: 0, ranged: kind === "ranged" ? 1 : 0, light: 0, enhancement: 0 }, item: { enhancement: 0 } };
  const key = attack.ability || (kind === "ranged" ? "dex" : "str");
  const ability = derived.abilities[key] ? derived.abilities[key].mod : 0;
  const size = SIZES[ctx.doc.size].attack;
  const stacked = ctx.total(["attack", "attack." + kind, ...tags.map((tag) => "attack." + tag)], vars);
  const base = (attack.bab === false ? 0 : derived.bab) + ability + size + Math.trunc(ctx.number(attack.bonus, vars)) + stacked.total;
  const damage = attack.damage || {};
  const count = Math.max(0, Math.trunc(ctx.number(damage.count === undefined ? 1 : damage.count, vars)));
  const flat = Math.trunc(ctx.number(damage.bonus, vars)) + ctx.total(tags.map((tag) => "damage." + tag), vars).total;
  const formula = count > 0 ? count + "d" + int(damage.die, 6) + (flat ? signed(flat) : "") : String(flat);
  const parts = [{ formula, type: damage.type || "", crit: damage.crit !== false }, ...ctx.dice(tags.map((tag) => "damage.dice." + tag), vars)];
  return { id: "special:" + source.id + ":" + (attack.id || index), name: attack.name || source.label, kind, touch: !!attack.touch, bonuses: attack.iterative ? iterativeAttacks(derived.bab).map((value) => value - derived.bab + base) : [base], damage: parts, crit: { range: int(attack.critRange, 20), mult: int(attack.critMult, 2) }, range: int(attack.range), special: true, tags, proficient: true, properties: [], notes: [attack.touch ? "touch attack" : "", attack.text || ""].filter(Boolean).join("; "), cost: list(attack.cost), vars: scope, attackParts: [part("Base attack", attack.bab === false ? 0 : derived.bab), part(ctx.system.abilityNames[key] || key, ability), ...(size ? [part("Size", size)] : []), ...stacked.parts] };
}

function attacks(derived, ctx) {
  derived.attacks = [];
  if (ctx.statblock) {
    const delta = ctx.state.delta;
    derived.attacks = list((ctx.doc.statblock || {}).attacks).map((attack, index) => {
      const kind = attack.kind === "ranged" ? "ranged" : "melee";
      const vars = { weapon: { strMult: 1, twoHanded: 0, ranged: kind === "ranged" ? 1 : 0, light: 0, enhancement: 0 }, item: { enhancement: 0 } };
      const stacked = ctx.total(["attack", "attack." + kind, ...(attack.natural ? ["attack.natural"] : [])], vars);
      const shift = (kind === "ranged" ? delta.dex : delta.str) + stacked.total;
      const damage = ctx.total(["damage", "damage." + kind], vars).total + (kind === "melee" ? delta.str : 0);
      return { id: "stat:" + index, name: attack.name || "Attack", kind, bonuses: list(attack.bonuses).map((value) => int(value) + shift), damage: list(attack.damage).map((entry, position) => ({ formula: String(entry.formula || "0") + (position === 0 && damage ? signed(damage) : ""), type: entry.type || "", crit: entry.crit !== false })), crit: { range: int((attack.crit || {}).range, 20), mult: int((attack.crit || {}).mult, 2) }, range: int(attack.range), natural: !!attack.natural, proficient: true, properties: [], notes: String(attack.notes || ""), attackParts: [part("Stat block", int(list(attack.bonuses)[0])), ...stacked.parts] };
    });
  } else {
    for (const item of ctx.state.gear.weapons) derived.attacks.push(weaponAttack(ctx, derived, item));
    ctx.naturalAttacks.forEach((attack, index) => derived.attacks.push(naturalAttack(ctx, derived, attack, index, ctx.naturalAttacks.length)));
    const unarmed = weaponAttack(ctx, derived, { uid: "unarmed", name: "Unarmed strike", weapon: { base: "unarmed strike", category: "simple", group: "melee", handed: "light", damage: ctx.unarmed || "1d3", damageType: "B", critRange: 20, critMult: 2, nonlethal: !ctx.flags.lethalUnarmed, monk: true, finesse: true } });
    unarmed.id = "unarmed";
    derived.attacks.push(unarmed);
  }
  for (const entry of ctx.specialAttacks) {
    const attack = specialAttack(ctx, derived, entry);
    if (attack) derived.attacks.push(attack);
  }
}

function magic(derived, ctx) {
  derived.casting = [];
  if (ctx.statblock) return;
  for (const entry of ctx.doc.levels) {
    const definition = ctx.engine.lookup(String(entry.classId || "")) || {};
    const rules = definition.casting;
    const level = int(entry.level);
    if (!rules || level < int(rules.from, 1)) continue;
    const system = ctx.engine.magic.get(rules.system || "vancian");
    if (!system) continue;
    const key = safe(entry.key || String(entry.classId).split(":").pop());
    const block = system.derive(ctx, derived, { key, level, entry, definition, rules, state: ctx.doc.casting[key] || {} });
    if (block) derived.casting.push({ system: rules.system || "vancian", key, classId: entry.classId, name: entry.name || definition.name || key, ...block });
  }
}

function summary(derived, ctx) {
  const { doc, system } = ctx;
  derived.flags = { ...ctx.flags };
  derived.conditions = doc.conditions.filter((id) => system.conditions[id]).map((id) => ({ id, name: system.conditions[id].name, text: system.conditions[id].text || "" }));
  derived.buffs = doc.buffs.map((buff) => ({ uid: buff.uid, name: buff.name, active: !!buff.active, rounds: buff.rounds === undefined ? null : buff.rounds, text: buff.text || "" }));
  derived.senses = ctx.senses;
  if (ctx.statblock) ctx.source("statblock", "Stat block", { defenses: (doc.statblock || {}).defenses || {} });
  for (const entry of ctx.resistance) ctx.defenses.sr = Math.max(ctx.defenses.sr, Math.trunc(ctx.number(entry.value, entry.vars)));
  ctx.defenses.sr += ctx.defenses.sr ? ctx.total(["sr"]).total : 0;
  derived.defenses = ctx.defenses;
  derived.toggles = [];
  const toggle = (id, label) => {
    if (id && !derived.toggles.some((entry) => entry.id === id)) derived.toggles.push({ id, label, on: !!doc.toggles[id] });
  };
  for (const source of ctx.sources) {
    for (const change of source.changes) if (change && change.toggle) toggle(change.toggle, change.toggleLabel || source.label);
    if (!source.part.quiet) toggle(source.part.toggle, source.label);
  }
  for (const rule of ctx.toggleRules) toggle(rule.id, rule.label);
  derived.features = ctx.features.map((feature) => {
    const uses = feature.uses ? { max: Math.max(0, Math.trunc(ctx.number(feature.uses.max, feature.vars))), used: int(doc.uses[feature.key]), per: feature.uses.per || "day", unit: feature.uses.unit || "" } : null;
    const count = feature.roll ? Math.max(0, Math.trunc(ctx.number(feature.roll.count, feature.vars))) : 0;
    const roll = count ? { formula: count + "d" + int(feature.roll.die, 6) + (feature.roll.bonus ? signed(Math.trunc(ctx.number(feature.roll.bonus, feature.vars))) : ""), label: feature.roll.label || feature.name, healing: !!feature.roll.healing } : null;
    return { key: feature.key, uid: feature.uid || "", name: feature.name, level: feature.level, source: feature.source, text: feature.text, uses, roll, use: feature.use, toggle: feature.toggle, own: !!feature.own };
  });
  if (ctx.statblock) {
    const stat = doc.statblock || {};
    const delta = ctx.state.delta;
    derived.statblock = { type: String(stat.type || ""), subtypes: list(stat.subtypes), alignment: String(stat.alignment || "") };
    if (!derived.maneuvers) derived.maneuvers = { cmb: int(stat.cmb) + delta.str + ctx.total(["cmb"]).total, cmd: int(stat.cmd, 10) + delta.str + delta.dex + ctx.total(["cmd"]).total, cmdNotes: String(stat.cmdNotes || "") };
  }
  derived.notes = ctx.notes;
  derived.data = ctx.data;
}

export const STEPS = [
  ["levels", levels],
  ["gear", gear],
  ["abilities", abilities],
  ["resources", resources],
  ["encumbrance", encumbrance],
  ["hitPoints", hitPoints],
  ["armorClass", armorClass],
  ["saves", saves],
  ["initiative", initiative],
  ["speed", speed],
  ["skills", skills],
  ["attacks", attacks],
  ["magic", magic],
  ["summary", summary],
];

export function derive(engine, input) {
  const doc = normalize(input);
  const ctx = new Context(engine, doc);
  collect(ctx);
  const derived = { mode: ctx.statblock ? "statblock" : "built", kind: doc.kind, size: doc.size };
  for (const step of engine.steps) step.run(derived, ctx);
  return engine.run("derived", derived, ctx) || derived;
}
