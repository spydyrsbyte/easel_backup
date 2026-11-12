export function initialize() {
  const table = Easel.Components.create("easel.mtg.table@1", { id: "magic" });
  const refresh = () =>
    Application.events
      .emit("easel.mtg.sync", {})
      .catch((error) => table.setProps({ error: error.message }));
  table.on("refresh", refresh);
  table.on("action", ({ request, payload }) => {
    table.setProps({ busy: true, error: "" });
    Application.events
      .emit("easel.mtg.action", { request, payload })
      .catch((error) =>
        table.setProps({
          response: {
            request,
            result: { declined: true, result: error.message },
          },
        }),
      )
      .finally(() => table.setProps({ busy: false }));
  });
  Application.events.on("easel.mtg.state", (state) => table.setProps(state));
  Application.events.on("easel.mtg.changed", refresh);
  Application.events.on("Users.Changed", refresh);
  Application.events.on("easel.mtg.result", ({ request, result }) => {
    table.setProps({ response: { request, result } });
  });
  Application.events.on("easel.mtg.inspect", (inspection) => {
    table.setProps({ inspection });
  });
  Application.onReady(refresh);
  Easel.Components.mountRoot(table);
}
