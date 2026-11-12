import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";
import { renderSummaryTab, renderSummaryHeader } from "./parts/summary.mjs";
import { renderAttributesTab } from "./parts/attributes.mjs";
import { renderCombatTab } from "./parts/combat.mjs";
import { renderInventoryTab } from "./parts/inventory.mjs";
import { renderFeaturesTab } from "./parts/features.mjs";
import { renderSkillsTab } from "./parts/skills.mjs";
import { renderSpellbooksTab } from "./parts/spellbooks.mjs";
import { renderBuffsTab } from "./parts/buffs.mjs";
import { renderBiographyTab } from "./parts/biography.mjs";
import { renderNotesTab } from "./parts/notes.mjs";
import { renderSettingsTab } from "./parts/settings.mjs";

const TAB_DEFS = [
  { id: "summary", label: "Summary" },
  { id: "attributes", label: "Attributes" },
  { id: "combat", label: "Combat" },
  { id: "inventory", label: "Inventory" },
  { id: "features", label: "Feats & Features" },
  { id: "skills", label: "Skills" },
  { id: "spellbooks", label: "Spellbooks" },
  { id: "buffs", label: "Buffs" },
  { id: "biography", label: "Biography" },
  { id: "notes", label: "Notes" },
  { id: "settings", label: "Settings" }
];

export default class CharacterSheet extends Base {
  constructor() {
    super("easel.pf1e.charactersheet", [
      "summaryVitality",
      "summaryDefenses",
      "attributesAbilities",
      "attributesDefenses",
      "attributesModifiers",
      "inventoryEquipment",
      "spellbooksSlot",
      "biographyRichText",
      "notesRichText",
      "gmNotesRichText",
      "rollDialog"
    ]);
    this.activeTab = "summary";
    if (!document.querySelector("link[data-pf1e-styles]")) {
      const link = el("link");
      link.rel = "stylesheet";
      link.href = new URL("./pf1e.css", import.meta.url).href;
      link.dataset.pf1eStyles = "true";
      document.head.append(link);
    }
  }

  update(p) {
    this.begin({ ...p, title: "" });
    this.activeTab = p.activeTab || this.activeTab || "summary";

    const sheetContainer = el("div", "pf1e-charactersheet-container kit-content");

    const nav = el("div", "pf1e-sheet-nav kit-row");
    nav.setAttribute("role", "tablist");
    for (const tab of TAB_DEFS) {
      const isSelected = this.activeTab === tab.id;
      const tabBtn = el(
        "button",
        `kit-tab pf1e-nav-tab${isSelected ? " active" : ""}`,
        tab.label
      );
      tabBtn.type = "button";
      tabBtn.setAttribute("role", "tab");
      tabBtn.setAttribute("aria-selected", String(isSelected));
      tabBtn.onclick = () => {
        this.activeTab = tab.id;
        this.emit("tabChange", { tab: tab.id });
        this.update({ ...this.props, activeTab: tab.id });
      };
      nav.append(tabBtn);
    }
    const summary = renderSummaryTab(this, p);
    const header = renderSummaryHeader(this, p);
    sheetContainer.append(header, nav);

    const panels = el("div", "pf1e-sheet-panels");
    for (const tab of TAB_DEFS) {
      const panel = el("div", `pf1e-sheet-panel pf1e-panel-${tab.id}`);
      panel.setAttribute("role", "tabpanel");
      panel.hidden = this.activeTab !== tab.id;

      switch (tab.id) {
        case "summary":
          panel.append(summary);
          break;
        case "attributes":
          panel.append(renderAttributesTab(this, p));
          break;
        case "combat":
          panel.append(renderCombatTab(this, p));
          break;
        case "inventory":
          panel.append(renderInventoryTab(this, p));
          break;
        case "features":
          panel.append(renderFeaturesTab(this, p));
          break;
        case "skills":
          panel.append(renderSkillsTab(this, p));
          break;
        case "spellbooks":
          panel.append(renderSpellbooksTab(this, p));
          break;
        case "buffs":
          panel.append(renderBuffsTab(this, p));
          break;
        case "biography":
          panel.append(renderBiographyTab(this, p));
          break;
        case "notes":
          panel.append(renderNotesTab(this, p));
          break;
        case "settings":
          panel.append(renderSettingsTab(this, p));
          break;
      }
      panels.append(panel);
    }
    sheetContainer.append(panels);

    this.content.append(sheetContainer);
    this.content.append(this.slots.rollDialog);
  }

  destroy() {
    super.destroy();
  }
}
