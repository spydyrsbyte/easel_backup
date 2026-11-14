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
  Actor: { create: player, modify: player, remove: player },
  Scene: { create: administrator, modify: administrator, remove: administrator },
  DoorState: { create: member, modify: member, remove: administrator },
  Token: { create: player, modify: player, remove: player },
  Combat: { create: administrator, modify: administrator, remove: administrator },
  Combatant: { create: administrator, modify: player, remove: administrator },
  ChatMessage: { create: { all: [member, createSelf] }, modify: administrator, remove: administrator },
  JournalEntry: { create: administrator, modify: administrator, remove: administrator },
  Folder: { create: administrator, modify: administrator, remove: administrator },
  DiceSettings: { create: { all: [member, createSelf] }, modify: self, remove: self },
};

for (const [type, rules] of Object.entries(policies)) {
  const resource = "easel.vtt." + type;
  for (const action of ["read", "create", "modify", "remove", "manage"]) {
    Security.registerAction(resource, action);
  }
  Security.registerPolicy("vtt." + type + ".read", { resource, action: "read", allow: { always: true } });
  Security.registerPolicy("vtt." + type + ".manage", { resource, action: "manage", allow: administrator });
  for (const [action, allow] of Object.entries(rules)) {
    Security.registerPolicy("vtt." + type + "." + action, { resource, action, allow });
  }
}
