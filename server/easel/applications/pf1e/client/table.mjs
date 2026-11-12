export function bindTable(controller) {
  const comps = Easel.Components;
  const send = (name, payload) => Application.events.emit("easel.vtt." + name, payload).catch((error) => controller.showError(error.message));
  const onError = (message) => controller.showError(message);
  const scenes = comps.create("easel.collections.directory@1", { props: { entries: [], canCreate: false, canManage: false, createLabel: "+ New Scene" } });
  const journals = comps.create("easel.collections.directory@1", { props: { entries: [], canCreate: false, canManage: false, createLabel: "+ New Journal" } });
  const tabs = controller.sidebarTabs;
  tabs.setProps({ items: [...tabs.props.items, { id: "scenes", label: "Scenes" }, { id: "journals", label: "Journals" }] });
  scenes.attach(tabs, "tab5");
  journals.attach(tabs, "tab6");
  const scene = Easel.Interfaces.create("easel.vtt.scenebinder@1").bind({
    map: controller.map, toolstrip: controller.toolstrip, send, onError,
    resolveActor: (id) => {
      const entry = controller.entries.find((entry) => entry.id === id);
      return entry ? { id, name: entry.name, type: "easel.pf1e." + entry.actor.type } : null;
    },
  });
  const combat = Easel.Interfaces.create("easel.vtt.combatbinder@1").bind({ tracker: controller.tracker, send, onError, selectedToken: () => scene.selectedToken() });
  const chat = Easel.Interfaces.create("easel.vtt.chatbinder@1").bind({
    chatlog: controller.chatlog, dicebox: controller.dicebox, dicesettings: controller.dicesettings, send,
    onRollMode: (rollMode) => { controller.rollMode = rollMode; },
    onCardAction: ({ actionId, payload }) => {
      if (actionId !== "applyDamage") return;
      const token = scene.selectedToken();
      if (!token?.actorId) return onError("Select the target token on the map first.");
      controller.request("applyDamage", { actorId: token.actorId, amount: Number(payload.amount || 0), multiplier: Number(payload.multiplier ?? 1), isNonlethal: Boolean(payload.isNonlethal) });
    },
  });
  const directories = Easel.Interfaces.create("easel.vtt.directorybinder@1").bind({ scenes, journals, workspace: controller.workspace, send, onError });
  let selectedActorId = "";
  controller.directory.on("select", ({ id }) => { selectedActorId = id; });
  const actorControls = comps.create("easel.layout.dialog@1", { props: { modal: false, actions: [{ id: "actor", label: "Actor Access and Default Token" }] } });
  actorControls.on("action", async () => { await send("refresh", {}); directories.editActor(selectedActorId); });
  actorControls.attach(controller.directory, "header");
  controller.onLegacyMessages = (messages) => chat.setLegacy(messages);
  Application.events.on("easel.vtt.state", ({ state }) => {
    controller.workspace.setProps({ gmMode: state.isGM });
    scene.update(state);
    combat.update(state);
    chat.update(state);
    directories.update(state);
  });
  Application.events.on("easel.vtt.error", ({ message }) => onError(message));
  Application.events.on("easel.vtt.changed", () => send("refresh", {}));
  Application.events.on("Users.Changed", () => send("refresh", {}));
  Application.onReady(() => send("refresh", {}));
  return { scene, combat, chat, directories };
}
