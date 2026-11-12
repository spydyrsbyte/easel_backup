import { element as el } from "../safe.mjs";

export function renderCombatTab(sheet, p) {
  const root = el("div", "pf1e-tab-combat kit-content");
  const derived = p.derived || {};
  const actor = p.actor || {};

  const statsRow = el("div", "pf1e-combat-stats kit-row");
  const bab = derived.bab ?? actor.baseAtk ?? 0;
  const iteratives = derived.iteratives || [bab];
  statsRow.append(el("span", "kit-badge", "BAB: " + iteratives.map((b) => (b >= 0 ? "+" + b : String(b))).join("/")));

  const initBonus = derived.initiative ?? derived.init ?? derived.abilities?.dex?.mod ?? 0;
  const initSign = initBonus >= 0 ? "+" + initBonus : String(initBonus);
  const initBtn = el("button", "kit-button pf1e-btn-combat-init", `Init: ${initSign}`);
  initBtn.type = "button";
  initBtn.onclick = () => {
    sheet.emit("rollInitiative", { actorId: actor.id || "" });
  };
  statsRow.append(initBtn);

  const cmb = derived.cmb ?? 0;
  const cmd = derived.cmd ?? 10;
  const cmdFF = derived.cmdFlatFooted ?? cmd;
  statsRow.append(el("span", "kit-badge", `CMB: ${cmb >= 0 ? "+" + cmb : cmb}`));
  statsRow.append(el("span", "kit-badge", `CMD: ${cmd} (FF: ${cmdFF})`));
  root.append(statsRow);

  const maneuvers = [
    "Bull Rush", "Dirty Trick", "Disarm", "Drag", "Grapple",
    "Overrun", "Reposition", "Steal", "Sunder", "Trip"
  ];
  const manRow = el("div", "pf1e-maneuvers-row kit-row");
  for (const man of maneuvers) {
    const key = man.toLowerCase().replace(/\s+/g, "");
    const bonus = (derived.maneuvers?.[key] ?? cmb);
    const sign = bonus >= 0 ? "+" + bonus : String(bonus);
    const manBadge = el("button", "kit-button pf1e-maneuver-badge", `${man}: ${sign}`);
    manBadge.type = "button";
    manBadge.disabled = p.canControl === false;
    manBadge.onclick = (e) => {
      sheet.emit("useAction", {
        actionId: "maneuver-" + key,
        mode: e.shiftKey ? "fast" : "normal",
        take: 0,
        conditionalModifiers: [],
        actionData: { name: man, attackBonus: bonus }
      });
    };
    manRow.append(manBadge);
  }
  root.append(manRow);

  const actions = Array.isArray(p.actions) ? p.actions : [];
  const categories = [
    { label: "Melee Weapons", filter: (a) => a.actionType === "mwak" || a.type === "melee" || (!a.actionType && a.range?.units === "melee") },
    { label: "Ranged Weapons", filter: (a) => a.actionType === "rwak" || a.type === "ranged" || (!a.actionType && a.range?.units !== "melee" && a.range?.value > 5) },
    { label: "Natural Attacks", filter: (a) => a.actionType === "natural" || a.isNatural },
    { label: "Other Actions & Maneuvers", filter: (a) => a.actionType !== "mwak" && a.actionType !== "rwak" && a.actionType !== "natural" && !a.isNatural }
  ];

  for (const cat of categories) {
    const catActions = actions.filter(cat.filter);
    if (catActions.length === 0) continue;

    const catSection = el("div", "pf1e-action-category kit-content");
    catSection.append(el("h4", "kit-label", cat.label));

    const listNode = el("div", "kit-list pf1e-action-list");
    for (const act of catActions) {
      const row = el("div", "kit-item kit-row pf1e-action-row");
      const name = el("strong", "kit-label pf1e-action-name", act.name || "Action");
      row.append(name);

      if (act.attackBonusFormula) {
        row.append(el("span", "kit-muted", "Formula: " + act.attackBonusFormula));
      }
      if (Array.isArray(act.damageParts) && act.damageParts.length > 0) {
        const dmgText = act.damageParts.map((d) => d.formula || d).join(" + ");
        row.append(el("span", "kit-badge", "Dmg: " + dmgText));
      }

      const atkBtn = el("button", "kit-button pf1e-btn-attack", "Attack");
      atkBtn.type = "button";
      atkBtn.disabled = p.canControl === false;
      atkBtn.onclick = (e) => {
        sheet.emit("useAction", {
          actionId: act.id,
          mode: e.shiftKey ? "fast" : "normal",
          take: 0,
          conditionalModifiers: act.conditionalModifiers || [],
          actionData: act
        });
      };

      const fullAtkBtn = el("button", "kit-button pf1e-btn-fullattack", "Full Attack");
      fullAtkBtn.type = "button";
      fullAtkBtn.disabled = p.canControl === false;
      fullAtkBtn.onclick = (e) => {
        sheet.emit("useAction", {
          actionId: act.id,
          mode: e.shiftKey ? "fast-full" : "full",
          take: 0,
          conditionalModifiers: act.conditionalModifiers || [],
          actionData: act
        });
      };

      const editBtn = el("button", "kit-button pf1e-btn-edit-action", "Edit");
      editBtn.type = "button";
      editBtn.disabled = p.canEdit === false;
      editBtn.onclick = () => {
        sheet.emit("editRecord", { recordType: "Action", recordId: act.id });
      };

      row.append(atkBtn, fullAtkBtn, editBtn);
      listNode.append(row);
    }
    catSection.append(listNode);
    root.append(catSection);
  }

  if (p.canEdit) root.append(sheet.button("Add Action", "createRecord", { recordType: "Action" }));

  return root;
}
