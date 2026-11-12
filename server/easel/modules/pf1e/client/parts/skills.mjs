import { element as el } from "../safe.mjs";

const DEFAULT_SKILLS = {
  acr: { name: "Acrobatics", ability: "dex", acp: true, trainedOnly: false },
  apr: { name: "Appraise", ability: "int", acp: false, trainedOnly: false },
  art: { name: "Artistry", ability: "int", acp: false, trainedOnly: false },
  blf: { name: "Bluff", ability: "cha", acp: false, trainedOnly: false },
  clm: { name: "Climb", ability: "str", acp: true, trainedOnly: false },
  crf: { name: "Craft", ability: "int", acp: false, trainedOnly: false },
  dip: { name: "Diplomacy", ability: "cha", acp: false, trainedOnly: false },
  dev: { name: "Disable Device", ability: "dex", acp: true, trainedOnly: true },
  dis: { name: "Disguise", ability: "cha", acp: false, trainedOnly: false },
  esc: { name: "Escape Artist", ability: "dex", acp: true, trainedOnly: false },
  fly: { name: "Fly", ability: "dex", acp: true, trainedOnly: false },
  han: { name: "Handle Animal", ability: "cha", acp: false, trainedOnly: true },
  hea: { name: "Heal", ability: "wis", acp: false, trainedOnly: false },
  int: { name: "Intimidate", ability: "cha", acp: false, trainedOnly: false },
  kar: { name: "Knowledge (arcana)", ability: "int", acp: false, trainedOnly: true },
  kdu: { name: "Knowledge (dungeoneering)", ability: "int", acp: false, trainedOnly: true },
  ken: { name: "Knowledge (engineering)", ability: "int", acp: false, trainedOnly: true },
  kge: { name: "Knowledge (geography)", ability: "int", acp: false, trainedOnly: true },
  khi: { name: "Knowledge (history)", ability: "int", acp: false, trainedOnly: true },
  klo: { name: "Knowledge (local)", ability: "int", acp: false, trainedOnly: true },
  kna: { name: "Knowledge (nature)", ability: "int", acp: false, trainedOnly: true },
  kno: { name: "Knowledge (nobility)", ability: "int", acp: false, trainedOnly: true },
  kpl: { name: "Knowledge (planes)", ability: "int", acp: false, trainedOnly: true },
  kre: { name: "Knowledge (religion)", ability: "int", acp: false, trainedOnly: true },
  lin: { name: "Linguistics", ability: "int", acp: false, trainedOnly: true },
  lor: { name: "Lore", ability: "int", acp: false, trainedOnly: true },
  per: { name: "Perception", ability: "wis", acp: false, trainedOnly: false },
  prf: { name: "Perform", ability: "cha", acp: false, trainedOnly: false },
  pro: { name: "Profession", ability: "wis", acp: false, trainedOnly: true },
  rid: { name: "Ride", ability: "dex", acp: true, trainedOnly: false },
  sen: { name: "Sense Motive", ability: "wis", acp: false, trainedOnly: false },
  slt: { name: "Sleight of Hand", ability: "dex", acp: true, trainedOnly: true },
  spl: { name: "Spellcraft", ability: "int", acp: false, trainedOnly: true },
  ste: { name: "Stealth", ability: "dex", acp: true, trainedOnly: false },
  sur: { name: "Survival", ability: "wis", acp: false, trainedOnly: false },
  swm: { name: "Swim", ability: "str", acp: true, trainedOnly: false },
  umd: { name: "Use Magic Device", ability: "cha", acp: false, trainedOnly: true }
};

export function renderSkillsTab(sheet, p) {
  const root = el("div", "pf1e-tab-skills kit-content");
  const actor = p.actor || {};
  const derived = p.derived || {};
  const actorSkills = actor.skills || {};
  const derivedSkills = derived.skills || {};

  let totalRanks = 0;
  let bgRanks = 0;
  for (const [sKey, s] of Object.entries(actorSkills)) {
    const r = Number(s.ranks || 0);
    totalRanks += r;
    if (["art", "crf", "lor", "prf", "pro", "kge", "khi", "kno", "lin", "app"].some((k) => sKey.startsWith(k))) {
      bgRanks += r;
    }
  }

  const maxRanks = derived.maxSkillRanks ?? (Array.isArray(p.classes)
    ? p.classes.reduce((sum, c) => sum + (Number(c.skillRanksPerLevel || 2) + Math.max(0, derived.abilities?.int?.mod ?? 0)) * (Number(c.classLevel) || 1), 0)
    : 10);

  const ranksBar = el("div", "pf1e-ranks-summary kit-row");
  if (actor.settings?.backgroundSkills) {
    const maxBg = Array.isArray(p.classes) ? p.classes.reduce((sum, c) => sum + 2 * (Number(c.classLevel) || 1), 0) : 4;
    ranksBar.append(el("strong", "kit-label", `Ranks Spent: ${totalRanks - bgRanks}/${maxRanks} (Background: ${bgRanks}/${maxBg})`));
  } else {
    ranksBar.append(el("strong", "kit-label", `Total Ranks Spent: ${totalRanks} / ${maxRanks}`));
  }
  root.append(ranksBar);

  const table = el("table", "kit-table pf1e-skills-table");
  const thead = el("thead");
  const headerRow = el("tr");
  for (const h of ["Roll", "Skill Name", "Total", "Ability", "Ranks", "Class", "ACP", "Misc", "Take"]) {
    headerRow.append(el("th", "", h));
  }
  thead.append(headerRow);
  table.append(thead);

  const tbody = el("tbody");
  const allSkills = { ...DEFAULT_SKILLS };
  for (const [k, v] of Object.entries(actorSkills)) {
    if (!allSkills[k] && v.name) {
      allSkills[k] = {
        name: v.name,
        ability: v.ability || "int",
        acp: Boolean(v.acp),
        trainedOnly: Boolean(v.trainedOnly)
      };
    }
  }

  for (const [key, meta] of Object.entries(allSkills)) {
    const sData = actorSkills[key] || {};
    const dData = derivedSkills[key] || {};
    const ranks = Number(sData.ranks ?? 0);
    const abilityMod = derived.abilities?.[meta.ability]?.mod ?? 0;
    const isClass = Boolean(sData.isClassSkill ?? sData.classSkillOverride);
    const acp = meta.acp ? (derived.encumbrance?.acp ?? 0) : 0;
    const classBonus = isClass && ranks >= 1 ? 3 : 0;
    const miscBonus = Number(sData.miscBonus ?? sData.misc ?? 0);
    const totalBonus = dData.total ?? (abilityMod + ranks + classBonus + acp + miscBonus);
    const sign = totalBonus >= 0 ? "+" + totalBonus : String(totalBonus);

    const row = el("tr");
    row.dataset.skill = key;

    const rollCell = el("td");
    const rollBtn = el("button", "kit-button pf1e-skill-roll-btn", "🎲");
    rollBtn.type = "button";
    rollBtn.disabled = p.canControl === false;
    rollBtn.onclick = () => {
      sheet.emit("rollSkill", { skillId: key, ability: meta.ability, modifier: totalBonus, take: 0 });
    };
    rollCell.append(rollBtn);
    row.append(rollCell);

    const nameCell = el("td");
    nameCell.append(el("strong", "", meta.name));
    row.append(nameCell);

    const totalCell = el("td", "pf1e-skill-total");
    const totalBadge = el("span", "kit-badge", sign);
    totalBadge.title = `Ability (${meta.ability}): ${abilityMod}\nRanks: ${ranks}\nClass Skill: ${classBonus}\nACP: ${acp}\nMisc: ${miscBonus}`;
    totalCell.append(totalBadge);
    row.append(totalCell);

    const abCell = el("td", "", meta.ability.toUpperCase());
    row.append(abCell);

    const ranksCell = el("td");
    const ranksInput = el("input", "pf1e-skill-ranks-input");
    ranksInput.type = "number";
    ranksInput.disabled = p.canEdit === false;
    ranksInput.min = "0";
    ranksInput.value = String(ranks);
    ranksInput.style.width = "48px";
    ranksInput.onchange = () => {
      sheet.emit("updateSkillRanks", { skillId: key, ranks: Math.max(0, parseInt(ranksInput.value, 10) || 0) });
    };
    ranksCell.append(ranksInput);
    row.append(ranksCell);

    const classCell = el("td");
    const classChk = el("input");
    classChk.type = "checkbox";
    classChk.disabled = p.canEdit === false;
    classChk.checked = isClass;
    classChk.onchange = () => {
      sheet.emit("updateSkillClassSkill", { skillId: key, isClassSkill: classChk.checked });
    };
    classCell.append(classChk);
    row.append(classCell);

    const acpCell = el("td", "", meta.acp ? (acp ? String(acp) : "-") : "");
    row.append(acpCell);

    const miscCell = el("td");
    const miscBadge = el("span", "kit-muted", miscBonus ? (miscBonus >= 0 ? "+" + miscBonus : String(miscBonus)) : "-");
    miscCell.append(miscBadge);
    row.append(miscCell);

    const takeCell = el("td", "kit-row");
    const t10Btn = el("button", "kit-button", "T10");
    t10Btn.type = "button";
    t10Btn.disabled = p.canControl === false;
    t10Btn.onclick = () => {
      sheet.emit("rollSkill", { skillId: key, ability: meta.ability, modifier: totalBonus, take: 10 });
    };
    const t20Btn = el("button", "kit-button", "T20");
    t20Btn.type = "button";
    t20Btn.disabled = p.canControl === false;
    t20Btn.onclick = () => {
      sheet.emit("rollSkill", { skillId: key, ability: meta.ability, modifier: totalBonus, take: 20 });
    };
    takeCell.append(t10Btn, t20Btn);
    row.append(takeCell);

    tbody.append(row);
  }
  table.append(tbody);
  root.append(table);

  const subSkillRow = el("div", "kit-row pf1e-add-subskill-row");
  const parentSelect = el("select", "pf1e-parent-skill-select");
  for (const [sk, sl] of [["crf", "Craft"], ["prf", "Perform"], ["pro", "Profession"], ["kar", "Knowledge"], ["art", "Artistry"], ["lor", "Lore"]]) {
    const opt = el("option", "", sl);
    opt.value = sk;
    parentSelect.append(opt);
  }
  const subNameInput = el("input", "pf1e-subskill-name-input");
  subNameInput.placeholder = "Sub-skill name (e.g. Alchemy, Piano)...";
  const addSubBtn = el("button", "kit-button pf1e-btn-add-subskill", "Add Sub-Skill");
  addSubBtn.type = "button";
  addSubBtn.onclick = () => {
    if (subNameInput.value) {
      const selectedChild = (parentSelect.children || []).find((c) => c.value === parentSelect.value);
      const parentLabel = selectedChild?.textContent || parentSelect.value || "Skill";
      sheet.emit("addCustomSkill", {
        parentKey: parentSelect.value || "crf",
        name: `${parentLabel} (${subNameInput.value})`
      });
      subNameInput.value = "";
    }
  };
  subSkillRow.append(parentSelect, subNameInput, addSubBtn);
  root.append(subSkillRow);

  return root;
}
