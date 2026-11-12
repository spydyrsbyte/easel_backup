import { definitions } from "./automations.mjs";

const actorTypes = new Set([
  "easel.pf1e.Actor",
  "easel.pf1e.Character",
  "easel.pf1e.NPC",
  "easel.pf1e.Vehicle",
  "easel.pf1e.Trap",
  "easel.pf1e.Haunt",
]);

const childTypes = new Set([
  "easel.pf1e.ClassLevel",
  "easel.pf1e.Feature",
  "easel.pf1e.Feat",
  "easel.pf1e.ClassFeature",
  "easel.pf1e.Trait",
  "easel.pf1e.RacialTrait",
  "easel.pf1e.Spellbook",
  "easel.pf1e.Spell",
  "easel.pf1e.Buff",
  "easel.pf1e.Action",
  "easel.pf1e.Item",
  "easel.pf1e.Weapon",
  "easel.pf1e.Armor",
  "easel.pf1e.Shield",
  "easel.pf1e.WondrousItem",
  "easel.pf1e.Consumable",
  "easel.pf1e.Container",
  "easel.pf1e.Loot",
  "easel.pf1e.Implant",
]);

const recordTypes = [
  ...actorTypes,
  "easel.pf1e.ChatMessage",
  "easel.pf1e.Race",
  "easel.pf1e.Class",
  ...childTypes,
];

const administrator = {
  field: "principal.attributes.role",
  equals: "administrator",
};

const player = {
  any: [
    administrator,
    { field: "principal.attributes.role", equals: "player" },
  ],
};


if (typeof Security !== "undefined") {
  for (const action of ["run", "read"]) {
    Security.registerAction("easel.easel.User", "automation." + action);
    Security.registerPolicy("pf1e.automation." + action, {
      resource: "easel.easel.User",
      action: "automation." + action,
      allow: {
        all: [player, { any: definitions().map((definition) => ({ field: "context.operation.name", equals: definition.name })) }],
      },
    });
  }

  for (const resource of recordTypes) {
    for (const action of ["read", "modify", "create", "delete", "manage"]) {
      Security.registerAction(resource, action);
    }
    if (actorTypes.has(resource)) continue;

    const shortType = resource.split(".").pop();

    Security.registerPolicy("pf1e." + shortType + ".manage", {
      resource,
      action: "manage",
      allow: administrator,
    });

    Security.registerPolicy("pf1e." + shortType + ".delete", {
      resource,
      action: "delete",
      allow: childTypes.has(resource) ? player : administrator,
    });

    Security.registerPolicy("pf1e." + shortType + ".create", {
      resource,
      action: "create",
      allow: player,
    });

    Security.registerPolicy("pf1e." + shortType + ".modify", {
      resource,
      action: "modify",
      allow: childTypes.has(resource) ? player : administrator,
    });

    Security.registerPolicy("pf1e." + shortType + ".read", {
      resource,
      action: "read",
      allow: { always: true },
    });
  }
}

export function isAdministrator(viewer, options = {}) {
  if (options.isGM === true || options.isAdministrator === true) return true;
  if (options.role === "administrator" || options.role === "gm") return true;
  if (!viewer) return false;
  if (typeof viewer === "string") {
    return viewer === "administrator" || viewer === "gm";
  }
  if (typeof viewer === "object") {
    if (viewer.isGM === true || viewer.isAdministrator === true) return true;
    if (viewer.role === "administrator" || viewer.role === "gm") return true;
    if (viewer.attributes?.role === "administrator" || viewer.attributes?.role === "gm") return true;
    if (viewer.attributes?.bootstrapAdministrator === true || viewer.bootstrapAdministrator === true) return true;
  }
  return false;
}

export function projectItem(item, viewer, options = {}) {
  if (!item || typeof item !== "object") return item;
  const gm = isAdministrator(viewer, options);
  const out = JSON.parse(JSON.stringify(item));
  if (gm) {
    return out;
  }
  if (out.notes && typeof out.notes === "object") {
    delete out.notes.gmNotes;
  }
  delete out.gmNotes;
  if (out.identified === false) {
    out.name = out.unidentifiedName || "Unidentified Item";
    out.description = out.unidentifiedDescription || "";
    out.priceGp = out.unidentifiedPriceGp ?? 0;
    delete out.cursed;
    delete out.curseDescription;
    delete out.auraSchool;
    delete out.cl;
    delete out.identifyDC;
    if (Array.isArray(out.modifiers)) {
      out.modifiers = out.modifiers.filter(
        (m) => m && m.hidden !== true && m.secret !== true,
      );
    }
  }
  if (Array.isArray(out.items)) {
    out.items = out.items.map((child) => projectItem(child, viewer, options));
  }
  if (Array.isArray(out.contents)) {
    out.contents = out.contents.map((child) => projectItem(child, viewer, options));
  }
  return out;
}

export function projectActor(actor, viewer, options = {}) {
  if (!actor || typeof actor !== "object") return actor;
  const gm = isAdministrator(viewer, options);
  const out = JSON.parse(JSON.stringify(actor));
  if (gm) {
    return out;
  }
  if (out.notes && typeof out.notes === "object") {
    delete out.notes.gmNotes;
  }
  delete out.gmNotes;
  const viewerId =
    typeof viewer === "string"
      ? viewer
      : viewer?.id ?? viewer?.userId ?? options.userId ?? null;
  const listed = (key) => Boolean(viewerId && Array.isArray(out[key]) && out[key].includes(viewerId));
  const isOwner = Boolean(options.isOwner === true || listed("ownerUserIds"));
  const isObserver = Boolean(options.isObserver === true || listed("viewerUserIds") || listed("controllerUserIds"));
  if (!isOwner) {
    delete out.ownerUserIds;
    delete out.viewerUserIds;
    delete out.controllerUserIds;
  }
  if (isOwner || isObserver) {
    if (Array.isArray(out.items)) {
      out.items = out.items.map((child) => projectItem(child, viewer, options));
    }
    if (Array.isArray(out.inventory)) {
      out.inventory = out.inventory.map((child) => projectItem(child, viewer, options));
    }
    return out;
  }
  if (out.sheetMode === "loot") {
    const lootObj = {
      id: out.id,
      name: out.name,
      tokenImage: out.tokenImage,
      size: out.size,
      conditions: out.conditions,
      sheetMode: out.sheetMode,
      currency: out.currency,
    };
    if (Array.isArray(out.items)) {
      lootObj.items = out.items.map((child) => projectItem(child, viewer, options));
    }
    if (Array.isArray(out.inventory)) {
      lootObj.inventory = out.inventory.map((child) => projectItem(child, viewer, options));
    }
    return lootObj;
  }
  return {
    id: out.id,
    name: out.name,
    tokenImage: out.tokenImage,
    size: out.size,
    conditions: out.conditions,
  };
}

export function projectRecord(record, viewer, options = {}) {
  if (!record || typeof record !== "object") return record;
  const type = record.type ?? options.type ?? "";
  const isItem =
    type.includes("Item") ||
    type.includes("Weapon") ||
    type.includes("Armor") ||
    type.includes("Shield") ||
    type.includes("Consumable") ||
    type.includes("Container") ||
    type.includes("WondrousItem") ||
    type.includes("Loot") ||
    type.includes("Implant") ||
    record.identified !== undefined;
  if (isItem) {
    return projectItem(record, viewer, options);
  }
  const isActor =
    type.includes("Actor") ||
    type.includes("Character") ||
    type.includes("NPC") ||
    type.includes("Vehicle") ||
    type.includes("Trap") ||
    type.includes("Haunt") ||
    record.abilities !== undefined ||
    record.ownerUserIds !== undefined;
  if (isActor) {
    return projectActor(record, viewer, options);
  }
  const gm = isAdministrator(viewer, options);
  const out = JSON.parse(JSON.stringify(record));
  if (!gm) {
    if (out.notes && typeof out.notes === "object") {
      delete out.notes.gmNotes;
    }
    delete out.gmNotes;
  }
  return out;
}

export default {
  projectItem,
  projectActor,
  projectRecord,
  isAdministrator,
};
