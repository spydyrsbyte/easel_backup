Server.auth.on("signIn", (signIn) => signIn.allow());
Server.auth.on("signUp", (signUp) => signUp.allow());

if (Server.games.list().length === 0)
  Server.games.create({
    name: "Demo table",
    application: "easel.demo.table",
    modules: ["easel.easel.ui", "easel.table.style"],
    access: "open",
  });
Server.games.startAutomatic();

Application.events.register("lobby.refresh", { valid: 2 });
Application.events.register("lobby.join", { valid: 2, game: "string" });
Application.events.register("lobby.start", { valid: 2, game: "string" });
Application.events.register("lobby.stop", { valid: 2, game: "string" });
Application.events.register("lobby.suspend", { valid: 2, game: "string" });
Application.events.register("lobby.delete", { valid: 2, game: "string" });
Application.events.register("lobby.create", {
  valid: 2,
  name: "string",
  application: "string",
  modules: "array",
  access: "string",
});
Application.events.register("lobby.changed", { valid: 1 });
Application.events.register("lobby.error", { valid: 1, message: "string" });
Application.events.register("lobby.state", {
  valid: 1,
  user: "field",
  admin: "boolean",
  games: "array",
  applications: "array",
  modules: "array",
  users: "array",
  memberships: "field",
  manageable: "array",
});

const isAdmin = (connection) => Server.users.get(connection.user.id).admin;
const manages = (connection, game) =>
  isAdmin(connection) ||
  Server.games
    .roles(game)
    .some(
      (member) =>
        member.id === connection.user.id && member.role === "administrator",
    );

const sendState = (connection) => {
  const admin = isAdmin(connection);
  const installed = Server.games.installed();
  const games = Server.games.list();
  const memberships = {};
  const manageable = [];
  for (const game of games) {
    if (!manages(connection, game.id)) continue;
    manageable.push(game.id);
    memberships[game.id] = Server.games.roles(game.id);
  }
  connection.send("lobby.state", {
    user: connection.user,
    admin,
    games,
    applications: admin ? installed.applications : [],
    modules: admin
      ? installed.modules.filter((id) => id !== "easel.easel.shell")
      : [],
    users: manageable.length || admin ? Server.users.list() : [],
    memberships,
    manageable,
  });
};

const attempt = (connection, work) => {
  try {
    work();
  } catch (error) {
    connection.send("lobby.error", { message: error.message || String(error) });
  }
};

const administer = (connection, work) =>
  attempt(connection, () => {
    if (!isAdmin(connection))
      throw new Error("Only administrators can do that.");
    work();
    Application.events.emit("lobby.changed", {});
  });

Server.connections.on("signedIn", (connection) => {
  if (Server.users.admins().length === 0)
    Server.users.setAdmin(connection.user.id, true);
});
Server.connections.on("ready", sendState);

Application.events.on("lobby.refresh", (_, connection) =>
  sendState(connection),
);
Application.events.on("lobby.join", ({ game }, connection) =>
  attempt(connection, () => connection.join(game)),
);
Application.events.on("lobby.start", ({ game }, connection) =>
  administer(connection, () => Server.games.start(game)),
);
Application.events.on("lobby.stop", ({ game }, connection) =>
  administer(connection, () => Server.games.stop(game)),
);
Application.events.on("lobby.suspend", ({ game }, connection) =>
  administer(connection, () => Server.games.suspend(game)),
);
Application.events.on("lobby.delete", ({ game }, connection) =>
  administer(connection, () => Server.games.delete(game)),
);
Application.events.on("lobby.create", (settings, connection) =>
  administer(connection, () => {
    const game = Server.games.create(settings);
    Server.games.start(game.id);
  }),
);

Application.events.register("lobby.add", {
  valid: 2,
  game: "string",
  user: "string",
});
Application.events.register("lobby.remove", {
  valid: 2,
  game: "string",
  user: "string",
});
Application.events.register("lobby.role", {
  valid: 2,
  game: "string",
  user: "string",
  role: "string",
});
Application.events.register("lobby.access", {
  valid: 2,
  game: "string",
  access: "string",
});
Application.events.register("lobby.admin", {
  valid: 2,
  user: "string",
  admin: "boolean",
});
const manage = (connection, game, work) =>
  attempt(connection, () => {
    if (!manages(connection, game))
      throw new Error("Only game administrators can manage this game.");
    work();
    Application.events.emit("lobby.changed", {});
  });
Application.events.on("lobby.add", ({ game, user }, connection) =>
  manage(connection, game, () => Server.games.addMember(game, user)),
);
Application.events.on("lobby.remove", ({ game, user }, connection) =>
  manage(connection, game, () => {
    if (user === connection.user.id)
      throw new Error("You cannot remove yourself from game management.");
    Server.games.remove(game, user);
  }),
);
Application.events.on("lobby.role", ({ game, user, role }, connection) =>
  manage(connection, game, () => {
    if (user === connection.user.id && role !== "administrator")
      throw new Error(
        "Ask another administrator to change your own game role.",
      );
    Server.games.setRole(game, user, role);
  }),
);
Application.events.on("lobby.access", ({ game, access }, connection) =>
  manage(connection, game, () => Server.games.setAccess(game, access)),
);
Application.events.on("lobby.admin", ({ user, admin }, connection) =>
  administer(connection, () => {
    if (
      !admin &&
      Server.users.admins().length === 1 &&
      Server.users.get(user).admin
    )
      throw new Error("Keep at least one installation administrator.");
    Server.users.setAdmin(user, admin);
  }),
);
