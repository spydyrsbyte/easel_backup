import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";

export default class AbilityBlock extends Base {
  constructor() {
    super("easel.d20.abilityblock", []);
  }

  update(p) {
    this.begin({ ...p, title: "" });
    const abilities = p.abilities || {};
    const keys = ["str", "dex", "con", "int", "wis", "cha"];
    const listNode = el("div", "kit-list kit-ability-list");

    for (const key of keys) {
      const data = abilities[key] || { base: 10, total: 10, modifier: 0 };
      const score = data.total ?? data.base ?? 10;
      const mod = data.mod ?? data.modifier ?? Math.floor((score - 10) / 2);
      const sign = mod >= 0 ? "+" + mod : String(mod);

      const row = el("div", "kit-item kit-row kit-ability-row");
      row.dataset.ability = key;

      const label = el("strong", "kit-label", key.toUpperCase());
      const baseEl =
        data.base !== undefined && data.base !== null && data.base !== score
          ? el("span", "kit-base", "Base: " + data.base)
          : null;
      const scoreEl = el("span", "kit-score", "Score: " + score);
      const modEl = el("span", "kit-mod", "Mod: " + sign);
      if (baseEl) row.append(label, baseEl, scoreEl, modEl);
      else row.append(label, scoreEl, modEl);

      if (p.editable) {
        const input = el("input", "kit-ability-base-input");
        input.type = "number";
        input.min = "0";
        input.value = String(data.base ?? score);
        input.setAttribute("aria-label", key.toUpperCase() + " base score");
        input.onchange = () => this.emit("updateAbility", { ability: key, score: Number(input.value) });
        row.append(input);
      }

      if (data.temp) {
        row.append(el("span", "kit-badge", "Temp: " + data.temp));
      }
      if (data.damage) {
        row.append(el("span", "kit-badge", "Dmg: " + data.damage));
      }
      if (data.drain) {
        row.append(el("span", "kit-badge", "Drain: " + data.drain));
      }
      if (data.penalty) {
        row.append(el("span", "kit-badge", "Pen: " + data.penalty));
      }

      const rollBtn = el("button", "kit-button kit-roll-ability", "Roll");
      rollBtn.type = "button";
      rollBtn.disabled = !!p.disabled;
      rollBtn.onclick = () => {
        this.emit("rollAbility", { ability: key, score, modifier: mod });
      };
      row.append(rollBtn);

      listNode.append(row);
    }

    this.content.append(listNode);
  }
}
