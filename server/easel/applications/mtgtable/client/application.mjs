export function initialize() {
  const table = Easel.Components.create("easel.mtgtable.table@1", {
    id: "mtgtable",
  });
  let cameraSerial = 0;
  const camera = Easel.Components.create("easel.surfaces.camera@1", {
    id: "mtgtable-camera",
  });
  const inspector = Easel.Components.create("easel.cards.inspector@1", {
    id: "mtgtable-inspector",
    props: { open: false },
  });
  camera.attach(table, "camera");
  inspector.attach(table, "inspection");
  const command = (type, value = {}) =>
    table.setProps({ cameraCommand: { id: ++cameraSerial, type, ...value } });
  camera.on("rotate", ({ degrees }) => command("rotate", { degrees }));
  camera.on("zoom", ({ factor }) => command("zoom", { factor }));
  camera.on("view", ({ seat }) => command("view", { seat }));
  inspector.on("close", () => command("closeInspection"));
  table.on("inspection", (props) => inspector.setProps(props));
  const refresh = () =>
    Application.events
      .emit("easel.mtgtable.sync", {})
      .catch((error) => table.setProps({ error: error.message }));
  table.on("refresh", refresh);
  table.on("action", ({ request, payload }) => {
    table.setProps({ busy: true, error: "" });
    Application.events
      .emit("easel.mtgtable.action", { request, payload })
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
  Application.events.on("easel.mtgtable.state", (state) => {
    table.setProps(state);
    camera.setProps({
      items: Object.entries(state.state.seats || {}).map(([id, seat]) => ({
        id,
        label: id + (seat.name ? " / " + seat.name : ""),
      })),
    });
  });
  Application.events.on("easel.mtgtable.changed", refresh);
  Application.events.on("Users.Changed", refresh);
  Application.events.on("easel.mtgtable.result", ({ request, result }) =>
    table.setProps({ response: { request, result } }),
  );
  Application.onReady(refresh);
  Easel.Components.mountRoot(table);
}
