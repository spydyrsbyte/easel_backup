import { projectActor, projectItem } from "./security.mjs";

const actorTypes = ["Character", "NPC", "Vehicle", "Trap", "Haunt"];
const childGroups = { Item: "items", Feature: "features", Buff: "buffs", Action: "actions", Spellbook: "spellbooks", Spell: "spells", ClassLevel: "classes" };
const copy = (value) => JSON.parse(JSON.stringify(value));
const data = (record) => ({ ...copy(record._data), id: record.id, type: record.type.split(".").pop() });

export default class Session {
  constructor(game) {
    this.game = game;
  }

  start() {
    const register = (name, fields, handler) => {
      Application.events.register("easel.pf1e." + name, { valid: 2, ...fields });
      Application.events.on("easel.pf1e." + name, (payload, connection) => {
        try {
          handler.call(this, payload, connection);
        } catch (error) {
          connection.send("easel.pf1e.error", { message: error.message || String(error) });
        }
      });
    };
    Application.events.register("easel.pf1e.state", { valid: 1, entries: "array", messages: "array", isGM: "boolean", userId: "string" });
    Application.events.register("easel.pf1e.changed", { valid: 1 });
    Application.events.register("easel.pf1e.recordSaved", { valid: 1, recordType: "string", recordId: "string" });
    register("refresh", {}, this.refresh);
    register("createActor", { name: "string", type: "string" }, this.createActor);
    register("updateActor", { actorId: "string", changes: "field" }, this.updateActor);
    register("saveRecord", { recordType: "string", record: "field" }, this.saveRecord);
    register("chatMessage", { text: "string", rollMode: "string" }, this.chatMessage);
    register("duplicateActor", { actorId: "string" }, this.duplicateActor);
    for (const name of ["rollAbility", "rollSave", "rollSkill", "rollInitiative", "useAction", "castSpell", "applyDamage", "applyHealing", "identifyItem", "rest", "advanceTurn", "transferItem", "transferCoin", "importStatblock"]) {
      Application.events.on("easel.pf1e." + name, (payload, connection) => {
        try {
          const intent = { ...payload };
          if (intent.actorId) {
            const actor = new easel.pf1e.Actor(intent.actorId);
            const rights = actor.access(connection.user.id);
            if (!(["rollAbility", "rollSave", "rollSkill", "rollInitiative", "useAction", "castSpell"].includes(name) ? rights.control : rights.write)) throw new Error("You do not have access to do that with this actor.");
            const sheet = this.sheet(actor, connection);
            if (name === "rollAbility") intent.modifier = sheet.derived.abilities[intent.ability]?.mod ?? 0;
            if (name === "rollSave") intent.modifier = sheet.derived.saves[intent.save] ?? 0;
            if (name === "rollSkill") {
              const skill = sheet.derived.skills[intent.skillId];
              if (!skill || !skill.canUse) throw new Error("This skill requires training.");
              intent.modifier = skill.total;
            }
            if (name === "rollInitiative") intent.modifier = sheet.derived.init;
            if (name === "useAction") {
              const action = sheet.actions.find((entry) => entry.id === intent.actionId);
              if (!action) throw new Error("The action was not found on this actor.");
              intent.actionData = action;
            }
            if (name === "castSpell") {
              const spell = sheet.spells.find((entry) => entry.id === intent.spellId);
              if (!spell) throw new Error("The spell was not found on this actor.");
              intent.spellData = spell;
            }
          } else if (!["importStatblock", "transferItem", "transferCoin"].includes(name)) {
            throw new Error("Select a character first.");
          }
          if (name === "importStatblock") throw new Error("Statblock import is not connected to actor creation yet.");
          this.game.rollContext = { userId: connection.user.id, actorId: intent.actorId || "", rollMode: intent.rollMode || "public" };
          try {
            this.game[name](intent);
          } finally {
            this.game.rollContext = null;
          }
          this.changed();
        } catch (error) {
          connection.send("easel.pf1e.error", { message: error.message || String(error) });
        }
      });
    }
  }

  changed() {
    Application.events.emit("easel.pf1e.changed", {});
    this.game.table?.changed();
  }

  isGM(userId) {
    return this.game.table ? this.game.table.isGM(userId) : (Application.users?.list?.() ?? []).some((member) => member.id === userId && member.role === "administrator");
  }

  requireWrite(actor, connection) {
    if (!actor.canWrite(connection.user.id)) throw new Error("Only an owner can change this actor.");
  }

  sheet(actor, connection) {
    const raw = data(actor);
    const rights = actor.access(connection.user.id);
    const isGM = rights.gm;
    const viewer = { id: connection.user.id };
    const options = { isGM, isOwner: rights.write, isObserver: rights.read };
    const projected = projectActor(raw, viewer, options);
    const canEdit = rights.write;
    const result = { id: actor.id, name: raw.name, type: raw.type === "NPC" ? "npc" : "character", actor: projected, isGM, canEdit, canControl: rights.control };
    if (!projected.abilities) return result;
    for (const [type, group] of Object.entries(childGroups)) {
      result[group] = easel.pf1e[type].ids().map((id) => new easel.pf1e[type](id)).filter((record) => record.actorId === actor.id).map((record) => projectItem(data(record), viewer, options));
    }
    const context = { items: result.items, features: result.features, buffs: result.buffs, classLevels: result.classes };
    result.derived = actor.computeDerived(context);
    result.derived.health = raw.health;
    return result;
  }

  refresh(_, connection) {
    const entries = easel.pf1e.Actor.ids().map((id) => new easel.pf1e.Actor(id)).filter((actor) => actor.canRead(connection.user.id)).map((actor) => this.sheet(actor, connection));
    const messages = easel.pf1e.ChatMessage.ids().map((id) => data(new easel.pf1e.ChatMessage(id))).filter((message) => message.rollMode === "public" || message.userId === connection.user.id).sort((a, b) => a.timestamp - b.timestamp).slice(-200).map((message) => ({ ...message.content, id: message.id, timestamp: message.timestamp }));
    connection.send("easel.pf1e.state", { entries, messages, isGM: this.isGM(connection.user.id), userId: connection.user.id });
  }

  createActor({ name, type }, connection) {
    if (!actorTypes.includes(type)) throw new Error("Unknown actor type.");
    const actor = new easel.pf1e[type]();
    actor.name = String(name).trim().slice(0, 100) || "New Adventurer";
    actor.ownerUserIds = [connection.user.id];
    actor.save();
    this.changed();
  }

  duplicateActor({ actorId }, connection) {
    const original = new easel.pf1e.Actor(actorId);
    this.requireWrite(original, connection);
    const actor = new easel.pf1e[original.type.split(".").pop()]();
    this.assign(actor._data, copy(original._data));
    actor.ownerUserIds = [connection.user.id];
    actor.name += " (Copy)";
    actor.save();
    this.changed();
  }

  assign(target, changes) {
    for (const [key, value] of Object.entries(changes)) {
      if (["__proto__", "constructor", "prototype", "id", "type", "ownerUserIds", "viewerUserIds", "controllerUserIds", "defaultTokenId"].includes(key)) continue;
      if (!(key in target)) throw new Error("Unknown field: " + key);
      if (value && typeof value === "object" && !Array.isArray(value) && target[key] && typeof target[key] === "object" && !Array.isArray(target[key])) {
        if (["skills", "settings", "traitsSummary"].includes(key)) target[key] = copy(value);
        else this.assign(target[key], value);
      } else target[key] = value;
    }
  }

  updateActor({ actorId, changes }, connection) {
    const actor = new easel.pf1e.Actor(actorId);
    this.requireWrite(actor, connection);
    if (changes.notes && "gmNotes" in changes.notes && !this.isGM(connection.user.id)) throw new Error("Only the GM can edit GM notes.");
    this.assign(actor._data, changes);
    actor.save();
    this.changed();
  }

  saveRecord({ recordType, record }, connection) {
    const allowed = ["Item", "Weapon", "Armor", "Shield", "WondrousItem", "Consumable", "Container", "Loot", "Implant", "Feature", "Feat", "ClassFeature", "Trait", "RacialTrait", "Buff", "Action", "Spellbook", "Spell", "ClassLevel"];
    if (!allowed.includes(recordType)) throw new Error("Unsupported record type.");
    const saved = record.id ? new easel.pf1e[recordType](record.id) : new easel.pf1e[recordType]();
    const actorId = record.id ? saved.actorId : record.actorId;
    if (!actorId) throw new Error("Choose an actor for this record.");
    this.requireWrite(new easel.pf1e.Actor(actorId), connection);
    const values = { ...record };
    delete values.actorId;
    this.assign(saved._data, values);
    saved.actorId = actorId;
    saved.save();
    connection.send("easel.pf1e.recordSaved", { recordType, recordId: record.id || "" });
    this.changed();
  }

  storeMessage(content, userId = "", rollMode = "public") {
    const record = new easel.pf1e.ChatMessage();
    record.userId = userId;
    record.rollMode = rollMode;
    record.timestamp = Date.now();
    record.content = content;
    record.save();
  }

  chatMessage({ text, rollMode }, connection) {
    if (this.game.table) return this.game.table.chatSend({ text, rollMode, whisperUserIds: [] }, connection);
    text = String(text).trim();
    if (!text || text.length > 4000) throw new Error("Messages must contain between 1 and 4000 characters.");
    if (!["public", "self"].includes(rollMode)) throw new Error("Only public and self rolls are available.");
    const speaker = { name: connection.user.displayName || "Player" };
    if (/^\/(?:r|roll)\s+/i.test(text)) {
      const formula = text.replace(/^\/(?:r|roll)\s+/i, "");
      const rolled = this.game.getNotationTool().roll(formula);
      this.storeMessage({ speaker, card: { title: "Roll: " + formula, total: rolled.total, formula, rolls: rolled.rolls } }, connection.user.id, rollMode);
    } else this.storeMessage({ speaker, text }, connection.user.id, rollMode);
    this.changed();
  }
}
