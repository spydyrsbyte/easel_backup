import { element as el } from "../safe.mjs";

export function renderAttributesTab(sheet, p) {
  const root = el("div", "pf1e-tab-attributes kit-content");
  const actor = p.actor || {};
  const derived = p.derived || {};

  const basics = el("div", "pf1e-stat-fields");
  for (const [label, key, value, branch] of [
    ["Hit points", "hp", actor.health?.hp ?? 10, "health"],
    ["Maximum HP", "maxHp", actor.health?.maxHp ?? 10, "health"],
    ["Temporary HP", "tempHp", actor.health?.tempHp ?? 0, "health"],
    ["Base attack bonus", "baseAtk", actor.baseAtk ?? 0],
    ["Base Fortitude", "saveFortBase", actor.saveFortBase ?? 0],
    ["Base Reflex", "saveRefBase", actor.saveRefBase ?? 0],
    ["Base Will", "saveWillBase", actor.saveWillBase ?? 0],
    ["Initiative bonus", "initBonus", actor.initBonus ?? 0],
    ["Land speed", "land", actor.speeds?.land ?? 30, "speeds"]
  ]) {
    const field = el("label", "kit-field");
    field.append(el("span", "kit-label", label));
    const input = el("input");
    input.type = "number";
    input.value = String(value);
    input.disabled = !p.canEdit;
    input.setAttribute("aria-label", label);
    input.onchange = () => sheet.emit("updateActor", { changes: branch ? { [branch]: { [key]: Number(input.value) } } : { [key]: Number(input.value) } });
    field.append(input);
    basics.append(field);
  }
  root.append(basics);

  const abWrap = el("div", "pf1e-abilityblock-wrap");
  abWrap.append(sheet.slots.attributesAbilities);
  root.append(abWrap);

  const defWrap = el("div", "pf1e-defense-wrap");
  defWrap.append(sheet.slots.attributesDefenses);
  root.append(defWrap);

  if (sheet.slots.attributesModifiers) {
    const modWrap = el("div", "pf1e-modifiers-wrap kit-content");
    modWrap.append(el("h4", "kit-label", "Active Modifiers Breakdown"));
    modWrap.append(sheet.slots.attributesModifiers);
    root.append(modWrap);
  }

  const sensesResistWrap = el("div", "pf1e-senses-resistances kit-content");
  sensesResistWrap.append(el("h4", "kit-label", "Senses & Resistances"));

  const sensesList = el("div", "kit-row pf1e-senses-row");
  const senses = actor.senses || {};
  sensesList.append(el("span", "kit-badge", "Vision: " + (senses.visionPreset || "normal")));
  if (senses.darkvisionFeet) {
    sensesList.append(el("span", "kit-badge", `Darkvision: ${senses.darkvisionFeet} ft.`));
  }
  if (senses.lowLight) {
    sensesList.append(el("span", "kit-badge", "Low-Light Vision"));
  }
  if (senses.blindsenseFeet) {
    sensesList.append(el("span", "kit-badge", `Blindsense: ${senses.blindsenseFeet} ft.`));
  }
  if (senses.blindsightFeet) {
    sensesList.append(el("span", "kit-badge", `Blindsight: ${senses.blindsightFeet} ft.`));
  }
  if (senses.tremorsenseFeet) {
    sensesList.append(el("span", "kit-badge", `Tremorsense: ${senses.tremorsenseFeet} ft.`));
  }
  if (senses.scent) {
    sensesList.append(el("span", "kit-badge", "Scent"));
  }
  if (senses.seeInvisibility) {
    sensesList.append(el("span", "kit-badge", "See Invisibility"));
  }
  if (senses.trueSeeingFeet) {
    sensesList.append(el("span", "kit-badge", `True Seeing: ${senses.trueSeeingFeet} ft.`));
  }
  sensesResistWrap.append(sensesList);

  const defs = actor.defenses || {};
  const resRow = el("div", "kit-row pf1e-resist-row");

  if (Array.isArray(defs.drEntries) && defs.drEntries.length > 0) {
    const drText = defs.drEntries.map((d) => `${d.amount}/${d.bypass || "-"}`).join(", ");
    resRow.append(el("span", "kit-badge", "DR: " + drText));
  }
  if (defs.sr) {
    resRow.append(el("span", "kit-badge", "SR: " + defs.sr));
  }
  if (Array.isArray(defs.energyResistances) && defs.energyResistances.length > 0) {
    const erText = defs.energyResistances.map((e) => `${e.type} ${e.amount}`).join(", ");
    resRow.append(el("span", "kit-badge", "Resist: " + erText));
  }
  if (Array.isArray(defs.immunities) && defs.immunities.length > 0) {
    resRow.append(el("span", "kit-badge", "Immune: " + defs.immunities.join(", ")));
  }
  if (Array.isArray(defs.vulnerabilities) && defs.vulnerabilities.length > 0) {
    resRow.append(el("span", "kit-badge", "Vulnerable: " + defs.vulnerabilities.join(", ")));
  }
  sensesResistWrap.append(resRow);
  root.append(sensesResistWrap);

  return root;
}
