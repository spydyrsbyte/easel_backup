import { element as el } from "../safe.mjs";

export function renderInventoryTab(sheet, p) {
  const root = el("div", "pf1e-tab-inventory kit-content");
  const items = Array.isArray(p.items) ? p.items : [];
  const derived = p.derived || {};
  const actor = p.actor || {};
  const isGM = !!p.isGM;

  const eqWrap = el("div", "pf1e-equipmentslots-wrap");
  eqWrap.append(sheet.slots.inventoryEquipment);
  root.append(eqWrap);

  const enc = derived.encumbrance || { totalWeightLbs: 0, loadCategory: "light", maxDex: null, acp: 0 };
  const encRow = el("div", "pf1e-encumbrance-row kit-row");
  encRow.append(el("span", "kit-label", `Weight: ${enc.totalWeightLbs} lbs`));
  encRow.append(el("span", "kit-badge", `Load: ${String(enc.loadCategory).toUpperCase()}`));
  if (enc.maxDex !== null && enc.maxDex !== undefined) {
    encRow.append(el("span", "kit-badge", `Max Dex: ${enc.maxDex}`));
  }
  encRow.append(el("span", "kit-badge", `ACP: ${enc.acp}`));
  root.append(encRow);

  const cur = actor.currency || { pp: 0, gp: 0, sp: 0, cp: 0, bank: { pp: 0, gp: 0, sp: 0, cp: 0 } };
  const curRow = el("div", "pf1e-currency-bar kit-row");
  curRow.append(el("strong", "kit-label", "Currency:"));
  curRow.append(el("span", "kit-badge", `${cur.pp ?? 0} pp`));
  curRow.append(el("span", "kit-badge", `${cur.gp ?? 0} gp`));
  curRow.append(el("span", "kit-badge", `${cur.sp ?? 0} sp`));
  curRow.append(el("span", "kit-badge", `${cur.cp ?? 0} cp`));
  if (cur.bank) {
    curRow.append(el("span", "kit-muted", `(Bank: ${cur.bank.gp ?? 0} gp)`));
  }
  root.append(curRow);

  const itemCategories = [
    { label: "Weapons", filter: (i) => i.weaponCategory || i.baseDamageDice || i.type === "Weapon" },
    { label: "Armor & Shields", filter: (i) => i.armorBonus !== undefined || i.shieldBonus !== undefined || i.type === "Armor" || i.type === "Shield" },
    { label: "Wondrous Items", filter: (i) => i.type === "WondrousItem" },
    { label: "Consumables", filter: (i) => i.consumableType || i.type === "Consumable" },
    { label: "Containers", filter: (i) => i.capacityLbs !== undefined || i.type === "Container" },
    { label: "Loot", filter: (i) => i.type === "Loot" },
    { label: "Implants", filter: (i) => i.type === "Implant" },
    { label: "Other Gear", filter: (i) => !i.weaponCategory && !i.baseDamageDice && i.armorBonus === undefined && i.shieldBonus === undefined && !["WondrousItem", "Consumable", "Container", "Loot", "Implant", "Weapon", "Armor", "Shield"].includes(i.type) }
  ];

  for (const cat of itemCategories) {
    const catItems = items.filter(cat.filter);
    if (catItems.length === 0) continue;

    const catSection = el("div", "pf1e-item-category kit-content");
    catSection.append(el("h4", "kit-label", cat.label));

    const table = el("table", "kit-table pf1e-items-table");
    const thead = el("thead");
    const headerRow = el("tr");
    for (const h of ["Name", "Status", "Charges", "Weight", "Price", "Actions"]) {
      headerRow.append(el("th", "", h));
    }
    thead.append(headerRow);
    table.append(thead);

    const tbody = el("tbody");
    for (const item of catItems) {
      const row = el("tr");
      const isIdentified = item.identified !== false;
      const displayName = isIdentified || isGM ? (item.name || "Item") : (item.unidentifiedName || "Unidentified Item");

      const nameCell = el("td", "pf1e-item-name-cell");
      nameCell.append(el("strong", "", displayName));
      if (!isIdentified && isGM) {
        nameCell.append(el("span", "kit-badge", "Unidentified"));
      }
      row.append(nameCell);

      const statusCell = el("td");
      if (item.equipped) statusCell.append(el("span", "kit-badge", "Equipped"));
      if (item.carried) statusCell.append(el("span", "kit-badge", "Carried"));
      if (item.masterwork) statusCell.append(el("span", "kit-badge", "MW"));
      if (item.broken) statusCell.append(el("span", "kit-badge", "Broken"));
      row.append(statusCell);

      const chargesCell = el("td");
      if (item.charges) {
        const val = item.charges.value ?? 0;
        const max = item.charges.max ?? val;
        chargesCell.append(el("span", "", `${val} / ${max}`));
      } else {
        chargesCell.append(el("span", "kit-muted", "-"));
      }
      row.append(chargesCell);

      const weightCell = el("td", "", `${(item.weightLbs ?? 0) * (item.quantity ?? 1)} lbs`);
      row.append(weightCell);

      const priceCell = el("td", "", `${item.priceGp ?? 0} gp`);
      row.append(priceCell);

      const actCell = el("td", "kit-row");
      if (isGM) {
        const idToggleBtn = el("button", "kit-button", isIdentified ? "Un-ID" : "ID");
        idToggleBtn.type = "button";
        idToggleBtn.disabled = p.canEdit === false;
        idToggleBtn.onclick = () => {
          sheet.emit("toggleIdentified", { itemId: item.id, identified: !isIdentified });
        };
        actCell.append(idToggleBtn);
      } else if (!isIdentified) {
        const idBtn = el("button", "kit-button", "Identify");
        idBtn.type = "button";
        idBtn.disabled = p.canEdit === false;
        idBtn.onclick = () => {
          sheet.emit("identifyItem", { itemId: item.id });
        };
        actCell.append(idBtn);
      }

      const editBtn = el("button", "kit-button", "Edit");
      editBtn.type = "button";
      editBtn.disabled = p.canEdit === false;
      editBtn.onclick = () => {
        sheet.emit("editRecord", { recordType: item.type || "Item", recordId: item.id });
      };
      actCell.append(editBtn);

      row.append(actCell);
      tbody.append(row);
    }
    table.append(tbody);
    catSection.append(table);
    root.append(catSection);
  }

  if (p.canEdit) root.append(sheet.button("Add Equipment", "createRecord", { recordType: "Item" }));

  return root;
}
