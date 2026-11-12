export function initialize() {
  const shell = Easel.Components.get("shell");
  const lobby = Easel.Components.create("easel.easel.lobby@1", {
    id: "lobby",
    properties: { view: shell?.properties.view || "tables" },
  });
  const request = (name, payload) => {
    lobby.setProperties({ busy: true, error: "", notice: "" });
    Application.events
      .emit(name, payload)
      .then(() => {
        if (name === "lobby.create" && !lobby.properties.error) {
          lobby.setProperties({ view: "tables" });
          shell?.setProperties({ view: "tables" });
          Easel.Components.get("header")?.setProperties({ title: "My Games" });
        }
        if (name === "lobby.add" && !lobby.properties.error)
          lobby.setProperties({ notice: "Member added." });
      })
      .catch((error) => lobby.setProperties({ error: error.message }))
      .finally(() => lobby.setProperties({ busy: false }));
  };
  lobby.on("join", ({ game }) => request("lobby.join", { game }));
  lobby.on("start", ({ game }) => request("lobby.start", { game }));
  lobby.on("stop", ({ game }) => request("lobby.stop", { game }));
  lobby.on("delete", ({ game }) => request("lobby.delete", { game }));
  lobby.on("create", (settings) => request("lobby.create", settings));
  lobby.on("refresh", () => request("lobby.refresh", {}));
  lobby.on("navigate", ({ view }) => {
    lobby.setProperties({ view });
    shell?.setProperties({ view });
    Easel.Components.get("header")?.setProperties({
      title:
        view === "applications"
          ? "Applications"
          : view === "settings"
            ? "Settings"
            : "My Games",
    });
  });
  for (const action of ["add", "remove", "role", "access", "admin"])
    lobby.on(action, (payload) => request("lobby." + action, payload));
  Application.events.on("lobby.state", (state) => {
    shell?.setProperties({
      user: state.user.displayName,
      admin: state.admin,
      games: state.games,
    });
    Easel.Components.get("header")?.setProperties({
      user: state.user.displayName,
      admin: state.admin,
    });
    lobby.setProperties({
      user: state.user.displayName,
      admin: state.admin,
      games: state.games,
      applications: state.applications,
      modules: state.modules,
      users: state.users,
      memberships: state.memberships,
      manageable: state.manageable,
    });
  });
  Application.events.on("lobby.error", ({ message }) =>
    lobby.setProperties({ error: message }),
  );
  Application.events.on("lobby.changed", () =>
    Application.events
      .emit("lobby.refresh", {})
      .catch((error) => lobby.setProperties({ error: error.message })),
  );
  Easel.Components.mountRoot(lobby);
  Application.onReady(() => {
    const game = sessionStorage.getItem("easel.easel.activeGame");
    if (game) {
      sessionStorage.removeItem("easel.easel.activeGame");
      request("lobby.join", { game });
    }
  });
}
