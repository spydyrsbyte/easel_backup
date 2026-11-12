import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";

export default class AttackCard extends Base {
  constructor() {
    super("easel.d20.attackcard", []);
  }

  update(p) {
    this.begin(p);
    const data = p.attackData || {};
    const attack = data.attack || {};
    const isGM = !!p.isGM;

    const card = el("div", "kit-attackcard");

    const header = el("div", "kit-row kit-attack-header");
    const totalEl = el("strong", "kit-attack-total", "Attack: " + (attack.total ?? 0));
    const natRoll = el("span", "kit-badge kit-natroll", "Nat " + (attack.naturalRoll ?? 0));
    header.append(totalEl, natRoll);

    if (data.isCriticalHit) {
      header.append(el("span", "kit-badge kit-crit-hit", "CRITICAL HIT!"));
    } else if (data.threatensCritical) {
      header.append(el("span", "kit-badge kit-crit-threat", "Threatened"));
    }
    card.append(header);

    if (data.damage) {
      const dmgRow = el("div", "kit-row kit-damage-readout");
      const dmgTotal = el("span", "kit-label", "Damage: " + (data.damage.total ?? 0));
      dmgRow.append(dmgTotal);
      card.append(dmgRow);
    }

    if (data.saveDC) {
      const saveBtn = el(
        "button",
        "kit-button kit-btn-save",
        "Save DC " + data.saveDC
      );
      saveBtn.type = "button";
      saveBtn.disabled = !!p.disabled;
      saveBtn.onclick = () => {
        this.emit("rollSave", { dc: data.saveDC, type: data.saveType });
      };
      card.append(saveBtn);
    }

    if (isGM) {
      const actions = el("div", "kit-row kit-gm-actions");
      const fullBtn = el("button", "kit-button kit-btn-apply-full", "Full");
      fullBtn.type = "button";
      fullBtn.disabled = !!p.disabled;
      fullBtn.onclick = () => {
        this.emit("applyDamage", { multiplier: 1 });
      };

      const halfBtn = el("button", "kit-button kit-btn-apply-half", "Half");
      halfBtn.type = "button";
      halfBtn.disabled = !!p.disabled;
      halfBtn.onclick = () => {
        this.emit("applyDamage", { multiplier: 0.5 });
      };

      const negateBtn = el("button", "kit-button kit-btn-apply-negate", "Negate");
      negateBtn.type = "button";
      negateBtn.disabled = !!p.disabled;
      negateBtn.onclick = () => {
        this.emit("applyDamage", { multiplier: 0 });
      };

      actions.append(fullBtn, halfBtn, negateBtn);
      card.append(actions);
    }

    this.content.append(card);
  }
}
