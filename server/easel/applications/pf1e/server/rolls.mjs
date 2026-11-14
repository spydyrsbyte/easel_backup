const signed = (value) => (value >= 0 ? "+" : "") + value;
const list = (value) => (Array.isArray(value) ? value : []);
const die = (natural) => ({ sides: 20, value: natural });
const DAMAGE_NAMES = { b: "bludgeoning", p: "piercing", s: "slashing" };

export function damageLabel(type) {
  return String(type || "")
    .split(/\s+/)
    .map((word) => DAMAGE_NAMES[word.toLowerCase()] || word)
    .join(" ")
    .trim();
}

function breakdown(parts) {
  return list(parts)
    .filter((part) => part && part.value)
    .map((part) => part.label + " " + signed(part.value))
    .join(", ");
}

export function checkCard(roll, { title, subtitle = "", parts = [], extra = [] }) {
  const notes = [];
  if (roll.take) notes.push("Took " + roll.natural);
  if (roll.dc !== null) notes.push((roll.success ? "Success" : "Failure") + " against DC " + roll.dc);
  if (roll.natural === 20 && !roll.take) notes.push("Natural 20");
  if (roll.natural === 1 && !roll.take) notes.push("Natural 1");
  return {
    system: "pf1e",
    type: "check",
    title,
    subtitle,
    sections: [{ formula: "d20" + signed(roll.bonus), dice: roll.take ? [] : [die(roll.natural)], total: roll.total, note: notes.join(" · "), tone: roll.success === true ? "good" : roll.success === false ? "bad" : "" }],
    rows: extra,
    detail: breakdown(parts),
    actions: [],
  };
}

function damageSection(title, damage) {
  const types = damage.parts.map((part) => damageLabel(part.type)).filter(Boolean);
  return { title, formula: damage.parts.map((part) => part.formula).join(" + "), dice: damage.parts.flatMap((part) => part.dice), total: damage.total, note: [...new Set(types)].join(" and ") };
}

export function attackCard(result, definition, { subtitle = "" } = {}) {
  const sections = [];
  const actions = [];
  const type = list(definition.damage)
    .map((part) => part.type)
    .filter(Boolean)
    .join(" ");
  const bypass = Number(definition.enhancement) > 0 || definition.magic ? ["magic"] : [];
  result.strikes.forEach((strike, index) => {
    const label = result.strikes.length > 1 ? "Attack " + (index + 1) : "Attack";
    const notes = [];
    let tone = "";
    if (strike.fumble) {
      notes.push("Natural 1: miss");
      tone = "bad";
    } else if (strike.hit === true) {
      notes.push("Hit");
      tone = "good";
    } else if (strike.hit === false) {
      notes.push("Miss");
      tone = "bad";
    }
    if (strike.threat) {
      const confirm = strike.confirm;
      notes.push("Critical threat, confirmation " + confirm.total + (confirm.confirmed === true ? ": confirmed" : confirm.confirmed === false ? ": not confirmed" : ""));
      if (confirm.confirmed !== false) tone = "crit";
    }
    sections.push({ title: label, formula: "d20" + signed(strike.bonus), dice: [die(strike.natural), ...(strike.confirm ? [{ ...die(strike.confirm.natural), label: "✓" + strike.confirm.natural }] : [])], total: strike.total, note: notes.join(" · "), tone });
    if (strike.damage) {
      sections.push(damageSection(result.strikes.length > 1 ? "Damage " + (index + 1) : "Damage", strike.damage));
      actions.push({ id: "apply", label: (result.strikes.length > 1 ? "Hit " + (index + 1) + ": " : "Apply ") + strike.damage.total, payload: { amount: strike.damage.total, type, nonlethal: !!result.nonlethal, bypass } });
    }
    if (strike.critical) {
      sections.push({ ...damageSection("Critical ×" + strike.critical.multiplier, { total: strike.critical.total, parts: strike.critical.parts }), tone: "crit" });
      actions.push({ id: "apply", label: "Critical: " + strike.critical.total, payload: { amount: strike.critical.total, type, nonlethal: !!result.nonlethal, bypass } });
    }
  });
  return { system: "pf1e", type: "attack", title: result.label, subtitle: subtitle || (result.full ? "Full attack" : result.kind === "ranged" ? "Ranged attack" : "Melee attack"), sections, rows: definition.notes ? [{ label: "Also", value: definition.notes }] : [], detail: breakdown(definition.attackParts), actions };
}

export function rollSection(title, rolled, note = "", tone = "") {
  return { title, formula: rolled.formula, dice: rolled.dice, total: rolled.total, note, tone };
}

export function spellCard({ spell, caster, level, rolled, attack }) {
  const rows = [];
  if (spell.school) rows.push({ label: "School", value: spell.school[0].toUpperCase() + spell.school.slice(1) + " " + level });
  if (spell.castingTime) rows.push({ label: "Casting time", value: spell.castingTime });
  if (spell.components) rows.push({ label: "Components", value: spell.components });
  if (spell.range) rows.push({ label: "Range", value: spell.range });
  if (spell.duration) rows.push({ label: "Duration", value: spell.duration });
  if (spell.save) rows.push({ label: "Save", value: spell.save + " (DC " + caster.dc + ")" });
  rows.push({ label: "Caster level", value: String(caster.casterLevel) });
  const sections = [];
  const actions = [];
  if (attack) sections.push({ title: attack.label, formula: "d20" + signed(attack.roll.bonus), dice: [die(attack.roll.natural)], total: attack.roll.total, note: attack.roll.natural === 20 ? "Natural 20" : attack.roll.natural === 1 ? "Natural 1: miss" : "", tone: attack.roll.natural === 1 ? "bad" : "" });
  if (rolled) {
    const roll = spell.roll || {};
    const kind = roll.healing ? "Healing" : roll.type && !/damage|fire|cold|acid|electricity|sonic|force|negative|positive|light|divine|death|bludgeoning/i.test(roll.type) ? roll.type[0].toUpperCase() + roll.type.slice(1) : "Damage";
    sections.push(rollSection(kind, rolled, roll.healing || kind !== "Damage" ? "" : damageLabel(roll.type), roll.healing ? "good" : ""));
    if (roll.healing) actions.push({ id: "apply", label: "Heal " + rolled.total, payload: { amount: rolled.total, healing: true } });
    else if (kind === "Damage") {
      actions.push({ id: "apply", label: "Apply " + rolled.total, payload: { amount: rolled.total, type: roll.type || "", bypass: ["magic"] } });
      if (roll.save === "half") actions.push({ id: "apply", label: "Half: " + Math.floor(rolled.total / 2), payload: { amount: Math.floor(rolled.total / 2), type: roll.type || "", bypass: ["magic"] } });
    } else if (/temporary hit points/i.test(roll.type || "")) actions.push({ id: "apply", label: "Grant " + rolled.total + " temporary", payload: { amount: rolled.total, temporary: true } });
  }
  const saveMatch = /^(Fortitude|Reflex|Will)/i.exec(spell.save || "");
  if (saveMatch && !/harmless/i.test(spell.save)) actions.push({ id: "save", label: saveMatch[1] + " save DC " + caster.dc, payload: { save: { fortitude: "fort", reflex: "ref", will: "will" }[saveMatch[1].toLowerCase()], dc: caster.dc } });
  if (spell.buff) actions.push({ id: "effect", label: "Apply effect", payload: { entryId: spell.buff, level: caster.casterLevel } });
  return { system: "pf1e", type: "spell", title: spell.name, subtitle: caster.name + " spell", sections, rows, text: spell.description || "", actions };
}

export function textCard(title, subtitle, textBody, rows = [], actions = []) {
  return { system: "pf1e", type: "text", title, subtitle, sections: [], rows, text: textBody, actions };
}

export function forViewer(card, gm) {
  if (gm || !card || !card.gmRows) {
    if (card && card.gmRows) return { ...card, rows: [...list(card.rows), ...card.gmRows], gmRows: undefined };
    return card;
  }
  const { gmRows, ...rest } = card;
  void gmRows;
  return rest;
}
