export async function initialize({ Easel, Application }) {
  const table = Easel.Interfaces.create("easel.vtt.tabletop@1");
  let data = { actors: [], layout: {} };
  let rollMode = "public";
  const send = (name, payload = {}) => Application.events.emit("easel.tabletop." + name, payload).catch((error) => table.toast(error.message, "error"));
  const find = (id) => data.actors.find((actor) => actor.id === id);
  await table.mount({
    Easel,
    Application,
    system: {
      quickDice: ["d4", "d6", "d8", "d10", "d12", "d20", "d100"],
      rollMode: (mode) => {
        rollMode = mode;
      },
      actors: (view) =>
        data.actors.map((actor) => ({
          id: actor.id,
          name: actor.name,
          image: actor.portrait,
          detail: actor.summary || (actor.canWrite ? "" : "Shared with you"),
          badges: view.gm && !actor.ownerUserIds.length ? [{ label: "Unassigned" }] : [],
        })),
      canCreateActor: () => true,
      actorActions: (view) => (view.gm ? [{ id: "assign", label: "Give to a player", icon: "users" }] : []),
      actorAction: (id, action, view) => {
        if (action !== "assign") return;
        const players = (view.state.members || []).filter((member) => member.role !== "administrator");
        view.choose("Who plays " + (find(id)?.name || "this character") + "?", [...players.map((member) => ({ id: member.id, label: member.name, icon: "user" })), { id: "none", label: "No one", icon: "close" }]).then((choice) => {
          if (choice) send("actorUpdate", { actorId: id, changes: { ownerUserIds: choice === "none" ? [] : [choice] } });
        });
      },
      createActor: () => table.prompt("Name the character", "New character").then((name) => name && send("actorCreate", { name })),
      deleteActor: (id) => send("actorDelete", { actorId: id }),
      sheet: (id) => {
        const actor = find(id);
        if (!actor) return null;
        return { actor: { id: actor.id, name: actor.name, image: actor.portrait }, layout: data.layout, values: { ...actor.sheet, "@summary": actor.summary }, readOnly: !actor.canWrite };
      },
      sheetEvent: (id, name, payload) => {
        if (name === "change") {
          if (payload.path === "@summary") send("actorUpdate", { actorId: id, changes: { summary: String(payload.value.value ?? "") } });
          else send("actorUpdate", { actorId: id, changes: { sheet: { path: payload.path, value: payload.value.value } } });
        } else if (name === "rename") send("actorUpdate", { actorId: id, changes: { name: payload.name } });
        else if (name === "listAdd") send("actorUpdate", { actorId: id, changes: { listAdd: { id: payload.id } } });
        else if (name === "listRemove") send("actorUpdate", { actorId: id, changes: { listRemove: { id: payload.id, index: payload.index } } });
        else if (name === "roll") send("actorRoll", { actorId: id, label: payload.label, modifier: payload.modifier, rollMode });
        else if (name === "image")
          Application.files
            .upload(payload.file.file)
            .then((stored) => send("actorUpdate", { actorId: id, changes: { portrait: stored.url } }))
            .catch((error) => table.toast(error.message, "error"));
      },
    },
  });
  Application.events.on("easel.tabletop.state", (state) => {
    data = state;
    table.render();
  });
  Application.events.on("easel.tabletop.error", ({ message }) => table.toast(message, "error"));
  Application.events.on("easel.tabletop.changed", () => send("refresh"));
  Application.onReady(() => send("refresh"));
}
