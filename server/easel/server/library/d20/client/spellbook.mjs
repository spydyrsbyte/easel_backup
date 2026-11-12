import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";

export default class Spellbook extends Base {
  constructor() {
    super("easel.d20.spellbook", []);
  }

  update(p) {
    this.begin({ ...p, title: "" });
    const activeLevel = Number(p.activeLevel ?? 0);
    const casterLevel = Number(p.casterLevel ?? 1);
    const spellbook = p.spellbook || {};

    const header = el("div", "kit-row kit-spellbook-header");
    const clBtn = el(
      "button",
      "kit-button kit-btn-cl",
      "Caster Level: " + casterLevel
    );
    clBtn.type = "button";
    clBtn.disabled = !!p.disabled;
    clBtn.onclick = () => {
      this.emit("rollCasterLevel", { casterLevel });
    };

    const concBtn = el("button", "kit-button kit-btn-conc", "Concentration");
    concBtn.type = "button";
    concBtn.disabled = !!p.disabled;
    concBtn.onclick = () => {
      this.emit("rollConcentration", { casterLevel });
    };
    header.append(clBtn, concBtn);
    this.content.append(header);

    const tabs = el("div", "kit-row kit-spell-tabs");
    for (let lvl = 0; lvl <= 9; lvl++) {
      const tab = el(
        "button",
        "kit-tab kit-level-tab" + (lvl === activeLevel ? " active" : ""),
        "L" + lvl
      );
      tab.type = "button";
      tab.disabled = !!p.disabled;
      tab.onclick = () => {
        this.emit("selectLevel", { level: lvl });
      };
      tabs.append(tab);
    }
    this.content.append(tabs);

    const spellsAtLevel = spellbook[activeLevel] || [];
    const listNode = el("div", "kit-list kit-spells-list");
    if (Array.isArray(spellsAtLevel)) {
      for (const spell of spellsAtLevel) {
        const row = el("div", "kit-item kit-row kit-spell-row");
        const name = el("strong", "kit-label", spell.name ?? "Spell");
        const castBtn = el("button", "kit-button kit-cast-btn", "Cast");
        castBtn.type = "button";
        castBtn.disabled = !!p.disabled;
        castBtn.onclick = () => {
          this.emit("castSpell", { spellId: spell.id, level: activeLevel });
        };
        row.append(name, castBtn);
        listNode.append(row);
      }
    }
    this.content.append(listNode);
  }
}
