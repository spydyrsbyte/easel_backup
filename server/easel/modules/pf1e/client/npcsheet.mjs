import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";

export default class NPCSheet extends Base {
  constructor() {
    super("easel.pf1e.npcsheet", [
      "fullSheet",
      "liteVitality",
      "liteDefenses",
      "lootInventory",
      "statblockModal"
    ]);
    this.mode = "lite";
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
    this.mode = p.mode || this.mode || "lite";
    const recordType = p.recordType || p.actor?.recordType || "NPC";

    const root = el("div", `pf1e-npcsheet-wrap pf1e-type-${recordType.toLowerCase()}`);

    if (recordType === "Vehicle") {
      this.renderVehicle(root, p);
      this.content.append(root);
      return;
    }
    if (recordType === "Trap") {
      this.renderTrap(root, p);
      this.content.append(root);
      return;
    }
    if (recordType === "Haunt") {
      this.renderHaunt(root, p);
      this.content.append(root);
      return;
    }

    const modeBar = el("div", "pf1e-npc-mode-bar kit-row");
    for (const m of ["lite", "full", "loot"]) {
      const isSel = this.mode === m;
      const btn = el("button", `kit-button pf1e-mode-btn${isSel ? " active" : ""}`, m.toUpperCase());
      btn.type = "button";
      if (isSel) {
        btn.style.borderColor = "var(--kit-accent)";
      }
      btn.onclick = () => {
        this.mode = m;
        this.emit("modeChange", { mode: m });
        this.update({ ...this.props, mode: m });
      };
      modeBar.append(btn);
    }

    const importBtn = el("button", "kit-button pf1e-btn-import-statblock", "Import Statblock");
    importBtn.type = "button";
    importBtn.onclick = () => {
      this.showImportModal();
    };
    modeBar.append(importBtn);
    root.append(modeBar);

    if (this.mode === "full") {
      this.renderFullMode(root, p);
    } else if (this.mode === "loot") {
      this.renderLootMode(root, p);
    } else {
      this.renderLiteMode(root, p);
    }

    this.content.append(root);
    this.content.append(this.slots.statblockModal);
  }

  renderVehicle(root, p) {
    const actor = p.actor || {};
    const veh = actor.vehicleData || {};
    root.append(el("h2", "pf1e-title", actor.name || "Vehicle"));

    const grid = el("div", "kit-content pf1e-vehicle-grid");
    grid.append(el("span", "kit-badge", "AC: " + (veh.ac ?? 10)));
    grid.append(el("span", "kit-badge", "Hardness: " + (veh.hardness ?? 5)));
    grid.append(el("span", "kit-badge", `HP: ${actor.health?.hp ?? 50} / ${actor.health?.maxHp ?? 50}`));
    grid.append(el("span", "kit-badge", "Speed: " + (veh.speed ?? "30 ft.")));
    grid.append(el("span", "kit-badge", "Crew: " + (veh.crew ?? 1)));
    grid.append(el("span", "kit-badge", "Passengers: " + (veh.passengers ?? 0)));
    grid.append(el("span", "kit-badge", "Cargo: " + (veh.cargoLbs ?? 0) + " lbs"));
    grid.append(el("span", "kit-badge", "Ram: " + (veh.ramDamage ?? "1d8")));
    root.append(grid);
  }

  renderTrap(root, p) {
    const actor = p.actor || {};
    const trap = actor.trapData || {};
    root.append(el("h2", "pf1e-title", actor.name || "Trap"));

    const grid = el("div", "kit-content pf1e-trap-grid");
    grid.append(el("span", "kit-badge", "CR: " + (actor.cr ?? 1)));
    grid.append(el("span", "kit-badge", "Perception DC: " + (trap.perceptionDC ?? 20)));
    grid.append(el("span", "kit-badge", "Disable Device DC: " + (trap.disableDeviceDC ?? 20)));
    grid.append(el("span", "kit-badge", "Trigger: " + (trap.trigger ?? "location")));
    grid.append(el("span", "kit-badge", "Reset: " + (trap.reset ?? "manual")));

    const rollBtn = el("button", "kit-button pf1e-trap-trigger-btn", "Trigger Effect");
    rollBtn.type = "button";
    rollBtn.onclick = () => {
      this.emit("triggerTrap", { trapId: actor.id || "" });
    };
    grid.append(rollBtn);
    root.append(grid);
  }

  renderHaunt(root, p) {
    const actor = p.actor || {};
    const haunt = actor.hauntData || {};
    root.append(el("h2", "pf1e-title", actor.name || "Haunt"));

    const grid = el("div", "kit-content pf1e-haunt-grid");
    grid.append(el("span", "kit-badge", "CR: " + (actor.cr ?? 1)));
    grid.append(el("span", "kit-badge", "Notice DC: " + (haunt.noticeDC ?? 15)));
    grid.append(el("span", "kit-badge", `HP: ${actor.health?.hp ?? 10}`));
    grid.append(el("span", "kit-badge", "Weakness: " + (haunt.weakness ?? "positive energy")));
    grid.append(el("span", "kit-badge", "Trigger: " + (haunt.trigger ?? "proximity")));

    const rollBtn = el("button", "kit-button pf1e-haunt-trigger-btn", "Trigger Haunt");
    rollBtn.type = "button";
    rollBtn.onclick = () => {
      this.emit("triggerHaunt", { hauntId: actor.id || "" });
    };
    grid.append(rollBtn);
    root.append(grid);
  }

  renderFullMode(root, p) {
    const actor = p.actor || {};
    const header = el("div", "pf1e-npc-full-header kit-row");
    header.append(el("span", "kit-badge", "CR: " + (actor.cr ?? 1)));
    header.append(el("span", "kit-badge", "XP: " + (actor.xpAward ?? 400)));
    header.append(el("span", "kit-badge", "Type: " + (actor.creatureType || "humanoid")));
    if (Array.isArray(actor.subtypes) && actor.subtypes.length > 0) {
      header.append(el("span", "kit-badge", "Subtypes: " + actor.subtypes.join(", ")));
    }
    if (actor.racialHDFormula) {
      header.append(el("span", "kit-badge", "HD: " + actor.racialHDFormula));
    }
    if (actor.environment) {
      header.append(el("span", "kit-badge", "Env: " + actor.environment));
    }
    if (actor.organization) {
      header.append(el("span", "kit-badge", "Org: " + actor.organization));
    }
    root.append(header);
    root.append(this.slots.fullSheet);
  }

  renderLiteMode(root, p) {
    const actor = p.actor || {};
    const derived = p.derived || {};

    const header = el("div", "pf1e-npc-lite-header kit-content");
    const titleRow = el("div", "kit-row");
    titleRow.append(el("h3", "pf1e-actor-name", actor.name || "NPC"));
    titleRow.append(el("span", "kit-badge", "CR " + (actor.cr ?? 1)));
    titleRow.append(el("span", "kit-badge", (actor.xpAward ?? 400) + " XP"));
    titleRow.append(el("span", "kit-badge", String(actor.alignment || "N").toUpperCase()));
    titleRow.append(el("span", "kit-badge", String(actor.size || "medium").toUpperCase()));
    header.append(titleRow);
    root.append(header);

    const vitDef = el("div", "kit-row pf1e-lite-vitality-defenses");
    vitDef.append(this.slots.liteVitality);
    vitDef.append(this.slots.liteDefenses);
    root.append(vitDef);

    const attacksSec = el("div", "kit-content pf1e-lite-attacks");
    attacksSec.append(el("h4", "kit-label", "Attacks"));
    const actions = Array.isArray(p.actions) ? p.actions : [];
    const atkList = el("div", "kit-list pf1e-lite-attack-list");
    for (const act of actions) {
      const row = el("div", "kit-item kit-row");
      row.append(el("strong", "kit-label", act.name || "Attack"));
      if (act.attackBonusFormula) {
        row.append(el("span", "kit-muted", act.attackBonusFormula));
      }
      if (Array.isArray(act.damageParts) && act.damageParts.length > 0) {
        row.append(el("span", "kit-badge", act.damageParts.map((d) => d.formula || d).join(" + ")));
      }
      const atkBtn = el("button", "kit-button", "Roll");
      atkBtn.type = "button";
      atkBtn.onclick = (e) => {
        this.emit("useAction", {
          actionId: act.id,
          mode: e.shiftKey ? "fast" : "normal"
        });
      };
      row.append(atkBtn);
      atkList.append(row);
    }
    attacksSec.append(atkList);
    root.append(attacksSec);

    const spells = Array.isArray(p.spells)
      ? p.spells
      : (Array.isArray(actor.spells) ? actor.spells : []);
    if (spells.length > 0 || derived.spellsByLevel) {
      const spSec = el("div", "kit-content pf1e-lite-spells");
      spSec.append(el("h4", "kit-label", "Spells"));
      const spList = el("div", "kit-row pf1e-lite-spells-list");
      const spellItems = spells.length > 0 ? spells : Object.entries(derived.spellsByLevel || {}).flatMap(([lvl, list]) => list.map((s) => ({ ...s, level: Number(lvl) })));
      for (const sp of spellItems) {
        const spBtn = el("button", "kit-button pf1e-btn-lite-cast", `L${sp.level ?? 1}: ${sp.name || "Spell"}`);
        spBtn.type = "button";
        spBtn.onclick = () => {
          this.emit("castSpell", { spellId: sp.id, level: sp.level ?? 1 });
        };
        spList.append(spBtn);
      }
      spSec.append(spList);
      root.append(spSec);
    }

    const skillsSec = el("div", "kit-row pf1e-lite-skills");
    skillsSec.append(el("strong", "kit-label", "Skills:"));
    const skills = derived.skills || actor.skills || {};
    for (const [sk, sv] of Object.entries(skills)) {
      const num = typeof sv === "object" ? (sv.total ?? sv.ranks ?? 0) : Number(sv) || 0;
      if (typeof sv === "object" && !sv.ranks && !sv.total && !["perception", "stealth", "per", "ste"].includes(sk)) {
        continue;
      }
      const sign = num >= 0 ? "+" + num : String(num);
      const skName = (typeof sv === "object" && sv.name) ? sv.name : sk.toUpperCase();
      const skBtn = el("button", "kit-button pf1e-btn-lite-skill", `${skName} ${sign}`);
      skBtn.type = "button";
      skBtn.onclick = () => {
        this.emit("rollSkill", { skillId: sk, ability: sv.ability || "wis", modifier: num, take: 0 });
      };
      skillsSec.append(skBtn);
    }
    root.append(skillsSec);

    const savesSec = el("div", "kit-row pf1e-lite-saves");
    savesSec.append(el("strong", "kit-label", "Saves:"));
    const saves = derived.saves || actor.saves || { fort: 0, ref: 0, will: 0 };
    for (const [sKey, sVal] of Object.entries(saves)) {
      const num = typeof sVal === "object" ? sVal.total ?? 0 : Number(sVal) || 0;
      const sign = num >= 0 ? "+" + num : String(num);
      const btn = el("button", "kit-button", `${sKey.toUpperCase()}: ${sign}`);
      btn.type = "button";
      btn.onclick = () => {
        this.emit("rollSave", { save: sKey, modifier: num });
      };
      savesSec.append(btn);
    }
    root.append(savesSec);
  }

  renderLootMode(root, p) {
    const actor = p.actor || {};
    const items = Array.isArray(p.items) ? p.items : [];
    const cur = actor.currency || { pp: 0, gp: 0, sp: 0, cp: 0 };

    root.append(el("h3", "kit-label", `Loot: ${actor.name || "Corpse / Merchant"}`));

    const coinsRow = el("div", "kit-row pf1e-loot-coins");
    coinsRow.append(el("strong", "kit-label", "Coins:"));
    coinsRow.append(el("span", "kit-badge", `${cur.pp ?? 0} pp`));
    coinsRow.append(el("span", "kit-badge", `${cur.gp ?? 0} gp`));
    coinsRow.append(el("span", "kit-badge", `${cur.sp ?? 0} sp`));
    coinsRow.append(el("span", "kit-badge", `${cur.cp ?? 0} cp`));

    const lootCoinsBtn = el("button", "kit-button pf1e-btn-loot-coins", "Loot All Coins");
    lootCoinsBtn.type = "button";
    lootCoinsBtn.onclick = () => {
      this.emit("transferCoin", { currency: cur, targetActorId: p.targetActorId || "" });
    };
    coinsRow.append(lootCoinsBtn);
    root.append(coinsRow);

    const listNode = el("div", "kit-list pf1e-loot-items-list");
    for (const item of items) {
      const row = el("div", "kit-item kit-row");
      const name = el("strong", "kit-label", item.name || "Item");
      const qty = el("span", "kit-muted", `x${item.quantity ?? 1}`);
      const val = el("span", "kit-badge", `${item.priceGp ?? 0} gp`);
      const wt = el("span", "kit-badge", `${(item.weightLbs ?? 0) * (item.quantity ?? 1)} lbs`);

      const takeBtn = el("button", "kit-button pf1e-btn-loot-item", "Take");
      takeBtn.type = "button";
      takeBtn.onclick = () => {
        this.emit("transferItem", {
          itemId: item.id,
          targetActorId: p.targetActorId || "",
          targetContainerId: ""
        });
      };

      row.append(name, qty, val, wt, takeBtn);
      listNode.append(row);
    }
    root.append(listNode);
  }

  showImportModal() {
    this.slots.statblockModal.replaceChildren();
    const modalWrap = el("div", "kit-modal pf1e-import-modal");
    const content = el("div", "kit-content");
    content.append(el("h3", "kit-title", "Import Paizo Statblock"));

    const textarea = el("textarea", "pf1e-statblock-textarea");
    textarea.rows = 12;
    textarea.placeholder = "Paste Paizo statblock text here...";
    textarea.style.width = "100%";
    content.append(textarea);

    const actions = el("div", "kit-row");
    const parseBtn = el("button", "kit-button pf1e-btn-do-import", "Import");
    parseBtn.type = "button";
    parseBtn.onclick = () => {
      this.emit("importStatblock", { statblockText: textarea.value });
      modalWrap.remove();
    };

    const cancelBtn = el("button", "kit-button", "Cancel");
    cancelBtn.type = "button";
    cancelBtn.onclick = () => modalWrap.remove();

    actions.append(parseBtn, cancelBtn);
    content.append(actions);
    modalWrap.append(content);
    this.slots.statblockModal.append(modalWrap);
  }

  destroy() {
    super.destroy();
  }
}
