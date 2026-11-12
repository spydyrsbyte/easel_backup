export default class Controller {
  constructor() {
    this.workspace = null;
    this.map = null;
    this.dicebox = null;
    this.dicesettings = null;
    this.chatlog = null;
    this.tracker = null;
    this.directory = null;
    this.compendium = null;
    this.toolstrip = null;
    this.sidebarTabs = null;
    this.activeWindows = new Map();
    this.sheetViews = new Map();
    this.entries = [];
  }

  start(options = {}) {
    return this.mount(options);
  }

  mount(options = {}) {
    this.integrated = Boolean(options.integrated);
    const comps = globalThis.Easel?.Components;
    if (!comps) return;

    if (!document.querySelector("link[data-pf1e-styles]")) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = new URL("./pf1e.css", import.meta.url).href;
      link.dataset.pf1eStyles = "true";
      document.head.append(link);
    }

    this.workspace = comps.create("easel.layout.vttworkspace@1", {
      props: {
        title: options.title || "PF1e VTT Workspace",
        sidebarOpen: true,
        sidebarWidth: 360,
        activeTool: "select",
        gmMode: Boolean(options.gmMode)
      }
    });

    this.status = comps.create("easel.narrative.richtext@1", { props: { text: "Connecting to game...", editable: false } });
    this.status.attach(this.workspace, "hud");

    this.workspace.on("toggleSidebar", (p) => {
      const open = p?.open !== undefined ? p.open : !this.workspace.props?.sidebarOpen;
      this.workspace.setProps({ sidebarOpen: open });
    });

    try {
      this.map = comps.create("easel.maps.map@1", {
        id: this.integrated ? "pf1e-map" : undefined,
        props: {
          title: options.mapTitle || "Battlemap",
          width: options.mapWidth || 1000,
          height: options.mapHeight || 700,
          grid: {
            type: "square",
            cellSize: 64,
            visible: true,
            color: 0xcccccc,
            alpha: 0.25
          }
        }
      });
      this.map.attach(this.workspace, "canvas");
    } catch (error) { this.showError(error.message); }

    try {
      this.dicebox = comps.create("easel.dice.dicebox@1", {
        props: {
          enabled: true,
          quality: "high",
          speed: 10,
          rolls: []
        }
      });
      this.dicebox.attach(this.workspace, "diceoverlay");
    } catch (error) { this.showError(error.message); }

    try {
      this.toolstrip = comps.create("easel.layout.toolstrip@1", {
        props: {
          activeTool: "select"
        }
      });
      this.toolstrip.on("select", (p) => {
        if (p?.tool) {
          this.toolstrip.setProps({ activeTool: p.tool });
          this.workspace.setProps({ activeTool: p.tool });
        }
      });
      this.toolstrip.attach(this.workspace, "tools");
    } catch (error) { this.showError(error.message); }

    try {
      this.chatlog = comps.create("easel.narrative.chatlog@1", {
        props: {
          messages: [],
          canClear: false
        }
      });
      if (!this.integrated) this.chatlog.on("sendMessage", (payload) => {
        this.request("chatMessage", { text: payload.text || "", rollMode: payload.rollMode === "selfroll" ? "self" : payload.rollMode || "public" });
      });
      if (!this.integrated) this.chatlog.on("cardAction", (payload) => {
        if (payload.actionId === "applyDamage" && globalThis.Application?.events?.emit) {
          const p = payload.payload || {};
          globalThis.Application.events.emit("easel.pf1e.applyDamage", {
            actorId: String(p.actorId || ""),
            amount: Number(p.amount || 0),
            isNonlethal: Boolean(p.isNonlethal),
            multiplier: Number(p.multiplier ?? 1)
          });
        }
      });
    } catch (error) { this.showError(error.message); }

    try {
      this.tracker = comps.create("easel.combat.encounter@1", {
        props: {
          items: options.combatants || [],
          actions: [
            { id: "nextTurn", label: "Next Turn" },
            { id: "prevTurn", label: "Previous Turn" }
          ]
        }
      });
    } catch (error) { this.showError(error.message); }

    try {
      this.directory = comps.create("easel.collections.directory@1", {
        props: { entries: [], folders: [], createLabel: "+ New Character" }
      });
      this.directory.on("create", () => this.request("createActor", { name: "New Adventurer", type: "Character" }));
      this.directory.on("duplicate", ({ id }) => this.request("duplicateActor", { actorId: id }));
      this.directory.on("delete", () => this.showError("Character deletion is not available yet."));
      this.directory.on("select", ({ id }) => {
        const entry = this.entries.find((actor) => actor.id === id);
        if (!entry?.actor?.abilities) return this.showError("You do not have access to this character sheet.");
        this.openCharacterSheet(id, entry);
      });
    } catch (error) { this.showError(error.message); }

    try {
      this.compendium = comps.create("easel.collections.compendium@1", {
        props: {
          entries: options.packs || []
        }
      });
    } catch (error) { this.showError(error.message); }

    try {
      this.dicesettings = comps.create("easel.dice.dicesettings@1", {
        props: {
          theme: options.diceTheme || "standard"
        }
      });
    } catch (error) { this.showError(error.message); }

    if (this.chatlog) {
      try {
        this.sidebarTabs = comps.create("easel.layout.tabs@1", {
          props: {
            items: [
              { id: "chat", label: "Chat" },
              { id: "combat", label: "Combat" },
              { id: "directory", label: "Actors" },
              { id: "compendium", label: "Compendium" },
              { id: "dice", label: "Dice" }
            ],
            active: "chat"
          }
        });
        this.sidebarTabs.on("change", (p) => {
          const active = p?.value?.active || p?.active;
          if (active) this.sidebarTabs.setProps({ active });
        });
        if (this.chatlog) this.chatlog.attach(this.sidebarTabs, "tab0");
        if (this.tracker) this.tracker.attach(this.sidebarTabs, "tab1");
        if (this.directory) this.directory.attach(this.sidebarTabs, "tab2");
        if (this.compendium) this.compendium.attach(this.sidebarTabs, "tab3");
        if (this.dicesettings) this.dicesettings.attach(this.sidebarTabs, "tab4");
        this.sidebarTabs.attach(this.workspace, "sidebar");
      } catch {
        this.chatlog.attach(this.workspace, "sidebar");
      }
    }

    Application.events.on("easel.pf1e.state", (state) => this.receiveState(state));
    if (!this.integrated) Application.events.on("easel.pf1e.rollResult", (result) => this.animateRoll(result));
    Application.events.on("easel.pf1e.error", ({ message }) => this.showError(message));
    Application.events.on("easel.pf1e.recordSaved", ({ recordType, recordId }) => {
      const id = `win-edit-${recordType}-${recordId}`;
      this.activeWindows.get(id)?.destroy();
      this.activeWindows.delete(id);
    });
    Application.events.on("easel.pf1e.changed", () => this.request("refresh", {}));
    Application.events.on("Users.Changed", () => this.request("refresh", {}));
    Application.onReady(() => this.request("refresh", {}));

    comps.mountRoot(this.workspace);
    return this.workspace;
  }

  request(name, payload) {
    if (["rollAbility", "rollSave", "rollSkill", "rollInitiative", "useAction", "castSpell"].includes(name)) payload = { rollMode: this.rollMode || "public", ...payload };
    if (name === "applyDamage") payload = { multiplier: 1, isNonlethal: false, ...payload };
    if (name === "rollSave") payload = { dc: 0, ...payload };
    return Application.events.emit("easel.pf1e." + name, payload).catch((error) => this.showError(error.message));
  }

  showError(message) {
    this.status?.setProps({ text: "Error: " + message });
  }

  animateRoll(result) {
    if (result.dicePayload) this.dicebox?.setProps({ rolls: [result.dicePayload] });
  }

  receiveState(state) {
    this.entries = state.entries;
    this.directory.setProps({ entries: state.entries });
    if (this.integrated) this.onLegacyMessages?.(state.messages);
    else this.chatlog.setProps({ messages: state.messages });
    this.status?.setProps({ text: "" });
    for (const [actorId, view] of this.sheetViews) {
      if (state.entries.some((entry) => entry.id === actorId)) continue;
      view.win.destroy();
      this.sheetViews.delete(actorId);
      this.activeWindows.delete("win-actor-" + actorId);
    }
    for (const entry of state.entries) {
      const view = this.sheetViews.get(entry.id);
      if (!view) continue;
      const { id, name, type, ...sheetData } = entry;
      view.sheet.setProps({ ...sheetData, disabled: false });
      const actor = entry.actor;
      const derived = entry.derived || {};
      view.win.setProps({ title: actor.name });
      view.vit?.setProps({ hp: actor.health.hp, maxHp: actor.health.maxHp, tempHp: actor.health.tempHp, nonlethal: actor.health.nonlethal, disabled: !entry.canEdit });
      view.def?.setProps({ ac: derived.ac, saves: derived.saves, cmd: derived.cmd, disabled: entry.canControl === false });
      view.adef?.setProps({ ac: derived.ac, saves: derived.saves, cmd: derived.cmd, disabled: entry.canControl === false });
      view.ab?.setProps({ abilities: derived.abilities, editable: entry.canEdit, disabled: entry.canControl === false });
      view.eq?.setProps({ editable: entry.canEdit, disabled: !entry.canEdit });
      view.sp?.setProps({ disabled: entry.canControl === false });
      view.bio?.setProps({ text: actor.notes?.biography || "", editable: entry.canEdit });
      view.notes?.setProps({ text: actor.notes?.general || "", editable: entry.canEdit });
    }
  }

  openCharacterSheet(actorId, initialData = {}) {
    const comps = globalThis.Easel?.Components;
    if (!comps || !this.workspace) return;

    const winId = "win-actor-" + actorId;
    if (this.activeWindows.has(winId)) {
      return this.activeWindows.get(winId);
    }

    const offset = (this.activeWindows.size * 35) % 180;
    const win = comps.create("easel.layout.window@1", {
      props: {
        title: initialData.actor?.name || "Character Sheet",
        width: Math.min(900, (globalThis.innerWidth || 1100) - 100),
        height: Math.min(780, (globalThis.innerHeight || 900) - 150),
        open: true,
        data: { x: 50 + offset, y: 50 + offset }
      }
    });

    const { id: _ignoreId, name: _ignoreName, type: _ignoreType, ...cleanData } = initialData;
    const sheet = comps.create("easel.pf1e.charactersheet@1", {
      props: {
        ...cleanData,
        title: initialData.actor?.name || "Character Sheet",
        open: true
      }
    });

    const widgets = {};
    const updateActor = (changes) => this.request("updateActor", { actorId, changes });
    const wireSheetActions = (s) => {
      s.on("tabChange", ({ tab }) => s.setProps({ activeTab: tab }));
      s.on("updateActor", ({ changes }) => updateActor(changes));
      s.on("updateSkillRanks", ({ skillId, ranks }) => {
        const skills = structuredClone(this.entries.find((entry) => entry.id === actorId)?.actor.skills || {});
        skills[skillId] = { ...skills[skillId], ranks };
        updateActor({ skills });
      });
      s.on("updateSkillClassSkill", ({ skillId, isClassSkill }) => {
        const skills = structuredClone(this.entries.find((entry) => entry.id === actorId)?.actor.skills || {});
        skills[skillId] = { ...skills[skillId], isClassSkill };
        updateActor({ skills });
      });
      s.on("toggleCondition", ({ condition, active }) => updateActor({ conditions: { [condition]: active } }));
      s.on("updateSettings", ({ settings }) => updateActor({ settings }));
      s.on("createRecord", ({ recordType }) => this.openRecordEditor(recordType, "", { actorId }));
      s.on("rollAbility", (p) => {
        this.request("rollAbility", {
          actorId,
          ability: String(p.ability || "str"),
          score: Math.round(Number(p.score || 10)),
          modifier: Math.round(Number(p.modifier || 0))
        });
      });
      s.on("rollSave", (p) => {
        this.request("rollSave", {
          actorId,
          save: String(p.save || "fort"),
          modifier: Math.round(Number(p.modifier || 0)),
          dc: Math.round(Number(p.dc || 0))
        });
      });
      s.on("rollSkill", (p) => {
        this.request("rollSkill", {
          actorId,
          skillId: String(p.skillId || "acrobatics"),
          modifier: Math.round(Number(p.modifier || 0)),
          take: Math.round(Number(p.take || 0))
        });
      });
      s.on("rollInitiative", () => {
        this.request("rollInitiative", {
          actorId
        });
      });
      s.on("useAction", (p) => {
        const actionData = p.actionData || {};
        if (p.mode === "fast" || p.mode === "fast-full") {
          this.request("useAction", {
            actorId,
            actionId: String(p.actionId || "action-default"),
            mode: String(p.mode || "fast"),
            take: Math.round(Number(p.take || 0)),
            bonus: Math.round(Number(p.bonus || 0)),
            conditionalModifiers: Array.isArray(p.conditionalModifiers) ? p.conditionalModifiers : [],
            actionData
          });
        } else {
          this.openRollDialog(p, (rollIntent) => {
            this.request("useAction", {
              actorId,
              actionId: String(p.actionId || "action-default"),
              mode: String(p.mode || "normal"),
              take: Math.round(Number(rollIntent.take || 0)),
              bonus: Math.round(Number(rollIntent.bonus || 0)),
              conditionalModifiers: Array.isArray(p.conditionalModifiers) ? p.conditionalModifiers : [],
              actionData,
              rollMode: rollIntent.rollMode || this.rollMode || "public"
            });
          });
        }
      });
      s.on("castSpell", (p) => {
        this.request("castSpell", {
          actorId,
          spellId: String(p.spellId || ""),
          level: Math.round(Number(p.level || 0))
        });
      });
      s.on("applyDamage", (p) => {
        this.request("applyDamage", {
          actorId,
          amount: Number(p.amount || 0),
          isNonlethal: Boolean(p.isNonlethal),
          multiplier: Number(p.multiplier ?? 1)
        });
      });
      s.on("applyHealing", (p) => {
        this.request("applyHealing", {
          actorId,
          amount: Number(p.amount || 0)
        });
      });
      s.on("rest", (p) => {
        this.request("rest", {
          actorId,
          isFullBedrest: Boolean(p.isFullBedrest),
          hd: Math.round(Number(p.hd || 1))
        });
      });
      s.on("editRecord", ({ recordType, recordId }) => {
        const entry = this.entries.find((entry) => entry.id === actorId);
        const record = ["items", "features", "buffs", "actions", "spells", "spellbooks", "classes"].flatMap((key) => entry?.[key] || []).find((record) => record.id === recordId);
        this.openRecordEditor(record?.type || recordType, recordId, record || { actorId });
      });
    };

    wireSheetActions(sheet);
    sheet.attach(win, "body");
    win.attach(this.workspace, "windows");

    const actor = initialData.actor || {};
    const derived = initialData.derived || {};

    try {
      const vit = comps.create("easel.d20.vitality@1", {
        props: {
          hp: derived.health?.hp ?? actor.health?.hp ?? 10,
          maxHp: derived.health?.maxHp ?? actor.health?.maxHp ?? 10,
          tempHp: derived.health?.tempHp ?? actor.health?.tempHp ?? 0,
          nonlethal: derived.health?.nonlethal ?? actor.health?.nonlethal ?? 0,
          status: "healthy",
          disabled: initialData.canEdit === false
        }
      });
      vit.on("applyDamage", (p) => this.request("applyDamage", { ...p, actorId }));
      vit.on("applyHealing", (p) => this.request("applyHealing", { ...p, actorId }));
      widgets.vit = vit;
      vit.attach(sheet, "summaryVitality");
    } catch (e) {
      console.error("Vitality mount error:", e);
    }

    try {
      const def = comps.create("easel.d20.defensebanner@1", {
        props: {
          disabled: initialData.canControl === false,
          ac: derived.ac || { normal: 10, touch: 10, flatFooted: 10 },
          saves: derived.saves || actor.saves || {},
          cmd: derived.cmd ?? 10
        }
      });
      def.on("rollSave", (p) => this.request("rollSave", { ...p, actorId }));
      widgets.def = def;
      def.attach(sheet, "summaryDefenses");
    } catch (e) {
      console.error("Defenses mount error:", e);
    }

    try {
      const ab = comps.create("easel.d20.abilityblock@1", {
        props: {
          disabled: initialData.canControl === false,
          abilities: derived.abilities || actor.abilities || {},
          editable: initialData.canEdit !== false
        }
      });
      ab.on("updateAbility", ({ ability, score }) => updateActor({ abilities: { [ability]: { base: score } } }));
      ab.on("rollAbility", (p) => this.request("rollAbility", { ...p, actorId }));
      widgets.ab = ab;
      ab.attach(sheet, "attributesAbilities");
    } catch (e) {
      console.error("Abilities mount error:", e);
    }

    try {
      const adef = comps.create("easel.d20.defensebanner@1", {
        props: {
          disabled: initialData.canControl === false,
          ac: derived.ac || { normal: 10, touch: 10, flatFooted: 10 },
          saves: derived.saves || actor.saves || {},
          cmd: derived.cmd ?? 10
        }
      });
      adef.on("rollSave", (p) => this.request("rollSave", { ...p, actorId }));
      widgets.adef = adef;
      adef.attach(sheet, "attributesDefenses");
    } catch (e) {
      console.error("Attr defenses mount error:", e);
    }

    try {
      const mods = Array.isArray(initialData.modifiers) ? initialData.modifiers : (Array.isArray(derived.modifiers) ? derived.modifiers : []);
      const ml = comps.create("easel.rules.modifierlist@1", {
        props: {
          columns: [
            { key: "target", label: "Target" },
            { key: "type", label: "Type" },
            { key: "value", label: "Value" }
          ],
          items: mods.map((m, i) => ({
            id: String(i),
            target: m.target || "",
            type: m.bonusType || m.type || "untyped",
            value: m.formula || m.value || 0
          }))
        }
      });
      ml.attach(sheet, "attributesModifiers");
    } catch (e) {
      console.error("ModifierList mount error:", e);
    }

    try {
      const eq = comps.create("easel.d20.equipmentslots@1", {
        props: {
          slots: derived.equippedSlots || {},
          editable: initialData.canEdit !== false,
          disabled: initialData.canEdit === false
        }
      });
      eq.on("equipItem", (p) => this.request("equipItem", { ...p, actorId }));
      eq.on("unequipItem", (p) => this.request("unequipItem", { ...p, actorId }));
      eq.on("inspectSlot", (p) => this.request("inspectSlot", { ...p, actorId }));
      widgets.eq = eq;
      eq.attach(sheet, "inventoryEquipment");
    } catch (e) {
      console.error("Equipment mount error:", e);
    }

    try {
      const sp = comps.create("easel.d20.spellbook@1", {
        props: {
          disabled: initialData.canControl === false,
          activeLevel: 0,
          casterLevel: derived.casterLevel ?? 1,
          spellbook: derived.spellsByLevel || {}
        }
      });
      sp.on("castSpell", (p) => this.request("castSpell", { ...p, actorId }));
      sp.on("rollConcentration", (p) => this.request("rollConcentration", { ...p, actorId }));
      sp.on("rollCasterLevel", (p) => this.request("rollCasterLevel", { ...p, actorId }));
      widgets.sp = sp;
      sp.attach(sheet, "spellbooksSlot");
    } catch (e) {
      console.error("Spellbook mount error:", e);
    }

    try {
      const bio = comps.create("easel.narrative.richtext@1", {
        props: {
          text: actor.notes?.biography || "",
          editable: initialData.canEdit !== false
        }
      });
      bio.on("change", ({ text }) => updateActor({ notes: { biography: text } }));
      widgets.bio = bio;
      bio.attach(sheet, "biographyRichText");
    } catch (e) {
      console.error("Bio mount error:", e);
    }

    try {
      const notes = comps.create("easel.narrative.richtext@1", {
        props: {
          text: actor.notes?.general || "",
          editable: initialData.canEdit !== false
        }
      });
      notes.on("change", ({ text }) => updateActor({ notes: { general: text } }));
      widgets.notes = notes;
      notes.attach(sheet, "notesRichText");
    } catch (e) {
      console.error("Notes mount error:", e);
    }

    win.on("close", () => {
      win.destroy();
      this.activeWindows.delete(winId);
      this.sheetViews.delete(actorId);
    });

    this.activeWindows.set(winId, win);
    this.sheetViews.set(actorId, { sheet, win, ...widgets });
    return win;
  }

  openNPCSheet(actorId, mode = "lite", initialData = {}) {
    const comps = globalThis.Easel?.Components;
    if (!comps || !this.workspace) return;

    const winId = "win-npc-" + actorId;
    if (this.activeWindows.has(winId)) {
      return this.activeWindows.get(winId);
    }

    const win = comps.create("easel.layout.window@1", {
      props: {
        title: initialData.actor?.name || "NPC Sheet",
        width: 700,
        height: 550,
        open: true,
        data: { x: 70, y: 70 }
      }
    });

    const sheet = comps.create("easel.pf1e.npcsheet@1", {
      props: {
        ...initialData,
        mode,
        title: initialData.actor?.name || "NPC Sheet",
        open: true
      }
    });

    sheet.on("rollAbility", (p) => {
      this.request("rollAbility", { ...p, actorId });
    });
    sheet.on("rollSave", (p) => {
      this.request("rollSave", { ...p, actorId });
    });
    sheet.on("rollSkill", (p) => {
      this.request("rollSkill", { ...p, actorId });
    });
    sheet.on("useAction", (p) => {
      this.request("useAction", {
        actorId,
        actionId: String(p.actionId || "action-default"),
        mode: String(p.mode || "normal"),
        take: Math.round(Number(p.take || 0)),
        bonus: Math.round(Number(p.bonus || 0)),
        conditionalModifiers: Array.isArray(p.conditionalModifiers) ? p.conditionalModifiers : [],
        actionData: p.actionData || {}
      });
    });
    sheet.on("applyDamage", (p) => {
      this.request("applyDamage", { ...p, actorId });
    });
    sheet.on("transferItem", (p) => {
      this.request("transferItem", p);
    });
    sheet.on("transferCoin", (p) => {
      this.request("transferCoin", p);
    });
    sheet.on("importStatblock", (p) => {
      this.request("importStatblock", p);
    });

    sheet.attach(win, "body");
    win.attach(this.workspace, "windows");

    const actor = initialData.actor || {};
    const derived = initialData.derived || {};

    try {
      const vit = comps.create("easel.d20.vitality@1", {
        props: {
          hp: derived.health?.hp ?? actor.health?.hp ?? 10,
          maxHp: derived.health?.maxHp ?? actor.health?.maxHp ?? 10,
          tempHp: derived.health?.tempHp ?? actor.health?.tempHp ?? 0,
          nonlethal: derived.health?.nonlethal ?? actor.health?.nonlethal ?? 0,
          status: "healthy"
        }
      });
      vit.on("applyDamage", (p) => this.request("applyDamage", { ...p, actorId }));
      vit.on("applyHealing", (p) => this.request("applyHealing", { ...p, actorId }));
      vit.attach(sheet, "liteVitality");
    } catch (error) { this.showError(error.message); }

    try {
      const def = comps.create("easel.d20.defensebanner@1", {
        props: {
          ac: derived.ac || { normal: 10, touch: 10, flatFooted: 10 },
          saves: derived.saves || actor.saves || {},
          cmd: derived.cmd ?? 10
        }
      });
      def.on("rollSave", (p) => this.request("rollSave", { ...p, actorId }));
      def.attach(sheet, "liteDefenses");
    } catch (error) { this.showError(error.message); }

    win.on("close", () => {
      win.destroy();
      this.activeWindows.delete(winId);
    });

    this.activeWindows.set(winId, win);
    return win;
  }

  openRecordEditor(recordType, recordId, initialRecord = {}) {
    const comps = globalThis.Easel?.Components;
    if (!comps || !this.workspace) return;

    const winId = `win-edit-${recordType}-${recordId}`;
    if (this.activeWindows.has(winId)) {
      return this.activeWindows.get(winId);
    }

    const win = comps.create("easel.layout.window@1", {
      props: {
        title: `Edit ${recordType}`,
        width: 600,
        height: 500,
        open: true,
        data: { x: 100, y: 100 }
      }
    });

    const editor = comps.create("easel.pf1e.recordeditor@1", {
      props: {
        recordType,
        record: { ...initialRecord, id: recordId },
        actions: [],
        open: true
      }
    });

    editor.on("save", (p) => {
      this.request("saveRecord", p);
    });
    editor.on("close", () => { win.destroy(); this.activeWindows.delete(winId); });
    editor.attach(win, "body");
    win.attach(this.workspace, "windows");

    win.on("close", () => {
      win.destroy();
      this.activeWindows.delete(winId);
    });

    this.activeWindows.set(winId, win);
    return win;
  }

  openRollDialog(actionProps, onRoll) {
    const comps = globalThis.Easel?.Components;
    if (!comps || !this.workspace) return;

    const dlgWin = comps.create("easel.layout.window@1", {
      props: {
        title: "Roll: " + (actionProps.actionData?.name || actionProps.name || "Action"),
        width: 380,
        height: 320,
        open: true,
        data: { x: 200, y: 150 }
      }
    });

    const dlg = comps.create("easel.d20.rolldialog@1", {
      props: {
        bonus: actionProps.bonus || 0,
        conditionalModifiers: actionProps.conditionalModifiers || [],
        rollModes: ["public", "gm", "blind", "self"],
        open: true
      }
    });

    dlg.on("roll", (payload) => {
      dlgWin.destroy();
      onRoll(payload);
    });
    dlg.on("cancel", () => {
      dlgWin.destroy();
    });

    dlg.attach(dlgWin, "body");
    dlgWin.attach(this.workspace, "windows");
  }
}
