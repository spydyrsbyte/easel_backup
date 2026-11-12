import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";

export default class DefenseBanner extends Base {
  constructor() {
    super("easel.d20.defensebanner", []);
  }

  update(p) {
    this.begin({ ...p, title: "" });
    const ac = p.ac || {};
    const saves = p.saves || {};
    const cmd = p.cmd ?? 10;

    const banner = el("div", "kit-row kit-defense-banner");

    const acRow = el("div", "kit-row kit-ac-group");
    const normalEl = el("span", "kit-badge kit-ac-normal", "AC: " + (ac.normal ?? 10));
    const touchEl = el("span", "kit-badge kit-ac-touch", "Touch: " + (ac.touch ?? 10));
    const ffEl = el(
      "span",
      "kit-badge kit-ac-flatfooted",
      "FF: " + (ac.flatFooted ?? 10)
    );
    const cmdEl = el("span", "kit-badge kit-cmd", "CMD: " + cmd);
    acRow.append(normalEl, touchEl, ffEl, cmdEl);
    banner.append(acRow);

    const savesRow = el("div", "kit-row kit-saves-group");
    for (const [saveKey, val] of Object.entries(saves)) {
      const num = typeof val === "object" ? val.total ?? 0 : Number(val) || 0;
      const sign = num >= 0 ? "+" + num : String(num);
      const btn = el(
        "button",
        "kit-button kit-save-btn kit-save-" + saveKey,
        saveKey.toUpperCase() + ": " + sign
      );
      btn.type = "button";
      btn.disabled = !!p.disabled;
      btn.onclick = () => {
        this.emit("rollSave", { save: saveKey, modifier: num });
      };
      savesRow.append(btn);
    }
    banner.append(savesRow);

    this.content.append(banner);
  }
}
