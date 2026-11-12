import Binding from "./binding.mjs";

export default class DirectoryBinder extends Binding {
  bind(options) {
    this.configure(options);
    this.windows = new Set();
    this.collapsed = new Set();
    this.scenesSignature = undefined;
    this.journalsSignature = undefined;
    this.listen(this.scenes, "create", () => this.send("sceneCreate", { name: "New Scene" }));
    this.listen(this.scenes, "select", ({ id }) => {
      if (!this.state.isGM) return;
      if (id !== this.state.activeScene?.id) return this.send("sceneActivate", { sceneId: id });
      this.editScene();
    });
    this.listen(this.scenes, "delete", ({ id }) => this.send("sceneDelete", { sceneId: id }));
    this.listen(this.scenes, "duplicate", ({ id }) => this.send("sceneDuplicate", { sceneId: id }));
    this.listen(this.journals, "create", ({ folderId }) => this.editJournal({ name: "New Journal", content: "", playerVisible: false, folderId }));
    this.listen(this.journals, "select", ({ id }) => this.editJournal(this.state.journals.find((entry) => entry.id === id)));
    this.listen(this.journals, "delete", ({ id }) => this.send("journalDelete", { journalId: id }));
    this.listen(this.journals, "duplicate", ({ id }) => {
      const entry = this.state.journals.find((entry) => entry.id === id);
      if (entry) this.send("journalSave", { journalId: "", name: entry.name + " (Copy)", content: entry.content, playerVisible: entry.playerVisible, folderId: entry.folderId });
    });
    for (const directory of [this.scenes, this.journals]) this.listen(directory, "toggleFolder", ({ folderId, collapsed }) => {
      if (collapsed) this.collapsed.add(folderId);
      else this.collapsed.delete(folderId);
      this.update(this.state);
    });
    return this;
  }

  update(state) {
    this.state = state;
    const folders = (kind) => state.folders.filter((folder) => folder.kind === kind).map((folder) => ({ ...folder, collapsed: this.collapsed.has(folder.id) }));
    for (const [name, directory, props] of [
      ["scenes", this.scenes, { entries: state.scenes, activeId: state.activeScene?.id ?? "", folders: folders("scene"), canCreate: state.isGM, canManage: state.isGM }],
      ["journals", this.journals, { entries: state.journals, folders: folders("journal"), canCreate: state.isGM, canManage: state.isGM }],
    ]) {
      const signature = JSON.stringify(props);
      if (signature === this[name + "Signature"]) continue;
      this[name + "Signature"] = signature;
      directory.setProps(props);
    }
  }

  editor(title, values, fields, save, actions = [], editable = this.state.isGM) {
    const comps = Easel.Components;
    const win = comps.create("easel.layout.window@1", { props: { title, width: 560, height: 600, data: { x: 90, y: 90 } } });
    const form = comps.create("easel.layout.sheet@1", { props: { data: values, fields, editable } });
    const controls = comps.create("easel.layout.dialog@1", { props: { modal: false, actions: editable ? [{ id: "save", label: "Save" }, ...actions] : [] } });
    form.on("change", ({ value }) => { values[value.id] = value.value; });
    const close = () => { win.destroy(); this.windows.delete(win); };
    win.on("close", close);
    controls.on("close", close);
    controls.on("action", async ({ id }) => { await save(id, values); close(); });
    form.attach(controls, "body");
    controls.attach(win, "body");
    win.attach(this.workspace, "windows");
    this.windows.add(win);
    return { win, form, controls };
  }

  editScene() {
    const scene = this.state.activeScene;
    if (!scene) return;
    const map = structuredClone(scene.map);
    const ground = map.layers.find((layer) => layer.type === "ground");
    const values = { name: scene.name, width: map.size?.width ?? 2000, height: map.size?.height ?? 1400, cellSize: ground?.grid?.size ?? 64, image: ground?.image ?? "", fog: map.fogEnabled !== false, navigation: scene.navigation, folderId: scene.folderId };
    this.editor("Scene Settings", values, [
      { id: "name", label: "Scene name" },
      { id: "width", label: "Map width", type: "number" },
      { id: "height", label: "Map height", type: "number" },
      { id: "cellSize", label: "Grid size", type: "number" },
      { id: "image", label: "Background image URL" },
      { id: "fog", label: "Fog of war", type: "checkbox" },
      { id: "navigation", label: "Show in player navigation", type: "checkbox" },
    ], async (_, value) => {
      if (value.width <= 0 || value.height <= 0 || value.cellSize <= 0) return this.onError?.("Map dimensions and grid size must be positive.");
      map.size = { width: value.width, height: value.height };
      map.fogEnabled = value.fog;
      if (ground) { ground.grid = { ...ground.grid, size: value.cellSize, cellSize: value.cellSize }; ground.image = value.image; }
      await this.send("sceneUpdate", { sceneId: scene.id, name: value.name, navigation: value.navigation, folderId: value.folderId });
      await this.send("sceneSaveMap", { sceneId: scene.id, map });
    });
  }

  editJournal(entry) {
    if (!entry) return;
    const values = { name: entry.name, playerVisible: entry.playerVisible, folderId: entry.folderId || "" };
    let content = entry.content;
    const { form } = this.editor("Journal", values, [{ id: "name", label: "Journal name" }, { id: "playerVisible", label: "Visible to players", type: "checkbox" }], (_, value) => this.send("journalSave", { journalId: entry.id || "", ...value, content }));
    const text = Easel.Components.create("easel.narrative.richtext@1", { props: { text: content, editable: this.state.isGM } });
    text.on("change", ({ text }) => { content = text; });
    text.attach(form, "body");
  }

  editActor(actorId) {
    const actor = this.state.actors.find((entry) => entry.id === actorId);
    if (!actor) return this.onError?.("Select an actor you can read first.");
    const prototype = actor.defaultToken || {};
    const roles = actor.canWrite ? ["owner", "controller", "viewer"] : [];
    const values = { name: prototype.name || actor.name, image: prototype.image || "", width: prototype.width || 64, height: prototype.height || 64 };
    for (const role of roles) for (const member of this.state.members) values[role + ":" + member.id] = actor[role + "UserIds"].includes(member.id);
    const label = { owner: "Owner", controller: "Controller", viewer: "Viewer" };
    this.editor("Actor Access and Default Token", values, [
      ...roles.flatMap((role) => this.state.members.map((member) => ({ id: role + ":" + member.id, label: label[role] + " — " + member.name, type: "checkbox" }))),
      { id: "name", label: "Default token name", readOnly: !actor.canWrite },
      { id: "image", label: "Default token image URL", readOnly: !actor.canWrite },
      { id: "width", label: "Default token width", type: "number", readOnly: !actor.canWrite },
      { id: "height", label: "Default token height", type: "number", readOnly: !actor.canWrite },
    ], async (_, values) => {
      if (actor.canWrite) await this.send("actorDefaultToken", { actorId, settings: { name: values.name, image: values.image, width: values.width, height: values.height } });
      if (actor.canWrite) {
        const chosen = (role) => this.state.members.filter((member) => values[role + ":" + member.id] === true).map((member) => member.id);
        await this.send("actorPermissions", { actorId, ownerUserIds: chosen("owner"), viewerUserIds: chosen("viewer"), controllerUserIds: chosen("controller") });
      }
    }, [], actor.canWrite);
  }

  destroy() {
    super.destroy();
    for (const win of this.windows ?? []) win.destroy();
    this.windows?.clear();
  }
}
