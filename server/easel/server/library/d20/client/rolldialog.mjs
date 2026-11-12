import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";

export default class RollDialog extends Base {
  constructor() {
    super("easel.d20.rolldialog", []);
  }

  update(p) {
    this.begin(p);
    const bonus = Number(p.bonus ?? 0);
    const conditionalMods = p.conditionalModifiers || [];
    const rollModes = p.rollModes || ["public", "gm", "blind", "self"];

    const root = el("div", "kit-rolldialog");

    const bonusField = el("div", "kit-field");
    bonusField.append(el("label", "kit-label", "Situational Bonus:"));
    const bonusInput = el("input", "kit-input-bonus");
    bonusInput.type = "number";
    bonusInput.value = String(bonus);
    bonusField.append(bonusInput);
    root.append(bonusField);

    const modeField = el("div", "kit-field");
    modeField.append(el("label", "kit-label", "Roll Mode:"));
    const select = el("select", "kit-select-mode");
    for (const mode of rollModes) {
      const opt = el("option", "", mode);
      opt.value = mode;
      select.append(opt);
    }
    modeField.append(select);
    root.append(modeField);

    const toggles = el("div", "kit-list kit-conditional-toggles");
    const activeToggles = new Set();
    for (const mod of conditionalMods) {
      const row = el("label", "kit-item kit-row");
      const chk = el("input");
      chk.type = "checkbox";
      chk.onchange = () => {
        if (chk.checked) activeToggles.add(mod.id);
        else activeToggles.delete(mod.id);
      };
      row.append(
        chk,
        el(
          "span",
          "",
          mod.name + " (" + (mod.value >= 0 ? "+" + mod.value : mod.value) + ")"
        )
      );
      toggles.append(row);
    }
    root.append(toggles);

    const takeRow = el("div", "kit-row kit-take-options");
    let takeVal = null;
    const normBtn = el("button", "kit-button active", "Normal");
    const take10Btn = el("button", "kit-button", "Take 10");
    const take20Btn = el("button", "kit-button", "Take 20");

    normBtn.onclick = () => {
      takeVal = null;
      normBtn.className = "kit-button active";
      take10Btn.className = "kit-button";
      take20Btn.className = "kit-button";
    };
    take10Btn.onclick = () => {
      takeVal = 10;
      normBtn.className = "kit-button";
      take10Btn.className = "kit-button active";
      take20Btn.className = "kit-button";
    };
    take20Btn.onclick = () => {
      takeVal = 20;
      normBtn.className = "kit-button";
      take10Btn.className = "kit-button";
      take20Btn.className = "kit-button active";
    };
    takeRow.append(normBtn, take10Btn, take20Btn);
    root.append(takeRow);

    const actions = el("div", "kit-row kit-dialog-actions");
    const rollBtn = el("button", "kit-button kit-btn-roll", "Roll");
    rollBtn.type = "button";
    rollBtn.disabled = !!p.disabled;
    rollBtn.onclick = () => {
      this.emit("roll", {
        bonus: parseInt(bonusInput.value, 10) || 0,
        mode: select.value || "public",
        take: takeVal ?? 0,
        activeModifiers: Array.from(activeToggles)
      });
    };

    const cancelBtn = el("button", "kit-button kit-btn-cancel", "Cancel");
    cancelBtn.type = "button";
    cancelBtn.disabled = !!p.disabled;
    cancelBtn.onclick = () => {
      this.emit("cancel", {});
    };

    actions.append(rollBtn, cancelBtn);
    root.append(actions);

    this.content.append(root);
  }
}
