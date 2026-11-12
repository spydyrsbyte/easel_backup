import { element as el } from "../safe.mjs";

export function renderSettingsTab(sheet, p) {
  const root = el("div", "pf1e-tab-settings kit-content");
  const actor = p.actor || {};
  const settings = actor.settings || {};

  const toggles = [
    { id: "woundsAndVigor", label: "Use Wounds & Vigor Rules", val: settings.woundsAndVigor },
    { id: "backgroundSkills", label: "Enable Background Skills", val: settings.backgroundSkills },
    { id: "fractionalBaseBonuses", label: "Enable Fractional Base Bonuses", val: settings.fractionalBaseBonuses }
  ];

  for (const t of toggles) {
    const row = el("label", "kit-row kit-field");
    const chk = el("input");
    chk.type = "checkbox";
    chk.disabled = p.canEdit === false;
    chk.checked = Boolean(t.val);
    chk.onchange = () => {
      sheet.emit("updateSettings", {
        settings: { ...settings, [t.id]: chk.checked }
      });
    };
    row.append(chk, el("span", "kit-label", t.label));
    root.append(row);
  }

  const hpRow = el("label", "kit-field");
  hpRow.append(el("span", "kit-label", "Custom HD/HP Formula:"));
  const hpInput = el("input");
  hpInput.type = "text";
  hpInput.disabled = p.canEdit === false;
  hpInput.value = settings.hpFormula || "";
  hpInput.onchange = () => {
    sheet.emit("updateSettings", {
      settings: { ...settings, hpFormula: hpInput.value }
    });
  };
  hpRow.append(hpInput);
  root.append(hpRow);

  const visionRow = el("label", "kit-field");
  visionRow.append(el("span", "kit-label", "Custom Vision Override:"));
  const visionInput = el("input");
  visionInput.type = "text";
  visionInput.disabled = p.canEdit === false;
  visionInput.value = settings.visionOverride || "";
  visionInput.onchange = () => {
    sheet.emit("updateSettings", {
      settings: { ...settings, visionOverride: visionInput.value }
    });
  };
  visionRow.append(visionInput);
  root.append(visionRow);

  return root;
}
