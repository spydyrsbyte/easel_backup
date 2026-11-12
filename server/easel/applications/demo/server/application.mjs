Application.events.register("easel.demo.roll", { valid: 2 });
Application.events.register("easel.demo.result", { valid: 1, value: "integer" });
Application.events.on("easel.demo.roll", () =>
  Application.events.emit("easel.demo.result", {
    value: Math.floor(Math.random() * 20) + 1,
  }),
);
