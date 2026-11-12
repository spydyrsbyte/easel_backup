const player = {
  any: [
    { field: "principal.attributes.role", equals: "administrator" },
    { field: "principal.attributes.role", equals: "player" },
  ],
};
const admin = { field: "principal.attributes.role", equals: "administrator" };
for (const action of ["read", "modify", "play", "manage"]) {
  Security.registerAction("easel.mtg.Session", action);
  Security.registerPolicy("mtg." + action, {
    resource: "easel.mtg.Session",
    action,
    allow:
      action === "read"
        ? { always: true }
        : action === "manage"
          ? admin
          : player,
  });
}
for (const action of ["run", "read"]) {
  Security.registerAction("easel.easel.User", "automation." + action);
  Security.registerPolicy("mtg.automation." + action, {
    resource: "easel.easel.User",
    action: "automation." + action,
    allow: player,
  });
}
