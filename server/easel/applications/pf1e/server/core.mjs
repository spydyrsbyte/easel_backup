import { monsterEntry } from "./statblock.mjs";

const list = (value) => (Array.isArray(value) ? value : []);
const signed = (value) => (value >= 0 ? "+" : "") + value;
const title = (text) => String(text || "").replace(/^./, (letter) => letter.toUpperCase());
const whole = (value) => Math.trunc(Number(value)) || 0;
const text = (value, limit) => String(value === null || value === undefined ? "" : value).slice(0, limit);

function changesFrom(input) {
  return list(input.changes)
    .slice(0, 30)
    .filter((change) => change && change.target)
    .map((change) => ({ target: text(change.target, 60), type: text(change.type || "untyped", 30), ...(/^[+-]?\d+$/.test(String(change.value).trim()) ? { value: Number(change.value) } : { formula: text(change.value || "0", 200) }) }));
}

function named(input, kind) {
  const name = text(input.name, 120).trim();
  if (!name) throw new Error("The entry needs a name.");
  return { kind, name, ...(input.id ? { id: String(input.id) } : {}) };
}

export function activate({ engine, game, record, sheet, name, subtitle, spec, vars, userId }) {
  const { cards } = game;
  const rows = [];
  if (list(spec.cost).length) {
    const result = engine.spend(sheet.doc, sheet.derived, spec.cost, vars);
    game.store(record, result.doc);
    for (const cost of result.spent) rows.push({ label: cost.name, value: (cost.counts === "up" ? "+" + cost.amount + " (now " + cost.value : "−" + cost.amount + " (" + (cost.max - cost.value) + " left") + " of " + cost.max + ")" });
  }
  const card = cards.textCard(name, subtitle || "", spec.text || "", rows);
  const roll = spec.roll;
  if (roll) {
    const count = Math.max(0, Math.trunc(engine.evaluate(sheet.derived, roll.count === undefined ? 1 : roll.count, vars)));
    const bonus = Math.trunc(engine.evaluate(sheet.derived, roll.bonus, vars));
    const rolled = count > 0 ? engine.roll(count + "d" + (Number(roll.die) || 6) + (bonus ? signed(bonus) : "")) : { formula: String(bonus), total: bonus, dice: [] };
    card.sections.push(cards.rollSection(roll.label || (roll.healing ? "Healing" : "Damage"), rolled, roll.healing ? "" : cards.damageLabel(roll.type), roll.healing ? "good" : ""));
    if (roll.healing) card.actions.push({ id: "apply", label: "Heal " + rolled.total, payload: { amount: rolled.total, healing: true } });
    else if (roll.apply !== false) {
      card.actions.push({ id: "apply", label: "Apply " + rolled.total, payload: { amount: rolled.total, type: roll.type || "", bypass: ["magic"] } });
      if (roll.save === "half") card.actions.push({ id: "apply", label: "Half: " + Math.floor(rolled.total / 2), payload: { amount: Math.floor(rolled.total / 2), type: roll.type || "", bypass: ["magic"] } });
    }
  }
  if (spec.save) {
    const dc = Math.trunc(engine.evaluate(sheet.derived, spec.save.dc, vars));
    card.actions.push({ id: "save", label: title(spec.save.name || spec.save.id) + " save DC " + dc, payload: { save: spec.save.id, dc } });
  }
  if (spec.buff) card.actions.push({ id: "effect", label: "Apply effect", payload: { entryId: spec.buff, level: sheet.derived.level } });
  return card;
}

export function registerCore(engine, game, KINDS) {
  const { cards, sheets, rolls, actions, kinds, cardActions } = game;
  const system = engine.system;
  const bonus = (options) => whole(options.bonus);
  const dc = (options) => (Number(options.dc) > 0 ? whole(options.dc) : null);
  const notes = (sheet, ...targets) => sheet.derived.notes.filter((note) => targets.includes(note.target)).map((note) => ({ label: note.source, value: note.text }));
  const caster = (sheet, key) => {
    const found = sheet.derived.casting.find((entry) => entry.key === key);
    if (!found) throw new Error("This character does not cast spells from that class.");
    return found;
  };

  rolls.set("ability", ({ sheet, id }) => {
    const ability = sheet.derived.abilities[id];
    if (!ability) throw new Error("There is no ability called " + id + ".");
    return cards.checkCard(engine.check({ bonus: ability.mod }), { title: system.abilityNames[id] + " check", parts: [{ label: system.abilityNames[id], value: ability.mod }] });
  });
  rolls.set("save", ({ sheet, id, options }) => {
    const save = sheet.derived.saves[id];
    if (!save) throw new Error("There is no saving throw called " + id + ".");
    return cards.checkCard(engine.save({ bonus: save.total + bonus(options), dc: dc(options) }), { title: system.saves[id].name + " save", parts: save.parts, extra: notes(sheet, id, "saves") });
  });
  rolls.set("skill", ({ sheet, id, options }) => {
    const skill = sheet.derived.skills[id];
    if (!skill) throw new Error("There is no skill called " + id + ".");
    if (!skill.usable) throw new Error(skill.name + " cannot be used untrained.");
    return cards.checkCard(engine.check({ bonus: skill.total + bonus(options), take: [10, 20].includes(Number(options.take)) ? Number(options.take) : 0 }), { title: skill.name, parts: skill.parts, extra: notes(sheet, "skill." + id) });
  });
  rolls.set("cmb", ({ sheet, options }) => cards.checkCard(engine.check({ bonus: sheet.derived.maneuvers.cmb + bonus(options) }), { title: "Combat maneuver", parts: sheet.derived.maneuvers.cmbParts || [], extra: notes(sheet, "cmb") }));
  rolls.set("concentration", ({ sheet, id, options }) => {
    const found = caster(sheet, id);
    return cards.checkCard(engine.check({ bonus: found.concentration, dc: dc(options) }), { title: "Concentration", subtitle: found.name, parts: [{ label: "Caster level", value: found.casterLevel }, { label: system.abilityNames[found.ability], value: found.abilityMod }] });
  });
  rolls.set("casterLevel", ({ sheet, id, options }) => {
    const found = caster(sheet, id);
    return cards.checkCard(engine.check({ bonus: found.casterLevel, dc: dc(options) }), { title: "Caster level check", subtitle: found.name, parts: [{ label: "Caster level", value: found.casterLevel }] });
  });
  rolls.set("initiative", ({ record, userId, rollMode }) => {
    const total = game.initiativeFor(record, userId, rollMode);
    for (const combatantId of easel.vtt.Combatant.ids()) {
      const combatant = new easel.vtt.Combatant(combatantId);
      if (combatant.actorId === record.id && !combatant.hasInitiative) game.table.setInitiative(combatant, total);
    }
    return null;
  });
  rolls.set("attack", ({ record, sheet, id, options }) => {
    const definition = sheet.derived.attacks.find((attack) => attack.id === id);
    if (!definition) throw new Error("That attack is not available.");
    if (!definition.bonuses.length) throw new Error("That attack has no attack bonus.");
    const rows = [];
    if (list(definition.cost).length) {
      const result = engine.spend(sheet.doc, sheet.derived, definition.cost, definition.vars);
      game.store(record, result.doc);
      for (const cost of result.spent) rows.push({ label: cost.name, value: (cost.counts === "up" ? "+" : "−") + cost.amount });
    }
    const result = engine.attack(definition, { full: !!options.full, bonus: bonus(options), damageBonus: whole(options.damageBonus) });
    const item = sheet.doc.items.find((entry) => "item:" + entry.uid === id);
    const card = cards.attackCard(result, { ...definition, enhancement: item ? item.enhancement : 0, magic: !!definition.special }, definition.touch ? { subtitle: (definition.kind === "ranged" ? "Ranged" : "Melee") + " touch attack" } : {});
    card.rows.push(...rows);
    return card;
  });
  rolls.set("spell", ({ record, sheet, id, options }) => {
    const found = caster(sheet, options.key);
    const known = list(found.spells).find((spell) => spell.uid === id);
    if (!known) throw new Error("That spell is not on the list.");
    const prepared = list(found.prepared).find((spell) => spell.uid === options.prepared);
    const row = list(found.levels).find((entry) => entry.level === known.level);
    if (!row) throw new Error("This character cannot cast level " + known.level + " spells yet.");
    if (!options.free) game.edit(record, (doc, derived) => engine.castSpell(doc, derived, { key: found.key, level: known.level, uid: prepared ? prepared.uid : "" }));
    const spell = engine.library.get(known.entryId) || { name: known.name, school: known.school, description: "" };
    let rolled = null;
    if (spell.roll) {
      const vars = { cl: found.casterLevel };
      const count = Math.trunc(engine.evaluate(sheet.derived, spell.roll.count, vars));
      const extra = Math.trunc(engine.evaluate(sheet.derived, spell.roll.bonus, vars));
      rolled = count < 1 ? { formula: String(extra), total: extra, dice: [] } : engine.roll(count + "d" + (Number(spell.roll.die) || 6) + (extra ? signed(extra) : ""));
    }
    let attack = null;
    if (spell.attack) {
      const ranged = /ranged/.test(spell.attack);
      attack = { label: ranged ? "Ranged touch attack" : "Melee touch attack", roll: engine.check({ bonus: sheet.derived.bab + (ranged ? sheet.derived.abilities.dex.mod : sheet.derived.abilities.str.mod) + engine.tables.SIZES[sheet.derived.size].attack }) };
    }
    return cards.spellCard({ spell, caster: { name: found.name, casterLevel: found.casterLevel, dc: row.dc }, level: known.level, rolled, attack });
  });
  rolls.set("feature", ({ record, sheet, id, userId }) => {
    const feature = sheet.derived.features.find((entry) => entry.key === id);
    if (!feature) throw new Error("That feature is not available.");
    const rows = [];
    if (feature.uses) {
      if (feature.uses.used >= feature.uses.max) throw new Error(feature.name + " has no uses left.");
      game.edit(record, (doc) => {
        doc.uses[feature.key] = feature.uses.used + 1;
      });
      rows.push({ label: "Uses left", value: feature.uses.max - feature.uses.used - 1 + " of " + feature.uses.max });
    }
    if (feature.use) {
      const card = activate({ engine, game, record, sheet: game.sheetOf(record), name: feature.name, subtitle: feature.source, spec: { text: feature.text, ...feature.use }, vars: {}, userId });
      card.rows.unshift(...rows);
      return card;
    }
    const card = cards.textCard(feature.name, feature.source, feature.text, rows);
    if (feature.roll) {
      const rolled = engine.roll(feature.roll.formula);
      card.sections.push(cards.rollSection(feature.roll.label, rolled, "", feature.roll.healing ? "good" : ""));
      card.actions.push(feature.roll.healing ? { id: "apply", label: "Heal " + rolled.total, payload: { amount: rolled.total, healing: true } } : { id: "apply", label: "Apply " + rolled.total, payload: { amount: rolled.total, type: "", bypass: ["magic"] } });
      if (!feature.roll.healing) card.actions.push({ id: "apply", label: "Heal " + rolled.total, payload: { amount: rolled.total, healing: true } });
    }
    return card;
  });
  rolls.set("use", ({ record, sheet, id, userId }) => {
    const [kind, uid] = String(id).split("/");
    const entry = list(sheet.doc.lists[kind]).find((candidate) => candidate.uid === uid);
    if (!entry) throw new Error("That is no longer on the sheet.");
    const info = kinds.get(kind) || {};
    return activate({ engine, game, record, sheet, name: entry.name, subtitle: title(info.singular || kind), spec: { text: entry.text, ...(entry.use || {}) }, vars: { entry: { level: whole(entry.level) || 1 } }, userId });
  });
  rolls.set("item", ({ record, sheet, id }) => {
    const item = sheet.doc.items.find((entry) => entry.uid === id);
    if (!item) throw new Error("That item is not carried.");
    const charged = item.uses && Number(item.uses.max) > 0;
    if (charged && Number(item.uses.used) >= Number(item.uses.max)) throw new Error(item.name + " is used up.");
    if (!charged && item.type === "consumable" && Number(item.quantity) < 1) throw new Error("There is no " + item.name + " left.");
    const card = cards.textCard(item.name, "Item", item.description || "");
    if (item.use && item.use.formula) {
      const rolled = engine.roll(item.use.formula);
      card.sections.push(cards.rollSection(item.use.healing ? "Healing" : "Damage", rolled, item.use.healing ? "" : cards.damageLabel(item.use.type), item.use.healing ? "good" : ""));
      card.actions.push(item.use.healing ? { id: "apply", label: "Heal " + rolled.total, payload: { amount: rolled.total, healing: true } } : { id: "apply", label: "Apply " + rolled.total, payload: { amount: rolled.total, type: item.use.type || "", bypass: ["magic"] } });
    }
    game.edit(record, (doc) => {
      const carried = doc.items.find((entry) => entry.uid === id);
      if (charged) carried.uses.used = Number(carried.uses.used) + 1;
      else if (carried.type === "consumable") carried.quantity = Math.max(0, Number(carried.quantity) - 1);
    });
    if (charged) card.rows.push({ label: "Charges left", value: String(Number(item.uses.max) - Number(item.uses.used) - 1) });
    return card;
  });

  const control = (run) => ({ needs: "control", run });
  actions.set("toggle", control((doc, derived, data) => {
    sheets.setPath(doc, "toggles." + String(data.id), !!data.on);
  }));
  actions.set("condition", control((doc, derived, data) => {
    const id = String(data.id);
    if (!system.conditions[id]) throw new Error("There is no condition called " + id + ".");
    doc.conditions = doc.conditions.filter((entry) => entry !== id);
    if (data.on) doc.conditions.push(id);
  }));
  actions.set("buff", control((doc, derived, data) => {
    const buff = doc.buffs.find((entry) => entry.uid === data.uid);
    if (!buff) throw new Error("That effect is no longer on the sheet.");
    if (data.active !== undefined) buff.active = !!data.active;
    if (data.level !== undefined) buff.level = Math.max(1, Math.min(40, whole(data.level) || 1));
    if (data.rounds !== undefined) {
      if (data.rounds === null || data.rounds === "" || Number(data.rounds) <= 0) delete buff.rounds;
      else buff.rounds = Math.min(100000, whole(data.rounds));
    }
  }));
  actions.set("heal", control((doc, derived, data) => {
    doc.hp = engine.applyDamage(doc, derived, { amount: Number(data.amount) || 0, healing: true }).hp;
  }));
  actions.set("damage", control((doc, derived, data) => {
    doc.hp = engine.applyDamage(doc, derived, { amount: Number(data.amount) || 0, nonlethal: !!data.nonlethal, ignoreDefenses: true }).hp;
  }));
  actions.set("resource", control((doc, derived, data) => {
    const pool = (derived.resources || {})[String(data.id)];
    if (!pool) throw new Error("This character has no such resource.");
    const next = data.value !== undefined ? whole(data.value) : whole(doc.resources[pool.id]) + whole(data.delta);
    doc.resources[pool.id] = Math.max(0, Math.min(pool.max, next));
  }));
  actions.set("recover", control((doc, derived, data) => engine.recover(doc, derived, String(data.event || "encounter"))));
  actions.set("rest", (doc, derived, data) => engine.rest(doc, derived, { full: !!data.full }).doc);
  actions.set("levelDown", (doc, derived, data) => engine.removeLevel(doc, String(data.classId)));
  actions.set("feature", (doc, derived, data) => {
    const name = text(data.name, 80).trim();
    if (!name) throw new Error("A feature needs a name.");
    const uses = Number(data.uses) > 0 ? { max: String(whole(data.uses)), per: "day" } : undefined;
    if (data.uid) {
      const feature = doc.features.find((entry) => entry.uid === data.uid);
      if (!feature) throw new Error("That feature is no longer on the sheet.");
      Object.assign(feature, { name, text: text(data.text, 4000), uses });
    } else doc.features.push({ uid: sheets.uid(), name, text: text(data.text, 4000), source: "Custom", uses });
  });
  actions.set("skill", (doc, derived, data) => {
    const base = String(data.base);
    const rule = system.skills[base];
    if (!rule || !rule.group) throw new Error("Choose Craft, Perform or Profession.");
    const label = text(data.label, 30).trim();
    const key = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (!key) throw new Error("Name the " + rule.name + " skill.");
    if (!doc.skills[base + ":" + key]) doc.skills[base + ":" + key] = { ranks: 0, misc: 0, label };
  });
  actions.set("skillRemove", (doc, derived, data) => {
    if (!String(data.id).includes(":")) throw new Error("Only added skills can be removed.");
    delete doc.skills[String(data.id)];
  });
  actions.set("prepare", (doc, derived, data) => {
    sheets.prepare(doc, derived, String(data.key), String(data.uid));
  });
  actions.set("recoverSpell", (doc, derived, data) => {
    const state = doc.casting[String(data.key)];
    if (!state) throw new Error("That spell list was not found.");
    const prepared = list(state.prepared).find((entry) => entry.uid === data.uid);
    if (prepared) prepared.cast = false;
  });

  cardActions.set("apply", ({ targets, payload, userId }) => {
    const lines = { public: [], gm: [] };
    for (const record of game.targets(targets, userId, "write")) {
      const sheet = game.sheetOf(record);
      const doc = JSON.parse(JSON.stringify(sheet.doc));
      let line;
      if (payload.temporary) {
        doc.hp.temp = Math.max(Number(doc.hp.temp) || 0, Math.max(0, whole(payload.amount)));
        line = record.name + " has " + doc.hp.temp + " temporary hit points.";
      } else {
        const result = engine.applyDamage(doc, sheet.derived, { amount: Number(payload.amount) || 0, type: String(payload.type || ""), nonlethal: !!payload.nonlethal, healing: !!payload.healing, bypass: list(payload.bypass).map(String) });
        doc.hp = result.hp;
        const report = result.report;
        line = record.name + (report.healing ? " heals " + report.applied : " takes " + report.applied + (report.nonlethal ? " nonlethal" : "")) + (report.reasons.length ? " (" + report.reasons.join("; ") + ")" : "") + ".";
      }
      game.store(record, doc);
      const after = game.sheetOf(record).derived.hp;
      if (!["ok", "staggered"].includes(after.status)) line += " " + record.name + " is " + after.status + ".";
      lines[record.kind === "npc" ? "gm" : "public"].push(line);
    }
    for (const [rollMode, found] of Object.entries(lines)) if (found.length) game.say(userId, found.join("\n"), rollMode);
  });
  cardActions.set("save", ({ targets, payload, userId, rollMode }) => {
    if (!system.saves[payload.save]) throw new Error("There is no saving throw called " + payload.save + ".");
    for (const record of game.targets(targets, userId, "control")) game.post(record, userId, rolls.get("save")({ record, sheet: game.sheetOf(record), id: payload.save, options: { dc: payload.dc }, userId, rollMode, game, engine }), rollMode);
  });
  cardActions.set("effect", ({ targets, payload, userId }) => {
    const entry = engine.library.require(String(payload.entryId), "buff");
    const names = [];
    for (const record of game.targets(targets, userId, "write")) {
      game.edit(record, (doc) => {
        doc.buffs = doc.buffs.filter((buff) => buff.entryId !== entry.id);
        doc.buffs.push(sheets.buffFrom(entry, { level: payload.level, rounds: payload.rounds }));
      });
      names.push(record.name);
    }
    game.say(userId, entry.name + " now affects " + names.join(", ") + ".");
  });

  const info = (id) => KINDS.find((kind) => kind.id === id);
  kinds.set("monster", {
    ...info("monster"),
    onSheet: false,
    describe: (entry) => ["CR " + (entry.cr || "—"), title(entry.size), entry.type || ""].filter(Boolean).join(" · "),
    form: (input) => {
      if (!input.text) throw new Error("Paste the monster's stat block.");
      return { ...monsterEntry(text(input.text, 30000)), ...(input.id ? { id: String(input.id) } : {}) };
    },
  });
  kinds.set("item", {
    ...info("item"),
    statblock: true,
    describe: (entry) => [title(entry.type), entry.price ? entry.price + " gp" : "", entry.weight ? entry.weight + " lb." : ""].filter(Boolean).join(" · "),
    group: (entry) => entry.type || "",
    add: (doc, entry, options) => {
      doc.items.push(sheets.itemFrom(entry, options.quantity));
    },
    form: (input) => {
      const type = ["weapon", "armor", "shield", "gear", "consumable", "magic", "ammo"].includes(input.type) ? input.type : "gear";
      const changes = changesFrom(input);
      const item = { ...named(input, "item"), type, price: Math.max(0, Number(input.price) || 0), weight: Math.max(0, Number(input.weight) || 0), description: text(input.description, 4000), ...(changes.length ? { changes } : {}) };
      if (type === "weapon") {
        const ranged = input.group === "ranged";
        item.weapon = { base: item.name.toLowerCase(), category: ["simple", "martial", "exotic"].includes(input.category) ? input.category : "martial", group: ranged ? "ranged" : "melee", handed: ranged ? "ranged" : ["light", "one", "two"].includes(input.handed) ? input.handed : "one", damage: /^(\d{1,2}d\d{1,3}|\d{1,3})$/.test(String(input.damage)) ? String(input.damage) : "1d6", damageType: text(input.damageType, 40), critRange: Math.max(2, Math.min(20, Number(input.critRange) || 20)), critMult: Math.max(2, Math.min(6, Number(input.critMult) || 2)), range: Math.max(0, Number(input.range) || 0), properties: [] };
        if (ranged) item.weapon.strDamage = "none";
      }
      if (type === "armor" || type === "shield") item.armor = { category: type === "shield" ? "shield" : ["light", "medium", "heavy"].includes(input.category) ? input.category : "light", bonus: Math.max(0, Number(input.bonus) || 0), maxDex: input.maxDex === "" || input.maxDex === undefined || input.maxDex === null ? null : Math.max(0, Number(input.maxDex) || 0), acp: -Math.abs(Number(input.acp) || 0), spellFailure: Math.max(0, Number(input.spellFailure) || 0) };
      if (input.formula) {
        item.use = { formula: String(input.formula).replace(/\s+/g, "").slice(0, 40), healing: !!input.healing, type: text(input.damageType, 40) };
        engine.dice.parse(item.use.formula);
      }
      return item;
    },
  });
  kinds.set("spell", {
    ...info("spell"),
    describe: (entry) => [title(entry.school), Object.entries(entry.levels || {}).map(([name, level]) => name + " " + level).join(", ")].filter(Boolean).join(" · "),
    group: (entry) => "Level " + entry.level,
    add: (doc, entry, options, derived) => {
      const found = derived.casting.find((candidate) => candidate.key === options.key) || derived.casting.find((candidate) => Array.isArray(candidate.spells));
      if (!found || !Array.isArray(found.spells)) throw new Error("This character has no spellcasting class to learn the spell with.");
      const state = doc.casting[found.key] || (doc.casting[found.key] = { spells: [], prepared: [], used: {} });
      state.spells = list(state.spells);
      if (state.spells.some((spell) => spell.entryId === entry.id)) throw new Error(entry.name + " is already on the " + found.name + " list.");
      state.spells.push(sheets.spellFrom(entry, found.list, options.level));
    },
    form: (input) => {
      const levels = {};
      for (const part of String(input.levels || "").split(",")) {
        const match = /^\s*([a-z]+)\s+(\d)\s*$/i.exec(part);
        if (match) levels[match[1].toLowerCase()] = Number(match[2]);
      }
      if (!Object.keys(levels).length) throw new Error("Say which class lists the spell is on, such as \"wizard 3, cleric 4\".");
      const spell = { ...named(input, "spell"), school: text(input.school || "universal", 30).toLowerCase(), levels, level: Math.min(...Object.values(levels)), castingTime: text(input.castingTime || "1 standard action", 80), components: text(input.components || "V, S", 80), range: text(input.range, 80), duration: text(input.duration, 80), save: text(input.save, 80), description: text(input.description, 4000) };
      if (input.dice) {
        const dice = /^(.+)d(\d{1,3})$/i.exec(String(input.dice).replace(/\s+/g, ""));
        if (!dice) throw new Error("Spell dice look like 1d6 or min(10,@cl)d6.");
        spell.roll = { count: dice[1], die: Number(dice[2]), bonus: text(input.bonus, 80), type: text(input.damageType, 40), healing: !!input.healing, save: /half/i.test(spell.save) ? "half" : "" };
      }
      return spell;
    },
  });
  kinds.set("feat", {
    ...info("feat"),
    describe: (entry) => [entry.type || "", entry.prerequisites || ""].filter(Boolean).join(" · "),
    add: (doc, entry, options) => {
      doc.feats.push(sheets.featFrom(entry, options, system));
    },
    form: (input) => {
      const changes = changesFrom(input);
      return { ...named(input, "feat"), type: text(input.type || "General", 30), prerequisites: text(input.prerequisites, 300), benefit: text(input.description, 4000), ...(changes.length ? { changes } : {}) };
    },
  });
  kinds.set("class", {
    ...info("class"),
    describe: (entry) => "d" + entry.hd + " · " + (entry.bab === "full" ? "full" : entry.bab === "medium" ? "three-quarter" : "half") + " attack" + (entry.casting ? " · casts spells" : ""),
    add: (doc, entry, options) => engine.addLevel(doc, entry, { hp: options.hp === undefined ? "auto" : options.hp }).doc,
  });
  kinds.set("race", {
    ...info("race"),
    describe: (entry) => [title(entry.size), entry.speed ? entry.speed + " ft." : ""].filter(Boolean).join(" · "),
    add: (doc, entry, options) => {
      sheets.applyRace(doc, entry, options);
    },
  });
  kinds.set("buff", {
    ...info("buff"),
    statblock: true,
    describe: (entry) => entry.group || "Effect",
    group: (entry) => entry.group || "",
    add: (doc, entry, options, derived) => {
      doc.buffs = doc.buffs.filter((buff) => buff.entryId !== entry.id);
      doc.buffs.push(sheets.buffFrom(entry, { level: options.level || derived.level, rounds: options.rounds }));
    },
    form: (input) => {
      const changes = changesFrom(input);
      return { ...named(input, "buff"), group: "Custom", text: text(input.description, 4000), changes, leveled: changes.some((change) => String(change.formula || "").includes("@buff.level")) };
    },
  });
}
