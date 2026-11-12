const player = {
  any: [
    { field: "principal.attributes.role", equals: "administrator" },
    { field: "principal.attributes.role", equals: "player" },
  ],
};
const administrator = {
  field: "principal.attributes.role",
  equals: "administrator",
};
for (const action of ["read", "modify", "play", "manage"]) {
  Security.registerAction("easel.board.Match", action);
  Security.registerPolicy("board." + action, {
    resource: "easel.board.Match",
    action,
    allow:
      action === "read"
        ? { always: true }
        : action === "manage"
          ? administrator
          : player,
  });
}
for (const action of ["run", "read"]) {
  Security.registerAction("easel.easel.User", "automation." + action);
  Security.registerPolicy("board.automation." + action, {
    resource: "easel.easel.User",
    action: "automation." + action,
    allow: {
      all: [
        player,
        {
          any: [
            administrator,
            { not: { field: "context.operation.name", equals: "easel.board.Reset" } },
          ],
        },
      ],
    },
  });
}
