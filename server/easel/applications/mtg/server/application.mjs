let sessionID;
let currentConnection;
const clone = (value) => JSON.parse(JSON.stringify(value));
Application.events.register("easel.mtg.sync", { valid: 2 });
Application.events.register("easel.mtg.action", {
  valid: 2,
  request: "string",
  payload: "field",
});
Application.events.register("easel.mtg.state", {
  valid: 1,
  state: "field",
  user: "string",
  revision: "integer",
});
Application.events.register("easel.mtg.result", {
  valid: 1,
  request: "string",
  result: "field",
});
Application.events.register("easel.mtg.inspect", {
  valid: 1,
  zone: "string",
  cards: "array",
});
Application.events.register("easel.mtg.changed", { valid: 4, revision: "integer" });
Application.events.register("easel.mtg.expire", { valid: 1, id: "string" });
const members = () => Application.users.list();
const role = (actor) => members().find((member) => member.id === actor)?.role;
const rules = Easel.Interfaces.create("easel.mtg.rules@1").create({
  load: () => clone(new easel.mtg.Session(sessionID).state),
  persist: (state) => {
    const record = new easel.mtg.Session(sessionID);
    Application.automations.run("easel.mtg.Commit", [
      sessionID,
      record.revision,
      state,
    ]);
  },
  random: (min, max) => min + Math.floor(Math.random() * (max - min)),
  name: (actor) =>
    members().find((member) => member.id === actor)?.displayName || "Player",
  can: (permission, actor) => {
    const assigned = role(actor);
    if (!assigned || assigned === "spectator") return false;
    return (
      permission === "easel.board.mtg-play" ||
      permission === "easel.board.mtg-take-control" ||
      assigned === "administrator"
    );
  },
  preferences: ({ accountid } = {}) => ({
    autoUntap: true,
    autoDraw: true,
    autoMana: true,
    ...(clone(new easel.mtg.Session(sessionID).state).preferences?.[accountid] || {}),
  }),
  notify: (actor, name, payload) => {
    if (currentConnection?.user.id === actor)
      currentConnection.send(name, payload);
  },
  schedule: (id, delay) => Server.events.after("easel.mtg.expire", delay, { id }),
  cancel: (id) => Server.events.cancel(id),
});
Server.events.on("Load.Data.Ready", () => {
  const ids = easel.mtg.Session.ids();
  if (ids.length) {
    sessionID = ids[0];
    return;
  }
  const record = new easel.mtg.Session();
  record.state = rules.fresh();
  record.save();
  sessionID = record.id;
});
Server.events.on("Load.Automation.Ready", () =>
  Application.automations.define({
    name: "easel.mtg.Commit",
    parameters: ["session", "revision", "next"],
    steps: [
      { op: "load", type: "easel.mtg.Session", id: { arg: "session" }, as: "record" },
      {
        op: "check",
        condition: {
          expr: "equals",
          args: [{ path: ["record", "revision"] }, { arg: "revision" }],
        },
        message: "The game changed. Refresh and try again.",
      },
      {
        op: "set",
        target: { path: ["record", "state"] },
        value: { arg: "next" },
      },
      { op: "delta", target: { path: ["record", "revision"] }, value: 1 },
      { op: "save", record: "record" },
      {
        op: "emit",
        name: "easel.mtg.changed",
        value: { revision: { path: ["record", "revision"] } },
      },
    ],
  }),
);
Server.events.on("Load.Finish", () =>
  rules.armStack(clone(new easel.mtg.Session(sessionID).state)),
);
Application.events.on("easel.mtg.expire", ({ id }) => rules.expireStack(id));
Application.events.on("easel.mtg.sync", (_, connection) => {
  const record = new easel.mtg.Session(sessionID);
  const state = clone(record.state);
  connection.send("easel.mtg.state", {
    state: {
      ...rules.snapshot(state, connection.user.id),
      chat: state.chat || [],
    },
    user: connection.user.id,
    revision: record.revision,
  });
});
Application.events.on("easel.mtg.action", ({ request, payload }, connection) => {
  Application.security.require({ resource: sessionID, action: "play" });
  currentConnection = connection;
  try {
    if (payload.action === "chat") {
      if (
        typeof payload.message !== "string" ||
        !payload.message.trim() ||
        payload.message.length > 2000
      )
        throw new Error("A message must contain 1..2000 characters.");
      const record = new easel.mtg.Session(sessionID),
        state = clone(record.state);
      state.chat = [
        ...(state.chat || []),
        {
          name: connection.user.displayName,
          message: payload.message.trim(),
          time: new Date().toISOString(),
        },
      ].slice(-100);
      Application.automations.run("easel.mtg.Commit", [
        sessionID,
        record.revision,
        state,
      ]);
      connection.send("easel.mtg.result", { request, result: { ok: true } });
      return;
    }
    const result = rules.play({ accountid: connection.user.id }, payload);
    connection.send("easel.mtg.result", { request, result: result || { ok: true } });
  } finally {
    currentConnection = null;
  }
});
