import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";

const PF1E_BONUS_TYPES = [
  "alchemical", "armor", "bab", "circumstance", "competence", "deflection",
  "dodge", "enhancement", "inherent", "insight", "luck", "morale",
  "naturalArmor", "profane", "racial", "resistance", "sacred", "shield",
  "size", "trait", "untyped"
];

const EDITOR_TABS = [
  { id: "description", label: "Description" },
  { id: "details", label: "Details" },
  { id: "actions", label: "Actions" },
  { id: "modifiers", label: "Modifiers & Notes" },
  { id: "charges", label: "Charges" }
];

export default class RecordEditor extends Base {
  constructor() {
    super("easel.pf1e.recordeditor", [
      "descriptionRichText",
      "unidentifiedRichText",
      "actionsSlot"
    ]);
    this.activeTab = "description";
    this.subcomponents = new Map();
    if (!document.querySelector("link[data-pf1e-styles]")) {
      const link = el("link");
      link.rel = "stylesheet";
      link.href = new URL("./pf1e.css", import.meta.url).href;
      link.dataset.pf1eStyles = "true";
      document.head.append(link);
    }
  }

  ensureSubcomponents(p) {
    if (!globalThis.Easel?.Components?.create) return;
    const comps = globalThis.Easel.Components;
    const rec = p.record || {};

    if (!this.subcomponents.has("descRT")) {
      try {
        const rt = comps.create("easel.narrative.richtext@1", {
          props: {
            text: rec.description || "",
            editable: true
          }
        });
        rt.attach(this, "descriptionRichText");
        rt.on("change", ({ text }) => { this.props.record.description = text; });
        this.subcomponents.set("descRT", rt);
      } catch {}
    } else {
      this.subcomponents.get("descRT").setProps({
        text: rec.description || ""
      });
    }

    if (p.isGM && !this.subcomponents.has("unidRT")) {
      try {
        const urt = comps.create("easel.narrative.richtext@1", {
          props: {
            text: rec.unidentifiedDescription || "",
            editable: true,
            isGM: true
          }
        });
        urt.attach(this, "unidentifiedRichText");
        this.subcomponents.set("unidRT", urt);
      } catch {}
    }
  }

  update(p) {
    this.begin({ ...p, title: "" });
    this.activeTab = p.activeTab || this.activeTab || "description";
    const rec = p.record || {};
    const recordType = p.recordType || rec.type || "Item";
    this.ensureSubcomponents(p);

    const wrap = el("div", "pf1e-recordeditor-wrap kit-content");
    wrap.append(el("h3", "kit-title", `Editing: ${rec.name || "New " + recordType} (${recordType})`));

    const nav = el("div", "pf1e-editor-nav kit-row");
    nav.setAttribute("role", "tablist");
    for (const tab of EDITOR_TABS) {
      const isSel = this.activeTab === tab.id;
      const btn = el("button", `kit-tab pf1e-editor-tab${isSel ? " active" : ""}`, tab.label);
      btn.type = "button";
      btn.setAttribute("role", "tab");
      btn.setAttribute("aria-selected", String(isSel));
      btn.onclick = () => {
        this.activeTab = tab.id;
        this.emit("tabChange", { tab: tab.id });
        this.update({ ...this.props, activeTab: tab.id });
      };
      nav.append(btn);
    }
    wrap.append(nav);

    const panel = el("div", `pf1e-editor-panel pf1e-panel-${this.activeTab}`);
    switch (this.activeTab) {
      case "description":
        this.renderDescriptionTab(panel, p);
        break;
      case "details":
        this.renderDetailsTab(panel, p, recordType);
        break;
      case "actions":
        this.renderActionsTab(panel, p);
        break;
      case "modifiers":
        this.renderModifiersTab(panel, p);
        break;
      case "charges":
        this.renderChargesTab(panel, p);
        break;
    }
    wrap.append(panel);

    const footer = el("div", "kit-row pf1e-editor-footer");
    const saveBtn = el("button", "kit-button pf1e-btn-save-record", "Save");
    saveBtn.type = "button";
    saveBtn.onclick = () => {
      this.emit("save", { recordType, record: rec });
    };
    const cancelBtn = el("button", "kit-button pf1e-btn-cancel", "Cancel");
    cancelBtn.type = "button";
    cancelBtn.onclick = () => this.emit("close", {});
    footer.append(saveBtn, cancelBtn);
    wrap.append(footer);

    this.content.append(wrap);
  }

  renderDescriptionTab(panel, p) {
    const rec = p.record || {};
    const form = el("div", "kit-content pf1e-desc-form");

    const nameField = el("label", "kit-field");
    nameField.append(el("span", "kit-label", "Name:"));
    const nameInput = el("input");
    nameInput.type = "text";
    nameInput.value = rec.name || "";
    nameInput.oninput = (e) => { rec.name = e.target.value; };
    nameField.append(nameInput);
    form.append(nameField);

    const imgField = el("label", "kit-field");
    imgField.append(el("span", "kit-label", "Icon URL:"));
    const imgInput = el("input");
    imgInput.type = "text";
    imgInput.value = rec.img || rec.icon || "";
    imgInput.oninput = (e) => { rec.img = e.target.value; };
    imgField.append(imgInput);
    form.append(imgField);

    form.append(el("h4", "kit-label", "Description:"));
    form.append(this.slots.descriptionRichText);

    if (p.isGM) {
      const unidNameField = el("label", "kit-field");
      unidNameField.append(el("span", "kit-label", "Unidentified Name:"));
      const unidInput = el("input");
      unidInput.type = "text";
      unidInput.value = rec.unidentifiedName || "";
      unidInput.oninput = (e) => { rec.unidentifiedName = e.target.value; };
      unidNameField.append(unidInput);
      form.append(unidNameField);

      form.append(el("h4", "kit-label", "Unidentified Description (GM):"));
      form.append(this.slots.unidentifiedRichText);
    }
    panel.append(form);
  }

  renderDetailsTab(panel, p, recordType) {
    const rec = p.record || {};
    const form = el("div", "kit-content pf1e-details-form");

    const addField = (lbl, key, type = "text") => {
      const field = el("label", "kit-field");
      field.append(el("span", "kit-label", lbl));
      const inp = el("input");
      inp.type = type;
      inp.value = rec[key] !== undefined ? String(rec[key]) : "";
      inp.oninput = (e) => {
        rec[key] = type === "number" ? Number(e.target.value) : e.target.value;
      };
      field.append(inp);
      form.append(field);
    };

    if (recordType === "Weapon") {
      addField("Weapon Category:", "weaponCategory");
      addField("Weapon Subtype:", "weaponSubtype");
      addField("Damage Dice:", "baseDamageDice");
      addField("Crit Range:", "critRange", "number");
      addField("Crit Multiplier:", "critMultiplier", "number");
      addField("Material:", "material");
      addField("Enhancement:", "enhancementBonus", "number");
    } else if (recordType === "Armor" || recordType === "Shield") {
      addField("Armor/Shield Bonus:", "armorBonus", "number");
      addField("Max Dex Bonus:", "maxDex", "number");
      addField("Armor Check Penalty:", "armorCheckPenalty", "number");
      addField("Arcane Spell Failure %:", "spellFailurePercent", "number");
      addField("Enhancement:", "enhancementBonus", "number");
      addField("Material:", "material");
    } else if (recordType === "Spell") {
      addField("Spell Level:", "level", "number");
      addField("School:", "school");
      addField("Subschool:", "subschool");
      addField("Casting Time:", "castingTime");
      addField("Range:", "range");
      addField("Duration:", "duration");
      addField("Spell Resistance:", "sr");
    } else if (recordType === "Feature" || recordType === "Feat") {
      addField("Subtype (Feat/Trait/ClassFeature):", "subtype");
      addField("Ability Type (Ex/Su/Sp):", "abilityType");
    } else if (recordType === "Class") {
      addField("Hit Die:", "hitDie", "number");
      addField("BAB Progression:", "babProgression");
      addField("Skill Ranks / Level:", "skillRanksPerLevel", "number");
    } else if (recordType === "Race") {
      addField("Creature Type:", "creatureType");
      addField("Size:", "size");
    } else if (recordType === "Buff") {
      addField("Buff Type (Temp/Perm/Item):", "buffType");
      addField("Caster Level:", "casterLevel", "number");
      addField("Duration:", "duration");
    } else {
      addField("Price (gp):", "priceGp", "number");
      addField("Weight (lbs):", "weightLbs", "number");
      addField("Quantity:", "quantity", "number");
    }
    panel.append(form);
  }

  renderActionsTab(panel, p) {
    const actions = Array.isArray(p.actions) ? p.actions : [];
    const listNode = el("div", "kit-list pf1e-editor-actions-list");

    for (const act of actions) {
      const row = el("div", "kit-item kit-row");
      row.append(el("strong", "kit-label", act.name || "Action"));
      if (act.attackBonusFormula) {
        row.append(el("span", "kit-muted", act.attackBonusFormula));
      }

      const delBtn = el("button", "kit-button", "Delete");
      delBtn.type = "button";
      delBtn.onclick = () => {
        this.emit("deleteAction", { actionId: act.id });
      };
      row.append(delBtn);
      listNode.append(row);
    }
    panel.append(listNode);

    const addActionSec = el("div", "kit-content pf1e-add-action-box");
    addActionSec.append(el("h4", "kit-label", "Add Action"));
    const actNameInp = el("input");
    actNameInp.placeholder = "Action Name (e.g. Strike)";

    const actSelect = el("select");
    for (const actv of ["standard", "full", "swift", "immediate", "free", "none"]) {
      const o = el("option", "", actv.toUpperCase());
      o.value = actv;
      actSelect.append(o);
    }

    const actFormulaInp = el("input");
    actFormulaInp.placeholder = "Attack Formula (e.g. @bab + @abilities.str.mod)";

    const iterLabel = el("label", "kit-row");
    const iterChk = el("input");
    iterChk.type = "checkbox";
    iterLabel.append(iterChk, el("span", "", "Iteratives"));

    const dmgRow = el("div", "kit-row");
    const actDmgInp = el("input");
    actDmgInp.placeholder = "Damage Formula (e.g. 1d8 + @abilities.str.mod)";
    const dmgTypeSelect = el("select");
    for (const dt of ["slashing", "piercing", "bludgeoning", "fire", "cold", "electricity", "acid", "sonic", "force", "positive", "negative", "untyped"]) {
      const o = el("option", "", dt);
      o.value = dt;
      dmgTypeSelect.append(o);
    }
    dmgRow.append(actDmgInp, dmgTypeSelect);

    const saveRow = el("div", "kit-row");
    const saveSelect = el("select");
    for (const st of ["none", "fort", "ref", "will"]) {
      const o = el("option", "", st.toUpperCase());
      o.value = st;
      saveSelect.append(o);
    }
    const saveDcInp = el("input");
    saveDcInp.type = "number";
    saveDcInp.placeholder = "Save DC (e.g. 15)";
    saveRow.append(saveSelect, saveDcInp);

    const tmplRow = el("div", "kit-row");
    const tmplSelect = el("select");
    for (const tmpl of ["none", "circle", "cone", "ray", "rect"]) {
      const o = el("option", "", tmpl.toUpperCase());
      o.value = tmpl;
      tmplSelect.append(o);
    }
    const tmplDist = el("input");
    tmplDist.type = "number";
    tmplDist.placeholder = "Distance (ft)";
    tmplRow.append(tmplSelect, tmplDist);

    const condInp = el("input");
    condInp.placeholder = "Conditional Modifier (e.g. +2 vs goblins)";

    const addBtn = el("button", "kit-button pf1e-btn-add-action", "Add Action");
    addBtn.type = "button";
    addBtn.onclick = () => {
      this.emit("addAction", {
        action: {
          name: actNameInp.value || "New Action",
          activation: actSelect.value || actSelect.children?.[0]?.value || "standard",
          attackBonusFormula: actFormulaInp.value || "",
          iteratives: Boolean(iterChk.checked),
          damageParts: actDmgInp.value ? [{ formula: actDmgInp.value, type: dmgTypeSelect.value || "slashing" }] : [],
          saveType: saveSelect.value && saveSelect.value !== "none" ? saveSelect.value : null,
          saveDC: saveDcInp.value ? parseInt(saveDcInp.value, 10) : null,
          measureTemplate: tmplSelect.value && tmplSelect.value !== "none" ? { type: tmplSelect.value, distance: parseInt(tmplDist.value, 10) || 0 } : null,
          conditionalModifiers: condInp.value ? [{ text: condInp.value }] : []
        }
      });
    };
    addActionSec.append(actNameInp, actSelect, actFormulaInp, iterLabel, dmgRow, saveRow, tmplRow, condInp, addBtn);
    panel.append(addActionSec);
  }

  renderModifiersTab(panel, p) {
    const rec = p.record || {};
    rec.modifiers = Array.isArray(rec.modifiers) ? rec.modifiers : [];
    rec.contextNotes = Array.isArray(rec.contextNotes) ? rec.contextNotes : [];

    const modSec = el("div", "kit-content pf1e-modifiers-section");
    modSec.append(el("h4", "kit-label", "Modifiers"));

    const modList = el("div", "kit-list pf1e-modifiers-list");
    rec.modifiers.forEach((m, idx) => {
      const row = el("div", "kit-item kit-row");
      row.append(el("strong", "", m.target || "ac"));
      row.append(el("span", "kit-badge", m.bonusType || m.type || "untyped"));
      row.append(el("span", "", String(m.formula || m.value || 0)));

      const delBtn = el("button", "kit-button", "Delete");
      delBtn.type = "button";
      delBtn.onclick = () => {
        rec.modifiers.splice(idx, 1);
        this.emit("deleteModifier", { index: idx });
        this.renderModifiersTab(panel, p);
      };
      row.append(delBtn);
      modList.append(row);
    });
    modSec.append(modList);

    const addModRow = el("div", "kit-row pf1e-add-modifier-row");
    const targetInp = el("input");
    targetInp.placeholder = "Target (e.g. ac, attack.melee)";
    const typeSelect = el("select");
    for (const bt of PF1E_BONUS_TYPES) {
      const opt = el("option", "", bt);
      opt.value = bt;
      typeSelect.append(opt);
    }
    const valInp = el("input");
    valInp.placeholder = "Formula or Value (e.g. 2, @bab)";
    const addModBtn = el("button", "kit-button", "Add Modifier");
    addModBtn.type = "button";
    addModBtn.onclick = () => {
      const mod = {
        target: targetInp.value || "ac",
        bonusType: typeSelect.value || "untyped",
        formula: valInp.value || "1"
      };
      rec.modifiers.push(mod);
      this.emit("addModifier", { modifier: mod });
      this.renderModifiersTab(panel, p);
    };
    addModRow.append(targetInp, typeSelect, valInp, addModBtn);
    modSec.append(addModRow);

    const noteSec = el("div", "kit-content pf1e-notes-section");
    noteSec.append(el("h4", "kit-label", "Context Notes"));

    const noteList = el("div", "kit-list pf1e-notes-list");
    rec.contextNotes.forEach((n, idx) => {
      const row = el("div", "kit-item kit-row");
      row.append(el("strong", "", n.target || "all"));
      row.append(el("span", "kit-muted", n.text || ""));
      const delBtn = el("button", "kit-button", "Delete");
      delBtn.type = "button";
      delBtn.onclick = () => {
        rec.contextNotes.splice(idx, 1);
        this.emit("deleteContextNote", { index: idx });
        this.renderModifiersTab(panel, p);
      };
      row.append(delBtn);
      noteList.append(row);
    });
    noteSec.append(noteList);

    const addNoteRow = el("div", "kit-row pf1e-add-note-row");
    const noteTargetInp = el("input");
    noteTargetInp.placeholder = "Target (e.g. saves.will)";
    const noteTextInp = el("input");
    noteTextInp.placeholder = "Context Note text...";
    const addNoteBtn = el("button", "kit-button", "Add Note");
    addNoteBtn.type = "button";
    addNoteBtn.onclick = () => {
      const cn = {
        target: noteTargetInp.value || "all",
        text: noteTextInp.value || ""
      };
      rec.contextNotes.push(cn);
      this.emit("addContextNote", { contextNote: cn });
      this.renderModifiersTab(panel, p);
    };
    addNoteRow.append(noteTargetInp, noteTextInp, addNoteBtn);
    noteSec.append(addNoteRow);

    panel.replaceChildren();
    panel.append(modSec, noteSec);
  }

  renderChargesTab(panel, p) {
    const rec = p.record || {};
    rec.charges = rec.charges || { value: 0, max: 0, maxFormula: "", rechargePeriod: "day", rechargeFormula: "max" };
    const charges = rec.charges;

    const form = el("div", "kit-content pf1e-charges-form");
    const valRow = el("label", "kit-field");
    valRow.append(el("span", "kit-label", "Current Charges:"));
    const valInp = el("input");
    valInp.type = "number";
    valInp.value = String(charges.value ?? 0);
    valInp.oninput = (e) => { charges.value = Number(e.target.value); };
    valRow.append(valInp);
    form.append(valRow);

    const maxRow = el("label", "kit-field");
    maxRow.append(el("span", "kit-label", "Max Charges Formula:"));
    const maxInp = el("input");
    maxInp.type = "text";
    maxInp.value = charges.maxFormula || String(charges.max ?? 0);
    maxInp.oninput = (e) => {
      charges.maxFormula = e.target.value;
      charges.max = parseInt(e.target.value, 10) || 0;
    };
    maxRow.append(maxInp);
    form.append(maxRow);

    const periodRow = el("label", "kit-field");
    periodRow.append(el("span", "kit-label", "Recharge Period:"));
    const periodSelect = el("select");
    for (const opt of ["day", "hour", "round", "special", "none"]) {
      const o = el("option", "", opt.toUpperCase());
      o.value = opt;
      if (charges.rechargePeriod === opt) o.selected = true;
      periodSelect.append(o);
    }
    periodSelect.onchange = () => { charges.rechargePeriod = periodSelect.value; };
    periodRow.append(periodSelect);
    form.append(periodRow);

    const rechRow = el("label", "kit-field");
    rechRow.append(el("span", "kit-label", "Recharge Formula:"));
    const rechInp = el("input");
    rechInp.type = "text";
    rechInp.value = charges.rechargeFormula || "max";
    rechInp.oninput = (e) => { charges.rechargeFormula = e.target.value; };
    rechRow.append(rechInp);
    form.append(rechRow);

    panel.append(form);
  }

  destroy() {
    for (const comp of this.subcomponents.values()) {
      try {
        comp.destroy?.();
      } catch {}
    }
    this.subcomponents.clear();
    super.destroy();
  }
}
