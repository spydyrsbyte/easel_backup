import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";

export default class Vitality extends Base {
  constructor() {
    super("easel.d20.vitality", []);
  }

  update(p) {
    this.begin({ ...p, title: "" });
    const hp = Number(p.hp ?? 10);
    const maxHp = Number(p.maxHp ?? 10);
    const tempHp = Number(p.tempHp ?? 0);
    const nonlethal = Number(p.nonlethal ?? 0);
    const status = String(p.status ?? "healthy");

    const root = el("div", "kit-vitality");

    const statusBadge = el("span", "kit-badge kit-status-" + status, status.toUpperCase());
    const hpText = el(
      "p",
      "kit-hp-readout",
      "HP: " + hp + " / " + maxHp + (tempHp ? " (+" + tempHp + " Temp)" : "")
    );
    root.append(statusBadge, hpText);

    if (nonlethal > 0) {
      root.append(el("span", "kit-badge kit-nonlethal", "Nonlethal: " + nonlethal));
    }

    const pct = Math.max(0, Math.min(100, Math.round((hp / (maxHp || 1)) * 100)));
    const bar = el("div", "kit-progress kit-hp-bar");
    const fill = el("span");
    fill.style.width = pct + "%";
    bar.append(fill);
    root.append(bar);

    const controls = el("div", "kit-row kit-vitality-controls");
    const dmgInput = el("input", "kit-input-dmg");
    dmgInput.type = "number";
    dmgInput.placeholder = "Amount";
    dmgInput.value = "5";

    const dmgBtn = el("button", "kit-btn-damage", "- Damage");
    dmgBtn.type = "button";
    dmgBtn.disabled = !!p.disabled;
    dmgBtn.onclick = () => {
      const val = Math.max(0, parseInt(dmgInput.value, 10) || 0);
      this.emit("applyDamage", { amount: val, isNonlethal: false });
    };

    const healBtn = el("button", "kit-btn-heal", "+ Heal");
    healBtn.type = "button";
    healBtn.disabled = !!p.disabled;
    healBtn.onclick = () => {
      const val = Math.max(0, parseInt(dmgInput.value, 10) || 0);
      this.emit("applyHealing", { amount: val });
    };

    controls.append(dmgInput, dmgBtn, healBtn);
    root.append(controls);

    this.content.append(root);
  }
}
