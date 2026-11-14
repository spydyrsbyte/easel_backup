import { ABILITIES, copy } from "./tables.mjs";

const list = (value) => (Array.isArray(value) ? value : []);
const int = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : fallback);
const PHYSICAL = ["b", "p", "s", "bludgeoning", "piercing", "slashing"];

export function check(engine, { bonus = 0, dc = null, take = 0, label = "" } = {}) {
  const natural = take ? int(take) : engine.d20();
  const total = natural + int(bonus);
  const roll = { label, natural, bonus: int(bonus), total, dc: dc === null || dc === undefined ? null : int(dc), take: !!take };
  roll.success = roll.dc === null ? null : total >= roll.dc;
  return engine.run("check", roll) || roll;
}

export function save(engine, { bonus = 0, dc = null, label = "" } = {}) {
  const roll = check(engine, { bonus, dc, label });
  if (roll.natural === 1) roll.success = roll.dc === null ? null : false;
  if (roll.natural === 20) roll.success = roll.dc === null ? null : true;
  roll.automatic = roll.natural === 1 || roll.natural === 20;
  return roll;
}

export function rollDamage(engine, parts, multiplier = 1) {
  const rolled = [];
  let total = 0;
  for (const part of list(parts)) {
    const times = part.crit === false ? 1 : Math.max(1, int(multiplier, 1));
    let sum = 0;
    const dice = [];
    for (let index = 0; index < times; index++) {
      const result = engine.roll(part.formula);
      sum += result.total;
      dice.push(...result.dice);
    }
    rolled.push({ formula: part.formula + (times > 1 ? " ×" + times : ""), type: part.type || "", total: sum, dice });
    total += sum;
  }
  if (rolled.length && total < 1) total = 1;
  return { total, parts: rolled };
}

export function attack(engine, definition, { full = false, bonus = 0, damageBonus = 0, targetAc = null, label = "" } = {}) {
  const bonuses = full ? list(definition.bonuses) : list(definition.bonuses).slice(0, 1);
  const parts = list(definition.damage).map((part, index) => (index === 0 && int(damageBonus) ? { ...part, formula: part.formula + (int(damageBonus) >= 0 ? "+" : "") + int(damageBonus) } : part));
  const range = Math.max(2, int((definition.crit || {}).range, 20));
  const mult = Math.max(2, int((definition.crit || {}).mult, 2));
  const strikes = bonuses.map((base, index) => {
    const modifier = int(base) + int(bonus);
    const natural = engine.d20();
    const total = natural + modifier;
    const known = targetAc !== null && targetAc !== undefined;
    const hit = natural === 1 ? false : natural === 20 ? true : known ? total >= int(targetAc) : null;
    const threat = natural >= range && hit !== false;
    let confirm = null;
    if (threat) {
      const second = engine.d20();
      confirm = { natural: second, total: second + modifier, confirmed: second === 1 ? false : second === 20 ? true : known ? second + modifier >= int(targetAc) : null };
    }
    const strike = { index, bonus: modifier, natural, total, hit, threat, fumble: natural === 1, confirm, damage: null, critical: null };
    if (hit !== false) {
      strike.damage = rollDamage(engine, parts, 1);
      if (threat && confirm.confirmed !== false) {
        const extra = rollDamage(engine, parts.filter((part) => part.crit !== false), mult - 1);
        strike.critical = { total: strike.damage.total + extra.total, parts: [...strike.damage.parts, ...extra.parts], multiplier: mult };
      }
    }
    return strike;
  });
  const result = { label: label || definition.name || "Attack", kind: definition.kind || "melee", full: !!full && bonuses.length > 1, targetAc: targetAc === null || targetAc === undefined ? null : int(targetAc), strikes, nonlethal: !!definition.nonlethal };
  return engine.run("attack", result) || result;
}

export function applyDamage(engine, doc, derived, { amount = 0, type = "", nonlethal = false, healing = false, bypass = [], ignoreDefenses = false } = {}) {
  const hp = { damage: 0, nonlethal: 0, temp: 0, stable: false, ...(doc.hp || {}) };
  const report = { requested: Math.max(0, int(amount)), applied: 0, reasons: [], healing: !!healing, nonlethal: !!nonlethal };
  let value = report.requested;
  if (healing) {
    const healed = Math.min(value, Math.max(0, int(hp.damage)));
    hp.damage = Math.max(0, int(hp.damage) - value);
    hp.nonlethal = Math.max(0, int(hp.nonlethal) - value);
    if (hp.damage < derived.hp.max) hp.stable = false;
    report.applied = healed;
  } else {
    const types = String(type || "").toLowerCase().split(/[\s,/]+|\band\b|\bor\b/).filter(Boolean);
    const defenses = derived.defenses || {};
    if (!ignoreDefenses && value > 0) {
      const immune = list(defenses.immune).map((name) => String(name).toLowerCase());
      if (types.length && types.every((name) => immune.includes(name))) {
        report.reasons.push("Immune to " + types.join(" and "));
        value = 0;
      }
      if (nonlethal && (derived.flags || {}).immuneNonlethal) {
        report.reasons.push("Immune to nonlethal damage");
        value = 0;
      }
      for (const name of types) {
        if (list(defenses.vulnerable).map((entry) => String(entry).toLowerCase()).includes(name) && value > 0) {
          value = Math.floor(value * 1.5);
          report.reasons.push("Vulnerable to " + name);
        }
        const resist = int((defenses.resist || {})[name]);
        if (resist && value > 0) {
          report.reasons.push("Resists " + Math.min(resist, value) + " " + name);
          value = Math.max(0, value - resist);
        }
      }
      const physical = !types.length || types.some((name) => PHYSICAL.includes(name));
      if (physical && value > 0) {
        const tags = [...types, ...list(bypass).map((tag) => String(tag).toLowerCase())];
        let best = 0;
        for (const entry of list(defenses.dr)) {
          const needs = String(entry.bypass || "-").toLowerCase().split(/\s+(?:or)\s+|,/).map((tag) => tag.trim());
          const short = { bludgeoning: "b", piercing: "p", slashing: "s" };
          const beaten = needs.some((tag) => tag !== "-" && tag !== "—" && (tags.includes(tag) || tags.includes(short[tag] || tag)));
          if (!beaten) best = Math.max(best, int(entry.amount));
        }
        if (best) {
          report.reasons.push("Damage reduction " + Math.min(best, value));
          value = Math.max(0, value - best);
        }
      }
    }
    if (nonlethal) hp.nonlethal = int(hp.nonlethal) + value;
    else {
      const absorbed = Math.min(value, Math.max(0, int(hp.temp)));
      if (absorbed) {
        hp.temp = int(hp.temp) - absorbed;
        report.reasons.push("Temporary hit points absorb " + absorbed);
      }
      hp.damage = int(hp.damage) + (value - absorbed);
    }
    report.applied = value;
  }
  const result = engine.run("damage", { hp, report }, { doc, derived }) || { hp, report };
  return result;
}

export function rest(engine, doc, derived, { full = false } = {}) {
  const next = copy(doc);
  const level = Math.max(1, int(derived.level, 1));
  const healed = Math.min(int(next.hp.damage), level * (full ? 2 : 1));
  next.hp.damage = Math.max(0, int(next.hp.damage) - level * (full ? 2 : 1));
  next.hp.nonlethal = 0;
  next.hp.stable = false;
  for (const ability of ABILITIES) if (next.abilities[ability]) next.abilities[ability].damage = Math.max(0, int(next.abilities[ability].damage) - (full ? 2 : 1));
  for (const caster of list(derived.casting)) {
    const system = engine.magic.get(caster.system || "vancian");
    if (system && system.rest) system.rest(engine, next, caster.key, caster);
  }
  recoverInto(engine, next, derived, "rest");
  const daily = new Set(list(derived.features).filter((feature) => feature.uses && feature.uses.per === "day").map((feature) => feature.key));
  for (const key of Object.keys(next.uses || {})) if (daily.has(key)) delete next.uses[key];
  for (const item of list(next.items)) if (item.uses && item.uses.per === "day") item.uses.used = 0;
  next.buffs = list(next.buffs).filter((buff) => !buff.untilRest);
  return engine.run("rest", { doc: next, healed }, { derived }) || { doc: next, healed };
}

export function addLevel(engine, doc, entry, { hp = "auto", first = false } = {}) {
  if (!entry || entry.kind !== "class") throw new Error("Choose a class to gain a level in.");
  const next = copy(doc);
  const key = String(entry.id).split(":").pop().replace(/[^A-Za-z0-9_]/g, "_");
  let level = list(next.levels).find((existing) => existing.classId === entry.id);
  const total = list(next.levels).reduce((sum, existing) => sum + int(existing.level), 0);
  if (total >= int(engine.system.maxLevel, 20) && !entry.racial) throw new Error("This character is already at the highest level.");
  if (!level) {
    level = { classId: entry.id, key, name: entry.name, level: 0, hp: [], hd: int(entry.hd, 8), bab: entry.bab || "poor", saves: copy(entry.saves || {}), ranks: int(entry.ranks, 2), classSkills: copy(entry.classSkills || []) };
    next.levels = [...list(next.levels), level];
  }
  const die = int(entry.hd, 8);
  const rule = hp === "auto" ? engine.system.options.hitPoints || "average" : hp;
  let gained;
  if (typeof rule === "number") gained = Math.max(1, Math.min(die, int(rule)));
  else if ((total === 0 || first) && engine.system.options.maxFirstHitDie !== false && !entry.racial) gained = die;
  else if (rule === "max") gained = die;
  else if (rule === "roll") gained = engine.roll("1d" + die).total;
  else gained = Math.floor(die / 2) + 1;
  level.level = int(level.level) + 1;
  level.hp = [...list(level.hp), gained];
  if (entry.casting && !next.casting[key]) next.casting[key] = { spells: [], prepared: [], used: {} };
  return engine.run("levelUp", { doc: next, gained, key, level: level.level, classId: entry.id }) || { doc: next, gained, key, level: level.level, classId: entry.id };
}

export function removeLevel(engine, doc, classId) {
  const next = copy(doc);
  const level = list(next.levels).find((existing) => existing.classId === classId);
  if (!level || int(level.level) < 1) throw new Error("There is no level of that class to remove.");
  level.level = int(level.level) - 1;
  level.hp = list(level.hp).slice(0, level.level);
  if (!level.level) next.levels = next.levels.filter((existing) => existing !== level);
  return next;
}

export function castSpell(engine, doc, derived, options) {
  const caster = list(derived.casting).find((entry) => entry.key === options.key);
  if (!caster) throw new Error("This character cannot cast from that class.");
  const system = engine.magic.get(caster.system || "vancian");
  if (!system || !system.cast) throw new Error("That kind of magic cannot be cast this way.");
  const next = system.cast(engine, doc, caster, options, derived);
  return engine.run("cast", next, { key: options.key, level: int(options.level), system: caster.system }) || next;
}

export function evaluate(engine, derived, value, vars) {
  if (typeof value === "number") return value;
  if (typeof value !== "string" || !value.trim()) return 0;
  try {
    const result = engine.formula.evaluate(value, { ...(derived.data || {}), ...(vars || {}) });
    return typeof result === "boolean" ? Number(result) : Number.isFinite(result) ? result : 0;
  } catch {
    return 0;
  }
}

export function spend(engine, doc, derived, costs, vars) {
  const next = copy(doc);
  next.resources = next.resources || {};
  const spent = [];
  for (const cost of list(costs)) {
    const pool = (derived.resources || {})[cost.resource];
    if (!pool) throw new Error("This character has no " + cost.resource + " to spend.");
    const amount = Math.max(0, Math.trunc(evaluate(engine, derived, cost.amount === undefined ? 1 : cost.amount, vars)));
    if (!amount) continue;
    const value = int(next.resources[pool.id]);
    if (value + amount > pool.max) throw new Error(pool.counts === "up" ? "That would take " + pool.name.toLowerCase() + " past its limit of " + pool.max + "." : "Not enough " + pool.name.toLowerCase() + " left: it costs " + amount + " and " + Math.max(0, pool.max - value) + " remain.");
    next.resources[pool.id] = value + amount;
    spent.push({ id: pool.id, name: pool.name, amount, value: value + amount, max: pool.max, counts: pool.counts });
  }
  return { doc: next, spent };
}

function recoverInto(engine, doc, derived, event) {
  doc.resources = doc.resources || {};
  for (const pool of Object.values(derived.resources || {})) {
    const rule = (pool.recover || {})[event];
    if (rule === undefined || rule === null || rule === false) continue;
    const value = int(doc.resources[pool.id]);
    doc.resources[pool.id] = rule === "all" ? 0 : Math.max(0, value - Math.max(0, Math.trunc(evaluate(engine, derived, rule))));
  }
}

export function recover(engine, doc, derived, event) {
  const next = copy(doc);
  recoverInto(engine, next, derived, event);
  return next;
}

export function tick(engine, doc, derived) {
  const next = copy(doc);
  if (derived) recoverInto(engine, next, derived, "turn");
  const ended = [];
  for (const buff of list(next.buffs)) {
    if (!buff.active || buff.rounds === undefined || buff.rounds === null) continue;
    buff.rounds = int(buff.rounds) - 1;
    if (buff.rounds <= 0) {
      buff.active = false;
      buff.rounds = 0;
      ended.push(buff.name);
    }
  }
  return { doc: next, ended };
}
