const administrator = { field: "principal.attributes.role", equals: "administrator" };
const resource = "easel.pf1e.Entry";

for (const action of ["read", "create", "modify", "remove", "manage"]) Security.registerAction(resource, action);
Security.registerPolicy("pf1e.Entry.read", { resource, action: "read", allow: { always: true } });
for (const action of ["create", "modify", "remove", "manage"]) Security.registerPolicy("pf1e.Entry." + action, { resource, action, allow: administrator });
