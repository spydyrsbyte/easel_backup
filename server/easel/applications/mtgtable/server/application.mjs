let tableID;
const clone = (value) => JSON.parse(JSON.stringify(value));
Application.events.register("easel.mtgtable.sync", { valid: 2 });
Application.events.register("easel.mtgtable.action", {
  valid: 2,
  request: "string",
  payload: "field",
});
Application.events.register("easel.mtgtable.state", {
  valid: 1,
  state: "field",
  user: "string",
  revision: "integer",
  manage: "boolean",
});
Application.events.register("easel.mtgtable.result", {
  valid: 1,
  request: "string",
  result: "field",
});
Application.events.register("easel.mtgtable.changed", { valid: 4, revision: "integer" });
const members = () => Application.users.list();
const role = (actor) => members().find((member) => member.id === actor)?.role;
const rules = Easel.Interfaces.create("easel.mtgtable.rules@1").create({
  load: () => clone(new easel.mtgtable.Table(tableID).state),
  persist: (state) => {
    const record = new easel.mtgtable.Table(tableID);
    Application.automations.run("easel.mtgtable.Commit", [
      tableID,
      record.revision,
      state,
    ]);
  },
  random: (min, max) => min + Math.floor(Math.random() * (max - min)),
  name: (actor) =>
    members().find((member) => member.id === actor)?.displayName || "Player",
  can: (permission, actor) => {
    const assigned = role(actor);
    if (permission === "manage") return assigned === "administrator";
    return assigned === "administrator" || assigned === "player";
  },
});
Server.events.on("Load.Data.Ready", () => {
  const ids = easel.mtgtable.Table.ids();
  if (ids.length) {
    tableID = ids[0];
    return;
  }
  const record = new easel.mtgtable.Table();
  record.state = rules.fresh();
  record.save();
  tableID = record.id;
});
Server.events.on("Load.Automation.Ready", () =>
  Application.automations.define({
    name: "easel.mtgtable.Commit",
    parameters: ["table", "revision", "next"],
    steps: [
      { op: "load", type: "easel.mtgtable.Table", id: { arg: "table" }, as: "record" },
      {
        op: "check",
        condition: {
          expr: "equals",
          args: [{ path: ["record", "revision"] }, { arg: "revision" }],
        },
        message: "The table changed. Refresh and try again.",
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
        name: "easel.mtgtable.changed",
        value: { revision: { path: ["record", "revision"] } },
      },
    ],
  }),
);
Application.events.on("easel.mtgtable.sync", (_, connection) => {
  const record = new easel.mtgtable.Table(tableID);
  connection.send("easel.mtgtable.state", {
    state: rules.snapshot(clone(record.state), connection.user.id),
    user: connection.user.id,
    revision: record.revision,
    manage: role(connection.user.id) === "administrator",
  });
});
Application.events.on("easel.mtgtable.action", ({ request, payload }, connection) => {
  Application.security.require({
    resource: tableID,
    action: payload?.action === "chat" ? "read" : "play",
  });
  let result;
  try {
    result = rules.play(connection.user.id, payload);
  } catch (error) {
    if (!error.declined) throw error;
    result = { declined: true, result: error.message };
  }
  connection.send("easel.mtgtable.result", { request, result });
});
