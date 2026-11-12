export function initialize() {
  const panel = Easel.Components.create("easel.easel.panel@1", {
    id: "table",
    props: { text: "Your table is ready." },
  });
  const button = Easel.Components.create("easel.easel.button@1", {
    id: "roll",
    host: "easel.table",
  });
  button.attach(panel, "content");
  button.on("pressed", () =>
    Application.events
      .emit("easel.demo.roll", {})
      .catch((error) => panel.setProps({ text: error.message })),
  );
  Application.events.on("easel.demo.result", (result) =>
    panel.setProps({ text: "You rolled " + result.value + "." }),
  );
  Easel.Components.mountRoot(panel);
}
