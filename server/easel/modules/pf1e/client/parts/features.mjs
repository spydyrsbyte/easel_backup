import { element as el } from "../safe.mjs";

export function renderFeaturesTab(sheet, p) {
  const root = el("div", "pf1e-tab-features kit-content");
  const classes = Array.isArray(p.classes) ? p.classes : [];
  const features = Array.isArray(p.features) ? p.features : [];

  const classSection = el("div", "pf1e-classes-section kit-content");
  classSection.append(el("h4", "kit-label", "Class Advancement"));

  const classList = el("div", "kit-list pf1e-classes-list");
  for (const cl of classes) {
    const row = el("div", "kit-item kit-row pf1e-class-row");
    row.append(el("strong", "kit-label", `${cl.name || cl.className || "Class"} Level ${cl.classLevel || 1}`));
    if (cl.hpRolled !== undefined) {
      row.append(el("span", "kit-badge", `HP Rolled: ${cl.hpRolled}`));
    }
    if (cl.favoredClassBonus) {
      row.append(el("span", "kit-badge", `FCB: ${cl.favoredClassBonus}`));
    }
    classList.append(row);
  }
  classSection.append(classList);

  const addLvlRow = el("div", "kit-row pf1e-add-level-row");
  const classInput = el("input", "pf1e-class-name-input");
  classInput.disabled = p.canEdit === false;
  classInput.placeholder = "Class name...";
  const hpInput = el("input", "pf1e-class-hp-input");
  hpInput.type = "number";
  hpInput.disabled = p.canEdit === false;
  hpInput.placeholder = "HP";
  const fcbSelect = el("select", "pf1e-class-fcb-select");
  fcbSelect.disabled = p.canEdit === false;
  for (const opt of ["hp", "skill", "alternate"]) {
    const o = el("option", "", opt.toUpperCase());
    o.value = opt;
    fcbSelect.append(o);
  }
  const addLvlBtn = el("button", "kit-button pf1e-btn-add-level", "Add Level");
  addLvlBtn.type = "button";
  addLvlBtn.disabled = p.canEdit === false;
  addLvlBtn.onclick = () => {
    sheet.emit("addClassLevel", {
      className: classInput.value || "Fighter",
      hpRolled: parseInt(hpInput.value, 10) || 6,
      fcv: fcbSelect.value || "hp"
    });
  };
  addLvlRow.append(classInput, hpInput, fcbSelect, addLvlBtn);
  classSection.append(addLvlRow);
  root.append(classSection);

  const subtypes = [
    { label: "Class Features", filter: (f) => f.subtype === "ClassFeature" || f.type === "ClassFeature" },
    { label: "Feats", filter: (f) => f.subtype === "Feat" || f.type === "Feat" },
    { label: "Traits", filter: (f) => f.subtype === "Trait" || f.type === "Trait" },
    { label: "Racial Traits", filter: (f) => f.subtype === "RacialTrait" || f.type === "RacialTrait" },
    { label: "Other Features", filter: (f) => !["ClassFeature", "Feat", "Trait", "RacialTrait"].includes(f.subtype) && !["ClassFeature", "Feat", "Trait", "RacialTrait"].includes(f.type) }
  ];

  for (const sub of subtypes) {
    const subFeatures = features.filter(sub.filter);
    if (subFeatures.length === 0) continue;

    const subSection = el("div", "pf1e-feature-group kit-content");
    subSection.append(el("h4", "kit-label", sub.label));

    const featList = el("div", "kit-list pf1e-features-list");
    for (const feat of subFeatures) {
      const row = el("div", "kit-item kit-row pf1e-feature-row");
      const name = el("strong", "kit-label", feat.name || "Feature");
      row.append(name);

      if (feat.abilityType) {
        row.append(el("span", "kit-badge", feat.abilityType.toUpperCase()));
      }
      if (feat.charges || feat.uses) {
        const u = feat.charges || feat.uses;
        const val = u.value ?? u.current ?? 0;
        const max = u.max ?? val;
        row.append(el("span", "kit-badge", `Uses: ${val} / ${max}`));
      }

      const useBtn = el("button", "kit-button pf1e-btn-use-feature", "Use");
      useBtn.type = "button";
      useBtn.disabled = p.canControl === false;
      useBtn.onclick = () => {
        sheet.emit("useAction", { actionId: "feat-" + feat.id, mode: "normal", take: 0, conditionalModifiers: [], actionData: { name: feat.name || "Feature" } });
      };

      const editBtn = el("button", "kit-button pf1e-btn-edit-feature", "Edit");
      editBtn.type = "button";
      editBtn.disabled = p.canEdit === false;
      editBtn.onclick = () => {
        sheet.emit("editRecord", { recordType: feat.type || "Feature", recordId: feat.id });
      };

      row.append(useBtn, editBtn);
      featList.append(row);
    }
    subSection.append(featList);
    root.append(subSection);
  }

  if (p.canEdit) root.append(sheet.button("Add Feature", "createRecord", { recordType: "Feat" }));

  return root;
}
