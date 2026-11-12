import { mapInspector, stageInspector, tokenFields } from "./inspector.mjs";
import { menu as openMenu } from "./ui.mjs";

const REQUIRED = [
  "easel.layout.tabletop@1",
  "easel.layout.window@2",
  "easel.layout.sidebar@1",
  "easel.input.toolrail@1",
  "easel.input.hotbar@1",
  "easel.input.form@1",
  "easel.maps.map@2",
  "easel.maps.shadowbox@2",
  "easel.maps.scenenav@1",
  "easel.maps.layertree@1",
  "easel.narrative.chat@1",
  "easel.narrative.journal@2",
  "easel.combat.tracker@1",
  "easel.collections.browser@2",
  "easel.characters.statsheet@1",
  "easel.display.players@1",
];

const clone = (value) => JSON.parse(JSON.stringify(value ?? null));
const newId = (prefix) => prefix + "-" + Math.random().toString(36).slice(2, 10);

export default class Tabletop {
  static get requires() {
    return REQUIRED;
  }

  async mount(options = {}) {
    this.Easel = options.Easel || globalThis.Easel;
    this.Application = options.Application || globalThis.Application;
    this.system = options.system || {};
    this.state = null;
    this.viewing = "";
    this.editing = false;
    this.draft = null;
    this.tool = "select";
    this.selectedTokens = [];
    this.selection = { kind: "", id: "" };
    this.layerId = "";
    this.sideTab = "chat";
    this.sidebarOpen = true;
    this.toasts = [];
    this.pings = [];
    this.rulers = new Map();
    this.windows = new Map();
    this.insets = {};
    this.chatMode = "public";
    this.unread = 0;
    this.offs = [];
    const E = this.Easel;
    await Promise.all(REQUIRED.map((name) => E.Interfaces.load(name)));
    const make = (name, props = {}) => E.Components.create(name, { props });
    this.frame = make("easel.layout.tabletop@1");
    this.map = make("easel.maps.map@2");
    this.stage = make("easel.maps.shadowbox@2");
    this.nav = make("easel.maps.scenenav@1");
    this.rail = make("easel.input.toolrail@1");
    this.hotbar = make("easel.input.hotbar@1", { slots: this.macros() });
    this.players = make("easel.display.players@1");
    this.side = make("easel.layout.sidebar@1");
    this.chat = make("easel.narrative.chat@1", { quickDice: this.system.quickDice || ["d4", "d6", "d8", "d10", "d12", "d20", "d100"] });
    this.tracker = make("easel.combat.tracker@1");
    this.actors = make("easel.collections.browser@2", { kind: "actors", icon: "user", createLabel: "New character", emptyTitle: "No characters yet", emptyText: "Create one, then drag it onto the map.", placeholder: "Search characters" });
    this.journals = make("easel.collections.browser@2", { kind: "journal", icon: "book", createLabel: "New page", emptyTitle: "The journal is empty", emptyText: "Notes, handouts and lore live here.", placeholder: "Search the journal", draggable: false });
    this.scenes = make("easel.collections.browser@2", { kind: "scenes", icon: "map", createLabel: "New scene", emptyTitle: "No scenes yet", emptyText: "A scene is a battle map or a stage.", placeholder: "Search scenes", draggable: false });
    this.tree = make("easel.maps.layertree@1");
    this.inspect = make("easel.input.form@1", { emptyText: "Select something on the map to edit it.", emptyIcon: "pointer" });
    this.editPanel = make("easel.layout.sidebar@1", { tabs: [] });
    this.map.attach(this.frame, "canvas");
    this.nav.attach(this.frame, "top");
    this.rail.attach(this.frame, "rail");
    this.hotbar.attach(this.frame, "bottom");
    this.players.attach(this.frame, "corner");
    this.side.attach(this.frame, "sidebar");
    for (const panel of [this.chat, this.tracker, this.actors, this.journals, this.scenes]) panel.attach(this.side, "panels");
    this.editHost = make("easel.layout.sidebar@1", { tabs: [{ id: "layers", label: "Layers", icon: "layers", panel: this.tree.id }, { id: "properties", label: "Properties", icon: "settings", panel: this.inspect.id }], active: "layers" });
    this.tree.attach(this.editHost, "panels");
    this.inspect.attach(this.editHost, "panels");
    this.editHost.attach(this.side, "panels");
    this.editHost.on("select", ({ id }) => this.editHost.setProps({ active: id }));
    this.wire();
    E.Components.mountRoot(this.frame);
    const A = this.Application;
    this.listen("easel.vtt.state", ({ state }) => this.receive(state));
    this.listen("easel.vtt.error", ({ message }) => this.toast(message, "error"));
    this.listen("easel.vtt.changed", () => this.refresh());
    this.listen("Users.Changed", () => this.refresh());
    this.listen("easel.vtt.pinged", (ping) => this.pinged(ping));
    this.listen("easel.vtt.ruled", (ruler) => this.ruled(ruler));
    A.onReady(() => this.refresh());
    this.render();
    return this;
  }

  listen(name, handler) {
    try {
      this.offs.push(this.Application.events.on(name, handler));
    } catch {}
  }

  send(name, payload = {}) {
    return this.Application.events.emit("easel.vtt." + name, payload).catch((error) => this.toast(error.message, "error"));
  }

  refresh() {
    return this.viewing ? this.send("view", { sceneId: this.viewing }) : this.send("refresh", {});
  }

  toast(message, kind = "info") {
    this.toasts = [...this.toasts.slice(-3), { id: newId("toast"), message: String(message), kind }];
    this.frame.setProps({ toasts: this.toasts });
  }

  macros() {
    try {
      return JSON.parse(localStorage.getItem(this.storeKey("macros")) || "[]");
    } catch {
      return [];
    }
  }

  storeKey(name) {
    let game = "";
    try {
      game = sessionStorage.getItem("easel.easel.activeGame") || "";
    } catch {}
    return "easel.vtt." + name + "." + game;
  }

  get scene() {
    return this.state?.activeScene || null;
  }

  get gm() {
    return !!this.state?.isGM;
  }

  get isStage() {
    return this.scene?.kind === "stage";
  }

  receive(state) {
    const previous = this.state;
    this.state = state;
    if (this.viewing && !state.scenes.some((scene) => scene.id === this.viewing)) this.viewing = "";
    if (!state.isGM) this.viewing = "";
    const scene = state.activeScene;
    if (this.editing && (!scene || scene.id !== this.draftScene)) this.stopEditing(false);
    if (previous && state.messages.length > previous.messages.length && (this.sideTab !== "chat" || !this.sidebarOpen)) this.unread += state.messages.length - previous.messages.length;
    const before = previous?.combat?.currentId || "";
    const now = state.combat?.currentId || "";
    if (now && now !== before && previous) {
      const current = state.combat.combatants.find((entry) => entry.id === now);
      if (current) this.frame.setProps({ banner: { key: now + ":" + state.combat.round, eyebrow: "Round " + state.combat.round, title: current.name, subtitle: current.canControl && !state.isGM ? "It is your turn" : "" } });
    }
    this.selectedTokens = this.selectedTokens.filter((id) => (scene?.tokens || []).some((token) => token.id === id));
    if (this.pendingImage && scene) {
      const pending = this.pendingImage;
      const placed = scene.tokens.find((token) => !token.image && Math.abs(token.x - pending.x) < 1 && Math.abs(token.y - pending.y) < 1);
      if (placed) {
        this.pendingImage = null;
        this.send("tokenUpdate", { tokenId: placed.id, changes: { image: pending.url } });
      }
    }
    this.render();
    this.system.stateChanged?.(state);
  }

  wire() {
    const { frame, map, stage, nav, rail, side, chat, tracker, actors, journals, scenes, hotbar, tree, inspect } = this;
    frame.on("sidebarToggle", ({ open }) => {
      this.sidebarOpen = open;
      if (open && this.sideTab === "chat") this.unread = 0;
      this.render();
    });
    frame.on("toastDismiss", ({ id }) => {
      this.toasts = this.toasts.filter((toast) => toast.id !== id);
      frame.setProps({ toasts: this.toasts });
    });
    frame.on("insets", ({ insets }) => {
      this.insets = insets;
      map.setProps({ insets });
      stage.setProps({ insets });
    });
    side.on("select", ({ id }) => {
      this.sideTab = id;
      if (id === "chat") this.unread = 0;
      this.render();
    });
    rail.on("select", ({ id }) => {
      this.tool = id;
      this.render();
    });
    rail.on("toggle", ({ id, on }) => {
      if (id === "edit") on ? this.startEditing() : this.stopEditing(true);
    });
    rail.on("action", ({ id }) => this.railAction(id));
    nav.on("view", ({ id }) => this.viewScene(id));
    nav.on("activate", ({ id }) => this.send("sceneActivate", { sceneId: id }));
    nav.on("create", () => this.createScene());
    nav.on("action", ({ id, action }) => this.sceneAction(id, action));
    scenes.on("open", ({ id }) => this.viewScene(id));
    scenes.on("select", ({ id }) => this.viewScene(id));
    scenes.on("create", () => this.createScene());
    scenes.on("action", ({ id, action }) => (action === "activate" ? this.send("sceneActivate", { sceneId: id }) : this.sceneAction(id, action)));
    chat.on("send", ({ text, mode }) => this.send("chatSend", { text, rollMode: mode, whisperUserIds: [] }));
    chat.on("mode", ({ mode }) => {
      this.chatMode = mode;
      this.system.rollMode?.(mode);
      this.render();
    });
    chat.on("cardAction", (payload) => this.system.cardAction?.(payload, this));
    tracker.on("start", () => this.scene && this.send("combatStart", { sceneId: this.scene.id }));
    tracker.on("end", () => this.confirm("End the encounter?", "Initiative and turn order are cleared.", "End encounter").then((yes) => yes && this.send("combatEnd", { combatId: this.state.combat.id })));
    tracker.on("next", () => this.send("combatNext", { combatId: this.state.combat.id }));
    tracker.on("previous", () => this.send("combatPrevious", { combatId: this.state.combat.id }));
    tracker.on("roll", ({ id }) => this.send("combatantRollInitiative", { combatantId: id }));
    tracker.on("rollAll", () => {
      for (const entry of this.state.combat?.combatants || []) if (!entry.hasInitiative) this.send("combatantRollInitiative", { combatantId: entry.id });
    });
    tracker.on("addSelected", () => {
      if (!this.selectedTokens.length) return this.toast("Select tokens on the map first.");
      for (const tokenId of this.selectedTokens) this.send("combatantAdd", { combatId: this.state.combat.id, tokenId });
    });
    tracker.on("defeated", ({ id, defeated }) => this.send("combatantDefeated", { combatantId: id, defeated }));
    tracker.on("remove", ({ id }) => this.send("combatantRemove", { combatantId: id }));
    tracker.on("initiative", ({ id, initiative }) => this.send("combatantSetInitiative", { combatantId: id, initiative }));
    tracker.on("select", ({ tokenId }) => {
      if (tokenId) {
        this.selectedTokens = [tokenId];
        this.render();
      }
    });
    actors.on("open", ({ id }) => this.openSheet(id));
    actors.on("create", ({ folderId }) => this.system.createActor?.(folderId, this));
    actors.on("action", ({ id, action }) => this.actorAction(id, action));
    journals.on("open", ({ id }) => this.openJournal(id));
    journals.on("select", ({ id }) => this.openJournal(id));
    journals.on("create", ({ folderId }) => this.send("journalSave", { journalId: "", name: "Untitled page", content: "", playerVisible: false, folderId }));
    journals.on("createFolder", () => this.send("folderSave", { folderId: "", name: "New folder", kind: "journal", parentId: "" }));
    journals.on("move", ({ id, folderId }) => {
      const entry = this.state.journals.find((journal) => journal.id === id);
      if (entry) this.send("journalSave", { journalId: id, name: entry.name, content: entry.content, playerVisible: entry.playerVisible, folderId });
    });
    journals.on("action", ({ id, action }) => {
      const entry = this.state.journals.find((journal) => journal.id === id);
      if (!entry) return;
      if (action === "share") this.send("journalSave", { journalId: id, name: entry.name, content: entry.content, playerVisible: !entry.playerVisible, folderId: entry.folderId });
      if (action === "delete") this.confirm("Delete “" + entry.name + "”?", "This page is removed for everyone.", "Delete page").then((yes) => yes && this.send("journalDelete", { journalId: id }));
    });
    journals.on("folderAction", ({ id, action }) => {
      const folder = this.state.folders.find((entry) => entry.id === id);
      if (!folder) return;
      if (action === "delete") this.send("folderDelete", { folderId: id });
      if (action === "rename") this.prompt("Rename folder", folder.name).then((name) => name && this.send("folderSave", { folderId: id, name, kind: folder.kind, parentId: folder.parentId }));
    });
    hotbar.on("use", ({ index }) => {
      const macro = this.macros()[index];
      if (macro?.command) this.send("chatSend", { text: macro.command, rollMode: this.chatMode, whisperUserIds: [] });
    });
    hotbar.on("assign", ({ index }) => this.editMacro(index));
    hotbar.on("clear", ({ index }) => this.saveMacro(index, null));
    map.on("tokenSelect", ({ ids }) => {
      this.selectedTokens = ids;
      map.setProps({ selectedTokenIds: ids });
    });
    map.on("tokenMove", ({ id, x, y, groundId }) => {
      const token = this.scene?.tokens.find((entry) => entry.id === id);
      if (token) Object.assign(token, { x, y });
      this.send("tokenMove", { tokenId: id, groundId, x, y });
    });
    map.on("tokenOpen", ({ id }) => {
      const token = this.scene?.tokens.find((entry) => entry.id === id);
      if (token?.actorId) this.openSheet(token.actorId);
      else if (this.gm) this.configureToken(id);
    });
    map.on("tokenContext", ({ id, clientX, clientY }) => this.tokenMenu(id, clientX, clientY));
    map.on("tokenDelete", ({ ids }) => {
      if (!this.gm) return;
      this.confirm(ids.length === 1 ? "Remove this token?" : "Remove " + ids.length + " tokens?", "Their characters are kept.", "Remove").then((yes) => {
        if (yes) for (const tokenId of ids) this.send("tokenDelete", { tokenId });
      });
    });
    map.on("doorToggle", ({ id, open }) => this.send("doorToggle", { sceneId: this.scene.id, wallId: id, open }));
    map.on("ping", ({ x, y }) => this.send("ping", { sceneId: this.scene.id, x, y }));
    map.on("ruler", ({ points }) => this.send("ruler", { sceneId: this.scene.id, points }));
    map.on("draw", ({ drawing, groundId }) => this.send("drawingAdd", { sceneId: this.scene.id, groundId, drawing }));
    map.on("notice", ({ message }) => this.toast(message));
    map.on("drop", (drop) => this.dropped(drop));
    map.on("mapChange", ({ map: next }) => this.changeDraft(next));
    map.on("select", (selection) => {
      this.selection = selection;
      if (selection.id) this.editHost.setProps({ active: "properties" });
      this.renderEditor();
    });
    map.on("context", (context) => this.mapMenu(context));
    stage.on("select", ({ id }) => {
      this.selection = { kind: id ? "element" : "", id };
      if (id) this.editHost.setProps({ active: "properties" });
      this.render();
    });
    stage.on("boxChange", ({ box }) => this.changeDraft(box));
    stage.on("toggle", ({ id, on }) => this.send("stageToggle", { sceneId: this.scene.id, toggleId: id, on }));
    stage.on("drop", (drop) => this.stageDropped(drop));
    tree.on("select", ({ id, kind }) => {
      if (this.isStage) this.selection = { kind: "element", id };
      else {
        this.selection = { kind: kind === "ground" ? "ground" : "layer", id };
        this.layerId = kind === "ground" ? "" : id;
        if (kind === "ground" && id !== this.groundId) this.groundId = id;
      }
      this.render();
    });
    tree.on("visibility", ({ id, visible }) => this.editor()?.setVisible(id, visible));
    tree.on("preview", ({ id }) => this.isStage && stage.setProps({ previewId: id }));
    tree.on("action", ({ id, action }) => this.editor()?.treeAction(id, action));
    inspect.on("change", ({ id, value }) => this.editor()?.change(id, value.value));
    inspect.on("action", ({ id }) => this.editor()?.action(id));
    inspect.on("file", ({ id, file }) => this.upload(file.file).then((stored) => stored && this.editor()?.change(id, stored.url)));
  }

  editor() {
    if (!this.editing || !this.draft) return null;
    return (this.isStage ? stageInspector : mapInspector)(this);
  }

  async upload(file) {
    try {
      return await this.Application.files.upload(file);
    } catch (error) {
      this.toast(error.message || "The file could not be added.", "error");
      return null;
    }
  }

  viewScene(id) {
    if (!this.gm) return;
    if (this.editing) this.stopEditing(true);
    this.viewing = id === this.state.shownSceneId ? "" : id;
    this.selectedTokens = [];
    this.refresh();
  }

  createScene() {
    const bounds = { x: 80, y: 60 };
    this.choose("New scene", [
      { id: "map", label: "Battle map", icon: "map", hint: "Grid, tokens, walls and light" },
      { id: "stage", label: "Stage", icon: "theater", hint: "A staged scene with dialogue" },
    ]).then((kind) => {
      if (!kind) return;
      this.prompt(kind === "stage" ? "Name the stage" : "Name the battle map", kind === "stage" ? "New stage" : "New map").then((name) => name && this.send(kind === "stage" ? "stageCreate" : "sceneCreate", { name }));
    });
    return bounds;
  }

  sceneAction(id, action) {
    const scene = this.state.scenes.find((entry) => entry.id === id);
    if (!scene) return;
    if (action === "edit") {
      this.viewing = id === this.state.shownSceneId ? "" : id;
      this.pendingEdit = id;
      this.refresh();
    } else if (action === "navigation") this.send("sceneUpdate", { sceneId: id, name: scene.name, navigation: !scene.navigation, folderId: scene.folderId || "" });
    else if (action === "duplicate") this.send("sceneDuplicate", { sceneId: id });
    else if (action === "settings") this.prompt("Rename scene", scene.name).then((name) => name && this.send("sceneUpdate", { sceneId: id, name, navigation: !!scene.navigation, folderId: scene.folderId || "" }));
    else if (action === "delete")
      this.confirm("Delete “" + scene.name + "”?", "Its map, tokens and doors are removed for everyone.", "Delete scene").then((yes) => {
        if (!yes) return;
        if (this.viewing === id) this.viewing = "";
        this.send("sceneDelete", { sceneId: id });
      });
  }

  startEditing() {
    if (!this.gm || !this.scene) return;
    this.editing = true;
    this.draftScene = this.scene.id;
    this.draft = clone(this.isStage ? this.scene.stage : this.scene.map);
    this.tool = "select";
    this.selection = { kind: "", id: "" };
    this.groundId = this.groundId || "";
    this.sideTab = "edit";
    this.sidebarOpen = true;
    this.render();
  }

  stopEditing(save) {
    if (save) this.flushDraft();
    clearTimeout(this.saveTimer);
    this.editing = false;
    this.draft = null;
    this.tool = "select";
    this.selection = { kind: "", id: "" };
    if (this.sideTab === "edit") this.sideTab = "chat";
    this.render();
  }

  changeDraft(next) {
    if (!this.editing) return;
    this.draft = clone(next);
    this.dirty = true;
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flushDraft(), 700);
    this.render();
  }

  flushDraft() {
    clearTimeout(this.saveTimer);
    if (!this.dirty || !this.draft || !this.draftScene) return;
    this.dirty = false;
    if (this.isStage) this.send("stageSave", { sceneId: this.draftScene, stage: this.draft });
    else this.send("sceneSaveMap", { sceneId: this.draftScene, map: this.draft });
  }

  railAction(id) {
    if (id === "clearDrawings") this.confirm("Clear every drawing?", "Drawings on this scene are erased for everyone.", "Clear").then((yes) => yes && this.send("drawingsClear", { sceneId: this.scene.id }));
    else if (id === "speak") this.speak();
    else if (id === "undo") this.keyTo("z", false);
    else if (id === "redo") this.keyTo("z", true);
  }

  keyTo(key, shift) {
    const target = document.querySelector(this.isStage ? ".ez-shadowbox" : ".ez-map");
    target?.dispatchEvent(new KeyboardEvent("keydown", { key, ctrlKey: true, shiftKey: shift, bubbles: true }));
  }

  pinged(ping) {
    if (!this.scene || ping.sceneId !== this.scene.id) return;
    this.pings = [...this.pings.slice(-12), { id: newId("ping"), x: ping.x, y: ping.y, color: this.colorOf(ping.userId) }];
    this.map.setProps({ pings: this.pings });
  }

  ruled(ruler) {
    if (!this.scene || ruler.sceneId !== this.scene.id || ruler.userId === this.state.userId) return;
    clearTimeout(this.rulers.get(ruler.userId)?.timer);
    if (ruler.points.length < 2) this.rulers.delete(ruler.userId);
    else
      this.rulers.set(ruler.userId, {
        points: ruler.points,
        color: this.colorOf(ruler.userId),
        timer: setTimeout(() => {
          this.rulers.delete(ruler.userId);
          this.pushRulers();
        }, 4000),
      });
    this.pushRulers();
  }

  pushRulers() {
    this.map.setProps({ rulers: [...this.rulers.entries()].map(([id, ruler]) => ({ id, points: ruler.points, color: ruler.color })) });
  }

  colorOf(userId) {
    const palette = ["#8b9dff", "#43d9c0", "#f2b45a", "#ff8a7a", "#c792ea", "#5fd38d", "#6cc6ff", "#f78fb3"];
    const index = Math.max(0, (this.state?.members || []).findIndex((member) => member.id === userId));
    return palette[index % palette.length];
  }

  dropped({ data, x, y, groundId }) {
    if (!this.scene) return;
    if (data.kind === "actors" && data.id) {
      if (!this.gm) return this.toast("Only the game master places tokens.");
      const actor = (this.state.actors || []).find((entry) => entry.id === data.id);
      this.send("tokenCreate", { sceneId: this.scene.id, groundId, actorType: actor?.type || "", actorId: data.id, name: "", x, y });
      return;
    }
    if (data.kind === "files" && this.gm) {
      const file = data.files.find((entry) => /^image\//.test(entry.type));
      if (!file) return this.toast("Drop an image file.");
      this.upload(file).then((stored) => {
        if (!stored) return;
        if (this.editing) mapInspector(this).addImage(stored.url, x, y);
        else {
          this.pendingImage = { x, y, url: stored.url };
          this.send("tokenCreate", { sceneId: this.scene.id, groundId, actorType: "", actorId: "", name: file.name.replace(/\.[^.]+$/, "").slice(0, 60) || "Token", x, y });
        }
      });
    }
  }

  stageDropped({ data, x, y }) {
    if (data.kind !== "files" || !this.editing) return;
    const file = data.files.find((entry) => /^image\//.test(entry.type));
    if (file) this.upload(file).then((stored) => stored && stageInspector(this).addImage(stored.url, file.name, x, y));
  }

  tokenMenu(id, clientX, clientY) {
    const token = this.scene?.tokens.find((entry) => entry.id === id);
    if (!token) return;
    const combat = this.state.combat;
    const inCombat = combat?.combatants.find((entry) => entry.tokenId === id);
    const items = [];
    if (token.actorId) items.push({ id: "sheet", label: "Open character sheet", icon: "user" });
    if (this.gm) {
      items.push({ id: "configure", label: "Token settings", icon: "settings" });
      items.push({ id: "hidden", label: token.hidden ? "Reveal to players" : "Hide from players", icon: token.hidden ? "eye" : "eyeOff" });
      if (combat) items.push(inCombat ? { id: "leave", label: "Remove from encounter", icon: "swords" } : { id: "join", label: "Add to encounter", icon: "swords" });
      items.push({ separator: true }, { id: "delete", label: "Remove token", icon: "trash", danger: true });
    }
    if (!items.length) return;
    this.menu(items, { x: clientX, y: clientY }, (action) => {
      if (action === "sheet") this.openSheet(token.actorId);
      else if (action === "configure") this.configureToken(id);
      else if (action === "hidden") this.send("tokenUpdate", { tokenId: id, changes: { hidden: !token.hidden } });
      else if (action === "join") this.send("combatantAdd", { combatId: combat.id, tokenId: id });
      else if (action === "leave") this.send("combatantRemove", { combatantId: inCombat.id });
      else if (action === "delete") this.send("tokenDelete", { tokenId: id });
    });
  }

  mapMenu({ x, y, clientX, clientY }) {
    if (!this.scene) return;
    const items = [{ id: "ping", label: "Ping here", icon: "ping" }];
    if (this.gm && !this.editing) items.push({ id: "token", label: "Place a blank token", icon: "token" }, { separator: true }, { id: "edit", label: "Edit this map", icon: "edit" });
    this.menu(items, { x: clientX, y: clientY }, (action) => {
      if (action === "ping") this.send("ping", { sceneId: this.scene.id, x, y });
      else if (action === "edit") this.startEditing();
      else if (action === "token") this.prompt("Name the token", "Token").then((name) => name && this.send("tokenCreate", { sceneId: this.scene.id, groundId: "", actorType: "", actorId: "", name, x, y }));
    });
  }

  menu(items, position, choose) {
    openMenu(items, position, choose);
  }

  actorAction(id, action) {
    if (action === "open") this.openSheet(id);
    else if (action === "delete") {
      const actor = this.state.actors.find((entry) => entry.id === id);
      this.confirm("Delete “" + (actor?.name || "this character") + "”?", "The character and its sheet are removed. Tokens on maps stay until you remove them.", "Delete character").then((yes) => yes && this.system.deleteActor?.(id, this));
    } else this.system.actorAction?.(id, action, this);
  }

  window(key, props, build) {
    const existing = this.windows.get(key);
    if (existing) {
      existing.frame.setProps({ ...props, minimized: false });
      existing.update?.();
      return existing;
    }
    const count = this.windows.size;
    const frame = this.Easel.Components.create("easel.layout.window@2", { props: { x: 84 + (count % 6) * 28, y: 64 + (count % 6) * 26, ...props } });
    const entry = { frame };
    frame.attach(this.frame, "windows");
    frame.on("close", () => this.closeWindow(key));
    frame.on("minimize", ({ minimized }) => frame.setProps({ minimized }));
    frame.on("move", (position) => frame.setProps(position));
    frame.on("resize", (size) => frame.setProps(size));
    this.windows.set(key, entry);
    build(entry);
    return entry;
  }

  closeWindow(key) {
    const entry = this.windows.get(key);
    if (!entry) return;
    this.windows.delete(key);
    entry.closed?.();
    entry.frame.destroy();
  }

  form(key, props, fields, values, handlers = {}) {
    return this.window(key, { width: 380, height: 420, ...props }, (entry) => {
      entry.values = clone(values);
      entry.form = this.Easel.Components.create("easel.input.form@1", { props: { fields, values: entry.values, actions: handlers.actions || [] } });
      entry.form.attach(entry.frame, "content");
      entry.form.on("change", ({ id, value }) => {
        const parts = id.split(".");
        let target = entry.values;
        for (const part of parts.slice(0, -1)) target = target[part] = target[part] ?? {};
        target[parts[parts.length - 1]] = value.value;
        entry.form.setProps({ values: entry.values });
        handlers.change?.(id, value.value, entry.values);
      });
      entry.form.on("file", ({ id, file }) =>
        this.upload(file.file).then((stored) => {
          if (!stored) return;
          entry.values[id] = stored.url;
          entry.form.setProps({ values: entry.values });
          handlers.change?.(id, stored.url, entry.values);
        }),
      );
      entry.form.on("action", ({ id }) => handlers.action?.(id, entry.values));
      entry.form.on("submit", () => handlers.action?.(handlers.submit || "ok", entry.values));
    });
  }

  confirm(title, message, label = "Confirm") {
    return new Promise((resolve) => {
      const key = newId("confirm");
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        resolve(value);
        this.closeWindow(key);
      };
      const entry = this.form(key, { title, icon: "warning", width: 360, height: 190, resizable: false, x: Math.max(40, innerWidth / 2 - 180 - (this.insets.right || 0) / 2), y: Math.max(40, innerHeight / 2 - 150) }, [{ type: "static", wide: true, text: message }], {}, {
        actions: [
          { id: "cancel", label: "Cancel", kind: "ghost" },
          { id: "ok", label, kind: "primary" },
        ],
        action: (id) => finish(id === "ok"),
      });
      entry.closed = () => finish(false);
    });
  }

  prompt(title, initial = "") {
    return new Promise((resolve) => {
      const key = newId("prompt");
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        resolve(value);
        this.closeWindow(key);
      };
      const entry = this.form(key, { title, width: 360, height: 180, resizable: false, x: Math.max(40, innerWidth / 2 - 180 - (this.insets.right || 0) / 2), y: Math.max(40, innerHeight / 2 - 150) }, [{ id: "value", type: "text", wide: true, label: "" }], { value: initial }, {
        actions: [
          { id: "cancel", label: "Cancel", kind: "ghost" },
          { id: "ok", label: "Save", kind: "primary" },
        ],
        submit: "ok",
        action: (id, values) => finish(id === "ok" ? String(values.value || "").trim() : ""),
      });
      entry.closed = () => finish("");
      queueMicrotask(() => document.querySelector('[data-easel-id="' + entry.form.id + '"] input')?.select());
    });
  }

  choose(title, options) {
    return new Promise((resolve) => {
      const key = newId("choose");
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        resolve(value);
        this.closeWindow(key);
      };
      const entry = this.form(key, { title, width: 340, height: 120 + options.length * 46, resizable: false, x: Math.max(40, innerWidth / 2 - 170 - (this.insets.right || 0) / 2), y: Math.max(40, innerHeight / 2 - 160) }, options.map((option) => ({ id: option.id, type: "action", text: option.label, icon: option.icon, hint: option.hint })), {}, { action: (id) => finish(id) });
      entry.closed = () => finish("");
    });
  }

  openSheet(actorId) {
    const describe = () => this.system.sheet?.(actorId, this) || null;
    const sheet = describe();
    if (!sheet) return this.toast("You cannot open that character.");
    const entry = this.window("sheet:" + actorId, { title: sheet.actor.name || "Character", icon: "user", width: 460, height: 600 }, (created) => {
      created.sheet = this.Easel.Components.create("easel.characters.statsheet@1", { props: sheet });
      created.sheet.attach(created.frame, "content");
      for (const name of ["change", "roll", "image", "rename", "listAdd", "listRemove"]) created.sheet.on(name, (payload) => this.system.sheetEvent?.(actorId, name, payload, this));
    });
    entry.update = () => {
      const next = describe();
      if (!next) return this.closeWindow("sheet:" + actorId);
      entry.sheet.setProps(next);
      entry.frame.setProps({ title: next.actor.name || "Character" });
    };
  }

  openJournal(id) {
    const find = () => this.state.journals.find((journal) => journal.id === id);
    const page = find();
    if (!page) return;
    const entry = this.window("journal:" + id, { title: page.name, icon: "book", width: 480, height: 560 }, (created) => {
      created.page = this.Easel.Components.create("easel.narrative.journal@2", { props: { entry: page, canEdit: this.gm } });
      created.page.attach(created.frame, "content");
      created.page.on("save", ({ name, content, playerVisible }) => this.send("journalSave", { journalId: id, name, content, playerVisible, folderId: find()?.folderId || "" }));
    });
    entry.update = () => {
      const next = find();
      if (!next) return this.closeWindow("journal:" + id);
      entry.page.setProps({ entry: next, canEdit: this.gm });
      entry.frame.setProps({ title: next.name });
    };
  }

  configureToken(id) {
    const token = this.scene?.tokens.find((entry) => entry.id === id);
    if (!token) return;
    const cell = this.cell();
    const values = { name: token.name, image: token.image, size: Math.max(1, Math.round(token.width / cell)), disposition: token.disposition, hidden: token.hidden, lightRadius: Math.round((token.vision?.light?.radius || 0) / cell), lightColor: token.vision?.light?.color || "#ffe2b0", sight: token.vision?.sight !== false, range: Math.round((token.vision?.range || 0) / cell) };
    this.form("token:" + id, { title: token.name, subtitle: "Token", icon: "token", width: 380, height: 470 }, tokenFields(), values, {
      change: (field, value, all) => {
        const size = Math.max(1, Number(all.size) || 1) * cell;
        const changes = { name: String(all.name || "Token").slice(0, 120), image: all.image || "", width: size, height: size, disposition: all.disposition, hidden: !!all.hidden, vision: { sight: !!all.sight, range: Math.max(0, Number(all.range) || 0) * cell, light: Number(all.lightRadius) > 0 ? { radius: Number(all.lightRadius) * cell, color: all.lightColor } : null } };
        this.send("tokenUpdate", { tokenId: id, changes });
      },
    });
  }

  cell() {
    const map = this.editing && !this.isStage ? this.draft : this.scene?.map;
    const ground = (map?.layers || []).find((layer) => layer.type === "ground");
    return Number(ground?.grid?.size) || 100;
  }

  editMacro(index) {
    const macro = this.macros()[index] || { label: "", command: "" };
    this.form("macro:" + index, { title: "Quick slot " + ((index + 1) % 10), icon: "bolt", width: 360, height: 260, resizable: false }, [
      { id: "label", label: "Label", type: "text", placeholder: "Attack" },
      { id: "command", label: "Sends", type: "text", placeholder: "/r d20+5", hint: "Anything you can type in chat." },
    ], macro, {
      actions: [{ id: "save", label: "Save", kind: "primary" }],
      submit: "save",
      action: (id, values) => {
        this.saveMacro(index, values.command ? { id: "macro-" + index, label: values.label || values.command, command: values.command } : null);
        this.closeWindow("macro:" + index);
      },
    });
  }

  saveMacro(index, macro) {
    const macros = this.macros();
    macros[index] = macro;
    try {
      localStorage.setItem(this.storeKey("macros"), JSON.stringify(macros));
    } catch {}
    this.hotbar.setProps({ slots: macros });
  }

  speak() {
    const boxes = [];
    const walk = (elements) => {
      for (const element of elements || []) {
        if (element.kind === "dialogue") boxes.push(element);
        walk(element.children);
      }
    };
    walk(this.scene?.stage?.elements);
    if (!boxes.length) return this.toast("This stage has no dialogue box. Add one in edit mode.");
    const first = boxes[0];
    this.form("speak", { title: "Speak", icon: "speech", width: 400, height: 330 }, [
      { id: "box", label: "Dialogue box", type: "select", options: boxes.map((box) => ({ id: box.id, label: box.name || "Dialogue" })) },
      { id: "speaker", label: "Speaker", type: "text", placeholder: "Who is talking" },
      { id: "text", label: "Line", type: "textarea", rows: 4 },
    ], { box: first.id, speaker: first.speaker || "", text: "" }, {
      actions: [{ id: "say", label: "Say it", kind: "primary", icon: "send" }],
      action: (id, values) => this.send("stageSpeak", { sceneId: this.scene.id, elementId: values.box, text: values.text || "", speaker: values.speaker || "" }),
    });
  }

  tools() {
    const scene = this.scene;
    if (!scene) return [];
    if (this.isStage) {
      const tools = [];
      if (this.gm) tools.push({ id: "edit", label: this.editing ? "Finish editing" : "Edit stage", icon: this.editing ? "check" : "edit", toggle: true, on: this.editing, key: "e" });
      if (this.gm && !this.editing) tools.push({ id: "speak", label: "Speak a line", icon: "speech", action: true, key: "t" });
      if (this.editing) tools.push({ separator: true }, { id: "undo", label: "Undo", icon: "undo", action: true }, { id: "redo", label: "Redo", icon: "redo", action: true });
      return tools;
    }
    if (this.editing)
      return [
        { id: "select", label: "Select and move", icon: "pointer", key: "v" },
        { id: "wall", label: "Draw walls", icon: "wall", key: "w" },
        { id: "door", label: "Place a door", icon: "door", key: "d" },
        { id: "column", label: "Place a pillar", icon: "circle", key: "c" },
        { id: "light", label: "Place a light", icon: "light", key: "l" },
        { id: "draw", label: "Draw", icon: "pen", key: "b" },
        { separator: true },
        { id: "undo", label: "Undo", icon: "undo", action: true },
        { id: "redo", label: "Redo", icon: "redo", action: true },
        { separator: true },
        { id: "edit", label: "Finish editing", icon: "check", toggle: true, on: true, key: "e" },
      ];
    const tools = [
      { id: "select", label: "Select and move", icon: "pointer", key: "v" },
      { id: "ruler", label: "Measure", icon: "ruler", key: "r" },
      { id: "ping", label: "Ping", icon: "ping", key: "p" },
      { id: "draw", label: "Draw", icon: "pen", key: "b" },
    ];
    if (this.gm) tools.push({ separator: true }, { id: "clearDrawings", label: "Clear drawings", icon: "trash", action: true }, { id: "edit", label: "Edit map", icon: "edit", toggle: true, on: false, key: "e" });
    return tools;
  }

  render() {
    const state = this.state;
    const E = this.Easel;
    if (!state) return;
    const scene = state.activeScene;
    const gm = state.isGM;
    if (this.pendingEdit && scene?.id === this.pendingEdit) {
      this.pendingEdit = "";
      queueMicrotask(() => this.startEditing());
    }
    const stage = scene?.kind === "stage";
    const wanted = stage ? this.stage : this.map;
    const other = stage ? this.map : this.stage;
    if (wanted.parent !== this.frame) {
      try {
        other.detach();
      } catch {}
      wanted.attach(this.frame, "canvas");
    }
    const current = state.combat?.combatants.find((entry) => entry.id === state.combat.currentId);
    if (stage) {
      this.stage.setProps({ box: this.editing ? this.draft : scene.stage || {}, boxKey: scene.id, editing: this.editing, canRun: gm, selectedId: this.editing ? this.selection.id : "", insets: this.insets });
    } else {
      const defeated = new Set((state.combat?.combatants || []).filter((entry) => entry.defeated).map((entry) => entry.tokenId));
      this.map.setProps({
        map: scene ? (this.editing ? this.draft : scene.map) : {},
        sceneKey: scene?.id || "",
        groundId: this.groundId || "",
        layerId: this.layerId || "",
        tokens: (scene?.tokens || []).map((token) => ({ id: token.id, name: token.name, image: token.image, x: token.x, y: token.y, width: token.width, height: token.height, rotation: token.rotation, hidden: token.hidden, disposition: token.disposition, groundId: token.groundId, controllable: !!token.canControl, bars: token.bars || [], light: token.vision?.light || null, sightRange: token.vision?.range || 0, sight: token.vision?.sight !== false, current: current?.tokenId === token.id, defeated: defeated.has(token.id) })),
        selectedTokenIds: this.selectedTokens,
        gm,
        editing: this.editing,
        tool: this.tool,
        insets: this.insets,
        fitKey: scene?.id || "",
      });
    }
    this.nav.setProps({ scenes: state.scenes, viewing: scene?.id || "", gm });
    this.rail.setProps({ tools: this.tools(), active: this.tool });
    this.players.setProps({ players: (state.members || []).map((member) => ({ id: member.id, name: member.name, color: this.colorOf(member.id), gm: member.role === "administrator", role: member.role === "administrator" ? "GM" : member.role === "spectator" ? "Watching" : "" })) });
    const tabs = [
      { id: "chat", label: "Chat", icon: "chat", panel: this.chat.id, badge: this.unread ? String(Math.min(99, this.unread)) : "" },
      { id: "combat", label: "Encounter", icon: "swords", panel: this.tracker.id, badge: state.combat?.started ? String(state.combat.round) : "" },
      { id: "actors", label: "Characters", icon: "users", panel: this.actors.id },
      { id: "journal", label: "Journal", icon: "book", panel: this.journals.id },
    ];
    if (gm) tabs.push({ id: "scenes", label: "Scenes", icon: "map", panel: this.scenes.id });
    if (this.editing) tabs.push({ id: "edit", label: stage ? "Stage editor" : "Map editor", icon: "edit", panel: this.editHost.id });
    if (!tabs.some((tab) => tab.id === this.sideTab)) this.sideTab = "chat";
    this.side.setProps({ tabs, active: this.sideTab });
    this.frame.setProps({ sidebarOpen: this.sidebarOpen });
    this.chat.setProps({ messages: state.messages.map((message) => ({ ...message, card: this.cardOf(message) })), members: (state.members || []).map((member) => ({ ...member, color: this.colorOf(member.id) })), userId: state.userId, mode: this.chatMode, modes: gm ? ["public", "gm", "self"] : ["public", "gm", "blind", "self"] });
    this.tracker.setProps({ combat: state.combat || {}, gm });
    const actorItems = this.system.actors?.(this) || (state.actors || []).map((actor) => ({ id: actor.id, name: actor.name }));
    this.actors.setProps({ items: actorItems, folders: [], allowFolders: false, canCreate: this.system.canCreateActor ? this.system.canCreateActor(this) : true, canManage: gm, actions: [{ id: "open", label: "Open sheet", icon: "user" }, { separator: true }, { id: "delete", label: "Delete", icon: "trash", danger: true }] });
    this.journals.setProps({ items: state.journals.map((journal) => ({ id: journal.id, name: journal.name, folderId: journal.folderId, icon: "scroll", detail: (journal.content || "").replace(/[#*]/g, "").slice(0, 60), badges: gm && journal.playerVisible ? [{ label: "Shared", kind: "primary" }] : [] })), folders: state.folders.filter((folder) => folder.kind === "journal"), canCreate: gm, canManage: gm, actions: gm ? [{ id: "share", label: "Share or unshare with players", icon: "eye" }, { separator: true }, { id: "delete", label: "Delete", icon: "trash", danger: true }] : [] });
    this.scenes.setProps({ items: state.scenes.map((entry) => ({ id: entry.id, name: entry.name, icon: entry.kind === "stage" ? "theater" : "map", detail: entry.kind === "stage" ? "Stage" : "Battle map", badges: entry.active ? [{ label: "Players are here", kind: "primary" }] : [] })), selected: scene?.id || "", canCreate: gm, canManage: gm, allowFolders: false, actions: [{ id: "activate", label: "Show to players", icon: "play" }, { id: "edit", label: "Edit", icon: "edit" }, { id: "settings", label: "Rename", icon: "settings" }, { id: "duplicate", label: "Duplicate", icon: "copy" }, { separator: true }, { id: "delete", label: "Delete", icon: "trash", danger: true }] });
    this.renderEditor();
    for (const entry of this.windows.values()) entry.update?.();
    void E;
  }

  renderEditor() {
    const editor = this.editor();
    if (!editor) return;
    this.tree.setProps({ nodes: editor.nodes(), selected: this.selection.id || this.layerId || "", actions: editor.treeActions() });
    const form = editor.form();
    this.inspect.setProps({ fields: form.fields, values: form.values, emptyText: form.emptyText || "Select something to edit it." });
  }

  cardOf(message) {
    const card = message.card || {};
    if (!Object.keys(card).length) return {};
    if (this.system.card) return this.system.card(card, message, this) || {};
    const content = card.content || card;
    return { title: content.title, formula: content.formula, total: content.total, dice: (content.rolls || content.dice || []).map((die) => (typeof die === "object" ? die : { value: die })), text: content.text };
  }

  destroy() {
    clearTimeout(this.saveTimer);
    for (const off of this.offs) off?.();
    for (const key of [...this.windows.keys()]) this.closeWindow(key);
  }
}
