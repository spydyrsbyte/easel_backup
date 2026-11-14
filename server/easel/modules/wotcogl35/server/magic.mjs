import { bonusSpells, copy } from "./tables.mjs";

const list = (value) => (Array.isArray(value) ? value : []);
const int = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : fallback);

export const vancian = {
  name: "Spell slots",
  derive(ctx, derived, { key, level, rules, state }) {
    const ability = derived.abilities[rules.ability] || derived.abilities.int;
    const vars = { class: { level } };
    const casterLevel = Math.max(1, level + int(rules.casterLevelOffset) + ctx.total(["cl", "cl." + key], vars).total);
    const row = list(rules.slots)[Math.min(level, list(rules.slots).length) - 1] || [];
    const knownRow = list(rules.known)[Math.min(level, list(rules.known).length) - 1] || null;
    const dcBonus = ctx.total(["dc"], vars).total;
    const levels = [];
    for (let spellLevel = 0; spellLevel < row.length; spellLevel++) {
      const base = row[spellLevel];
      if (base === null || base === undefined) continue;
      const able = ability.score !== null && ability.score >= 10 + spellLevel;
      const extra = spellLevel > 0 ? int(rules.extraSlots) + int((state.slotBonus || {})[spellLevel]) : 0;
      const unlimited = spellLevel === 0 && rules.cantrips !== "slots";
      const regular = int(base) + bonusSpells(ability.mod, spellLevel);
      const slots = able ? regular + (regular > 0 ? extra : 0) : 0;
      levels.push({ level: spellLevel, slots: unlimited ? null : slots, prepares: unlimited ? int(base) : slots, unlimited, used: int((state.used || {})[spellLevel]), known: knownRow ? int(knownRow[spellLevel]) : null, dc: 10 + spellLevel + ability.mod + dcBonus, able });
    }
    return { type: rules.type || "prepared", list: rules.list || key, ability: rules.ability, abilityMod: ability.mod, casterLevel, concentration: casterLevel + ability.mod + ctx.total(["concentration"], vars).total, spellFailure: rules.arcane ? derived.spellFailure : 0, levels, spells: list(state.spells), prepared: list(state.prepared) };
  },
  cast(engine, doc, caster, { level, uid = "" }) {
    const row = caster.levels.find((entry) => entry.level === int(level));
    if (!row || !row.able) throw new Error("This character cannot cast spells of that level.");
    const next = copy(doc);
    const state = next.casting[caster.key] || (next.casting[caster.key] = { spells: [], prepared: [], used: {} });
    state.used = state.used || {};
    if (row.unlimited) return next;
    if (caster.type === "prepared") {
      const prepared = list(state.prepared).find((entry) => (uid ? entry.uid === uid : int(entry.level) === int(level) && !entry.cast));
      if (!prepared || prepared.cast) throw new Error("That spell is not prepared, or has already been cast.");
      prepared.cast = true;
    } else {
      if (int(state.used[level]) >= int(row.slots)) throw new Error("No level " + level + " spell slots are left today.");
      state.used[level] = int(state.used[level]) + 1;
    }
    return next;
  },
  rest(engine, doc, key) {
    const state = doc.casting[key];
    if (!state) return;
    state.used = {};
    for (const entry of list(state.prepared)) entry.cast = false;
  },
};
