const administrator = { field: "principal.attributes.role", equals: "administrator" };
const player = {
  any: [administrator, { field: "principal.attributes.role", equals: "player" }],
};
const member = {
  any: [...player.any, { field: "principal.attributes.role", equals: "spectator" }],
};
const self = {
  any: [administrator, { field: "principal.id", equalsField: "resource.attributes.userId" }],
};
const createSelf = {
  any: [administrator, { field: "principal.id", equalsField: "context.operation.record.userId" }],
};

const policies = {
  Actor: { create: player, modify: player, delete: player },
  Scene: { create: administrator, modify: administrator, delete: administrator },
  DoorState: { create: member, modify: member, delete: administrator },
  Token: { create: player, modify: player, delete: player },
  Combat: { create: administrator, modify: administrator, delete: administrator },
  Combatant: { create: administrator, modify: player, delete: administrator },
  ChatMessage: { create: { all: [member, createSelf] }, modify: administrator, delete: administrator },
  JournalEntry: { create: administrator, modify: administrator, delete: administrator },
  Folder: { create: administrator, modify: administrator, delete: administrator },
  DiceSettings: { create: { all: [member, createSelf] }, modify: self, delete: self },
};

for (const [type, rules] of Object.entries(policies)) {
  const resource = "easel.vtt." + type;
  for (const action of ["read", "create", "modify", "delete", "manage"]) {
    Security.registerAction(resource, action);
  }
  Security.registerPolicy("vtt." + type + ".read", { resource, action: "read", allow: { always: true } });
  Security.registerPolicy("vtt." + type + ".manage", { resource, action: "manage", allow: administrator });
  for (const [action, allow] of Object.entries(rules)) {
    Security.registerPolicy("vtt." + type + "." + action, { resource, action, allow });
  }
}
