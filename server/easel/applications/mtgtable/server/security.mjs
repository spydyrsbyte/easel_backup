const player = {
  any: [
    { field: "principal.attributes.role", equals: "administrator" },
    { field: "principal.attributes.role", equals: "player" },
  ],
};
const admin = { field: "principal.attributes.role", equals: "administrator" };
const member = {
  any: [...player.any, { field: "principal.attributes.role", equals: "spectator" }],
};
for (const action of ["read", "modify", "play", "manage"]) {
  Security.registerAction("easel.mtgtable.Table", action);
  Security.registerPolicy("mtgtable." + action, {
    resource: "easel.mtgtable.Table",
    action,
    allow:
      action === "read"
        ? { always: true }
        : action === "manage"
          ? admin
          : action === "modify"
            ? member
            : player,
  });
}
for (const action of ["run", "read"]) {
  Security.registerAction("easel.easel.User", "automation." + action);
  Security.registerPolicy("mtgtable.automation." + action, {
    resource: "easel.easel.User",
    action: "automation." + action,
    allow: member,
  });
}
