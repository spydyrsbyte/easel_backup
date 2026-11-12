import { element as el } from "../safe.mjs";

const PF1E_CONDITION_NAMES = [
  "bleeding", "blinded", "confused", "cowering", "dazed", "dazzled", "dead",
  "deafened", "disabled", "dying", "energyDrained", "entangled", "exhausted",
  "fascinated", "fatigued", "fear", "frightened", "grappled", "helpless",
  "incorporeal", "invisible", "nauseated", "panicked", "paralyzed", "petrified",
  "pinned", "prone", "shaken", "sickened", "sinking", "stable", "staggered",
  "stunned", "unconscious"
];

export function renderBuffsTab(sheet, p) {
  const root = el("div", "pf1e-tab-buffs kit-content");
  const buffs = Array.isArray(p.buffs) ? p.buffs : [];
  const actor = p.actor || {};
  const currentConditions = actor.conditions || {};

  const condSection = el("div", "pf1e-conditions-section kit-content");
  condSection.append(el("h4", "kit-label", "Conditions"));
  const condGrid = el("div", "kit-row pf1e-conditions-grid");
  for (const cond of PF1E_CONDITION_NAMES) {
    const isActive = Boolean(currentConditions[cond]);
    const btn = el(
      "button",
      `kit-button pf1e-cond-toggle${isActive ? " active" : ""}`,
      cond.charAt(0).toUpperCase() + cond.slice(1)
    );
    btn.type = "button";
    btn.disabled = p.canEdit === false;
    if (isActive) {
      btn.style.borderColor = "var(--kit-accent)";
      btn.style.boxShadow = "0 0 4px var(--kit-accent)";
    }
    btn.onclick = () => {
      sheet.emit("toggleCondition", { condition: cond, active: !isActive });
    };
    condGrid.append(btn);
  }
  condSection.append(condGrid);
  root.append(condSection);

  const buffSection = el("div", "pf1e-buffs-section kit-content");
  buffSection.append(el("h4", "kit-label", "Active Buffs"));

  const table = el("table", "kit-table pf1e-buffs-table");
  const thead = el("thead");
  const headerRow = el("tr");
  for (const h of ["Active", "Name", "Type", "CL", "Duration", "Actions"]) {
    headerRow.append(el("th", "", h));
  }
  thead.append(headerRow);
  table.append(thead);

  const tbody = el("tbody");
  for (const buff of buffs) {
    const row = el("tr");
    const activeCell = el("td");
    const toggleBtn = el("button", "kit-button", buff.active ? "ON" : "OFF");
    toggleBtn.type = "button";
    toggleBtn.disabled = p.canEdit === false;
    toggleBtn.onclick = () => {
      sheet.emit("toggleBuff", { buffId: buff.id, active: !buff.active });
    };
    activeCell.append(toggleBtn);
    row.append(activeCell);

    row.append(el("td", "", buff.name || "Buff"));
    row.append(el("td", "", buff.buffType || buff.type || "Temp"));
    row.append(el("td", "", String(buff.casterLevel || buff.cl || 1)));
    row.append(el("td", "", buff.duration || "-"));

    const actCell = el("td");
    const editBtn = el("button", "kit-button", "Edit");
    editBtn.type = "button";
    editBtn.disabled = p.canEdit === false;
    editBtn.onclick = () => {
      sheet.emit("editRecord", { recordType: "Buff", recordId: buff.id });
    };
    actCell.append(editBtn);
    row.append(actCell);

    tbody.append(row);
  }
  table.append(tbody);
  buffSection.append(table);
  root.append(buffSection);

  if (p.canEdit) root.append(sheet.button("Add Buff", "createRecord", { recordType: "Buff" }));

  return root;
}
