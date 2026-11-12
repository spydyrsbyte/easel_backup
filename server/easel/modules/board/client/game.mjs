export function mount(title) {
  const table = Easel.Components.create("easel.board.table@1", {
    id: "board",
    props: { title },
  });
  const refresh = () =>
    Application.events
      .emit("easel.board.refresh", {})
      .catch((error) => table.setProps({ error: error.message }));
  const request = (event, payload) => {
    table.setProps({ busy: true, error: "" });
    Application.events
      .emit(event, payload)
      .catch((error) => table.setProps({ error: error.message }))
      .finally(() => {
        table.setProps({ busy: false });
        refresh();
      });
  };
  table.on("seat", (payload) => request("easel.board.seat", payload));
  table.on("move", (payload) => request("easel.board.move", payload));
  table.on("refresh", refresh);
  table.on("reset", () => request("easel.board.reset", {}));
  Application.events.on("easel.board.state", (state) => table.setProps(state));
  Application.events.on("easel.board.error", ({ message }) =>
    table.setProps({ error: message.replace(/^.*check failed: /, "") }),
  );
  Application.events.on("easel.board.changed", refresh);
  Application.events.on("Users.Changed", refresh);
  Application.onReady(refresh);
  Easel.Components.mountRoot(table);
}
