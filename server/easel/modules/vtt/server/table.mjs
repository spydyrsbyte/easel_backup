import { access, isGM, moveToken, tokenAccess } from "./interaction.mjs";

const copy = (value) => JSON.parse(JSON.stringify(value ?? null));
const all = (type) => type.ids().map((id) => new type(id));
const text = (value, limit = 120) => String(value ?? "").trim().slice(0, limit);
const rollModes = ["public", "gm", "blind", "self"];

const stripHidden = (layers) =>
  (Array.isArray(layers) ? layers : [])
    .filter((layer) => layer && layer.visible !== false && !layer.hidden)
    .map((layer) => ({
      ...layer,
      ...(Array.isArray(layer.children) ? { children: stripHidden(layer.children) } : {}),
      ...(Array.isArray(layer.items)
        ? {
            items: layer.items
              .filter((item) => item && !item.hidden)
              .map((item) =>
                item.kind === "secretDoor" || item.secret
                  ? { ...item, kind: "wall", door: false, secret: false, open: false }
                  : item,
              ),
          }
        : {}),
    }));

const withDoors = (layers, doors) =>
  (Array.isArray(layers) ? layers : []).map((layer) => ({
    ...layer,
    ...(Array.isArray(layer.children) ? { children: withDoors(layer.children, doors) } : {}),
    ...(Array.isArray(layer.items)
      ? { items: layer.items.map((item) => (item && doors.has(String(item.id)) ? { ...item, open: doors.get(String(item.id)) } : item)) }
      : {}),
  }));

const isDoor = (wall) => wall && (wall.door || wall.kind === "door" || wall.kind === "secretDoor");

export default class Table {
  constructor() {
    this.hooks = {};
  }

  start(hooks = {}) {
    this.hooks = hooks;
    this.geometry = Easel.Interfaces.create("easel.maps.geometry@1");
    this.projection = Easel.Interfaces.create("easel.visibility.projection@1");
    const register = (name, fields, handler) => {
      Application.events.register("easel.vtt." + name, { valid: 2, ...fields });
      Application.events.on("easel.vtt." + name, (payload, connection) => {
        try {
          handler.call(this, payload, connection);
        } catch (error) {
          connection.send("easel.vtt.error", { message: error.message || String(error) });
        }
      });
    };
    Application.events.register("easel.vtt.state", { valid: 1, state: "field" });
    Application.events.register("easel.vtt.error", { valid: 1, message: "string" });
    Application.events.register("easel.vtt.changed", { valid: 1 });
    Application.events.register("easel.vtt.turnStarted", { valid: 1, combatId: "string", combatantId: "string", round: "integer" });
    Application.events.register("easel.vtt.turnEnded", { valid: 1, combatId: "string", combatantId: "string", round: "integer" });
    Application.events.register("easel.vtt.roundStarted", { valid: 1, combatId: "string", round: "integer" });

    register("refresh", {}, this.refresh);
    register("sceneCreate", { name: "string" }, this.sceneCreate);
    register("sceneUpdate", { sceneId: "*easel.vtt.Scene", name: "string", navigation: "boolean", folderId: "string" }, this.sceneUpdate);
    register("sceneSaveMap", { sceneId: "*easel.vtt.Scene", map: "field" }, this.sceneSaveMap);
    register("sceneActivate", { sceneId: "*easel.vtt.Scene" }, this.sceneActivate);
    register("sceneDelete", { sceneId: "*easel.vtt.Scene" }, this.sceneDelete);
    register("sceneDuplicate", { sceneId: "*easel.vtt.Scene" }, this.sceneDuplicate);
    register("doorToggle", { sceneId: "*easel.vtt.Scene", wallId: "string", open: "boolean" }, this.doorToggle);
    register("tokenCreate", { sceneId: "*easel.vtt.Scene", groundId: "string", actorType: "string", actorId: "string", name: "string", x: "number", y: "number" }, this.tokenCreate);
    register("tokenUpdate", { tokenId: "*easel.vtt.Token", changes: "field" }, this.tokenUpdate);
    register("tokenMove", { tokenId: "*easel.vtt.Token", groundId: "string", x: "number", y: "number" }, this.tokenMove);
    register("tokenDelete", { tokenId: "*easel.vtt.Token" }, this.tokenDelete);
    register("actorPermissions", { actorId: "*easel.vtt.Actor", ownerUserIds: "array", viewerUserIds: "array", controllerUserIds: "array" }, this.actorPermissions);
    register("actorDefaultToken", { actorId: "*easel.vtt.Actor", settings: "field" }, this.actorDefaultToken);
    register("combatStart", { sceneId: "string" }, this.combatStart);
    register("combatEnd", { combatId: "*easel.vtt.Combat" }, this.combatEnd);
    register("combatantAdd", { combatId: "*easel.vtt.Combat", tokenId: "*easel.vtt.Token" }, this.combatantAdd);
    register("combatantRemove", { combatantId: "*easel.vtt.Combatant" }, this.combatantRemove);
    register("combatantSetInitiative", { combatantId: "*easel.vtt.Combatant", initiative: "number" }, this.combatantSetInitiative);
    register("combatantRollInitiative", { combatantId: "*easel.vtt.Combatant" }, this.combatantRollInitiative);
    register("combatantDefeated", { combatantId: "*easel.vtt.Combatant", defeated: "boolean" }, this.combatantDefeated);
    register("combatNext", { combatId: "*easel.vtt.Combat" }, this.combatNext);
    register("combatPrevious", { combatId: "*easel.vtt.Combat" }, this.combatPrevious);
    register("chatSend", { text: "string", rollMode: "string", whisperUserIds: "array" }, this.chatSend);
    register("journalSave", { journalId: "string", name: "string", content: "string", playerVisible: "boolean", folderId: "string" }, this.journalSave);
    register("journalDelete", { journalId: "*easel.vtt.JournalEntry" }, this.journalDelete);
    register("folderSave", { folderId: "string", name: "string", kind: "string", parentId: "string" }, this.folderSave);
    register("folderDelete", { folderId: "*easel.vtt.Folder" }, this.folderDelete);
    register("diceSave", { settings: "field" }, this.diceSave);
  }

  changed() {
    Application.events.emit("easel.vtt.changed", {});
  }

  isGM(userId) {
    return isGM(userId);
  }

  requireGM(connection) {
    if (!this.isGM(connection.user.id)) throw new Error("Only the GM can do that.");
  }

  activeScene() {
    return all(easel.vtt.Scene).find((scene) => scene.active) ?? null;
  }

  doors(sceneId) {
    const doors = new Map();
    for (const door of all(easel.vtt.DoorState)) {
      if (door.sceneId === sceneId) doors.set(door.wallId, door.open);
    }
    return doors;
  }

  sceneMap(scene) {
    const map = copy(scene.map);
    return { ...map, layers: withDoors(map.layers, this.doors(scene.id)) };
  }

  walls(scene, groundId) {
    return this.geometry.battleView(this.sceneMap(scene), groundId, { includeHidden: true }).walls;
  }

  canSee(userId, token, scene) {
    if (this.isGM(userId)) return true;
    if (token.hidden) return false;
    return this.hooks.visible ? Boolean(this.hooks.visible(userId, this.tokenData(token), this.sceneData(scene))) : true;
  }

  sceneData(scene) {
    return { id: scene.id, name: scene.name, folderId: scene.folderId, active: scene.active, navigation: scene.navigation, sort: scene.sort };
  }

  tokenData(token) {
    return {
      id: token.id,
      sceneId: token.sceneId,
      groundId: token.groundId,
      actorType: token.actorType,
      actorId: token.actorId || "",
      name: token.name,
      image: token.image,
      x: token.x,
      y: token.y,
      width: token.width,
      height: token.height,
      rotation: token.rotation,
      hidden: token.hidden,
      disposition: token.disposition,
      vision: copy(token.vision),
    };
  }

  messageVisible(message, userId, gm) {
    if (message.whisperUserIds.length) return gm || message.userId === userId || message.whisperUserIds.includes(userId);
    if (message.rollMode === "public") return true;
    if (message.rollMode === "gm") return gm || message.userId === userId;
    if (message.rollMode === "blind") return gm || message.userId === userId;
    return message.userId === userId;
  }

  messageData(message, userId, gm) {
    const data = {
      id: message.id,
      userId: message.userId,
      speaker: { name: message.speakerName, actorType: message.speakerActorType, actorId: message.speakerActorId, tokenId: message.speakerTokenId },
      rollMode: message.rollMode,
      whisperUserIds: [...message.whisperUserIds],
      timestamp: message.timestamp,
      text: message.text,
      card: copy(message.card),
    };
    if (message.rollMode === "blind" && !gm) return { ...data, text: "", card: {}, concealed: true };
    if (this.hooks.cardView && Object.keys(data.card).length) data.card = this.hooks.cardView(data.card, userId, gm, data);
    return data;
  }

  state(userId) {
    const gm = this.isGM(userId);
    const scenes = all(easel.vtt.Scene).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
    const active = scenes.find((scene) => scene.active) ?? null;
    const activeMap = active ? this.sceneMap(active) : null;
    let activeView = active
      ? {
          ...this.sceneData(active),
          map: gm ? activeMap : { ...activeMap, layers: stripHidden(activeMap.layers) },
          tokens: all(easel.vtt.Token)
            .filter((token) => token.sceneId === active.id && !token.isDefault && this.canSee(userId, token, active))
            .map((token) => ({ ...this.tokenData(token), canControl: tokenAccess(token, userId).control })),
        }
      : null;
    if (activeView && this.hooks.sceneView) activeView = this.hooks.sceneView(activeView, userId, gm);
    const visibleTokenIds = new Set(activeView?.tokens.map((token) => token.id) ?? []);
    const combat = all(easel.vtt.Combat)[0] ?? null;
    const combatView = combat
      ? {
          id: combat.id,
          sceneId: combat.sceneId,
          round: combat.round,
          turnIndex: combat.turnIndex,
          started: combat.started,
          combatants: this.order(combat.id)
            .filter((entry) => gm || (!entry.hidden && visibleTokenIds.has(entry.tokenId)))
            .map((entry) => ({
              id: entry.id,
              tokenId: entry.tokenId,
              actorType: entry.actorType,
              actorId: entry.actorId,
              canControl: entry.actorId ? access(new easel.vtt.Actor(entry.actorId), userId).control : gm,
              name: entry.name,
              hasInitiative: entry.hasInitiative,
              initiative: entry.initiative,
              defeated: entry.defeated,
              hidden: entry.hidden,
            })),
          currentId: combat.started && (gm || visibleTokenIds.has(this.order(combat.id)[combat.turnIndex]?.tokenId)) ? this.order(combat.id)[combat.turnIndex]?.id ?? "" : "",
        }
      : null;
    const messages = all(easel.vtt.ChatMessage)
      .filter((message) => this.messageVisible(message, userId, gm))
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-200)
      .map((message) => this.messageData(message, userId, gm));
    const journals = all(easel.vtt.JournalEntry)
      .filter((entry) => gm || entry.playerVisible)
      .map((entry) => ({ id: entry.id, name: entry.name, folderId: entry.folderId, content: entry.content, playerVisible: entry.playerVisible }));
    const folders = all(easel.vtt.Folder).map((folder) => ({ id: folder.id, name: folder.name, kind: folder.kind, parentId: folder.parentId, sort: folder.sort }));
    const dice = all(easel.vtt.DiceSettings).find((entry) => entry.userId === userId);
    return {
      userId,
      isGM: gm,
      scenes: scenes.filter((scene) => gm || scene.active || scene.navigation).map((scene) => this.sceneData(scene)),
      activeScene: activeView,
      combat: combatView,
      messages,
      journals,
      folders,
      diceSettings: dice ? copy(dice.settings) : {},
      members: Application.users.list().map((user) => ({ id: user.id, name: user.displayName || user.id })),
      actors: all(easel.vtt.Actor)
        .map((actor) => ({ actor, rights: access(actor, userId) }))
        .filter(({ rights }) => rights.read)
        .map(({ actor, rights }) => ({
          id: actor.id,
          type: actor.type,
          name: actor.name,
          ...(rights.write ? { ownerUserIds: [...actor.ownerUserIds], viewerUserIds: [...actor.viewerUserIds], controllerUserIds: [...actor.controllerUserIds] } : {}),
          canWrite: rights.write,
          canControl: rights.control,
          defaultToken: actor.defaultTokenId ? this.tokenData(new easel.vtt.Token(actor.defaultTokenId)) : null,
        })),
    };
  }

  refresh(_, connection) {
    connection.send("easel.vtt.state", { state: this.state(connection.user.id) });
  }

  sceneCreate({ name }, connection) {
    this.requireGM(connection);
    const scene = new easel.vtt.Scene();
    scene.name = text(name) || "New Scene";
    scene.map = this.geometry.emptyBattleMap((prefix) => prefix);
    scene.active = !this.activeScene();
    scene.sort = easel.vtt.Scene.ids().length;
    scene.save();
    this.changed();
  }

  sceneUpdate({ sceneId, name, navigation, folderId }, connection) {
    this.requireGM(connection);
    const scene = new easel.vtt.Scene(sceneId);
    scene.name = text(name) || scene.name;
    scene.navigation = navigation;
    scene.folderId = folderId;
    scene.save();
    this.changed();
  }

  sceneSaveMap({ sceneId, map }, connection) {
    this.requireGM(connection);
    if (!Array.isArray(map.layers)) throw new Error("A map needs a layers list.");
    const scene = new easel.vtt.Scene(sceneId);
    scene.map = this.projection.sanitizeMap(map);
    scene.save();
    this.changed();
  }

  sceneActivate({ sceneId }, connection) {
    this.requireGM(connection);
    for (const scene of all(easel.vtt.Scene)) {
      const active = scene.id === sceneId;
      if (scene.active !== active) {
        scene.active = active;
        scene.save();
      }
    }
    this.changed();
  }

  sceneDelete({ sceneId }, connection) {
    this.requireGM(connection);
    for (const token of all(easel.vtt.Token)) if (token.sceneId === sceneId) token.remove();
    for (const door of all(easel.vtt.DoorState)) if (door.sceneId === sceneId) door.remove();
    new easel.vtt.Scene(sceneId).remove();
    this.changed();
  }

  sceneDuplicate({ sceneId }, connection) {
    this.requireGM(connection);
    const original = new easel.vtt.Scene(sceneId);
    const scene = new easel.vtt.Scene();
    scene.name = text(original.name + " (Copy)");
    scene.map = this.projection.sanitizeMap(this.sceneMap(original));
    scene.folderId = original.folderId;
    scene.sort = easel.vtt.Scene.ids().length;
    scene.save();
    this.changed();
  }

  doorToggle({ sceneId, wallId, open }, connection) {
    const scene = new easel.vtt.Scene(sceneId);
    const map = this.sceneMap(scene);
    const wall = this.geometry
      .grounds(map)
      .flatMap((ground) => this.geometry.battleView(map, ground.id, { includeHidden: true }).walls)
      .find((entry) => String(entry.id) === wallId);
    const gm = this.isGM(connection.user.id);
    if (!isDoor(wall) || (!gm && (wall.kind === "secretDoor" || wall.secret))) throw new Error("That is not a door.");
    if (!gm && wall.locked) throw new Error("That door is locked.");
    const existing = all(easel.vtt.DoorState).find((door) => door.sceneId === sceneId && door.wallId === wallId);
    const door = existing ?? new easel.vtt.DoorState();
    door.sceneId = sceneId;
    door.wallId = wallId;
    door.open = open;
    door.save();
    this.changed();
  }

  tokenCreate({ sceneId, groundId, actorType, actorId, name, x, y }, connection) {
    this.requireGM(connection);
    const scene = new easel.vtt.Scene(sceneId);
    const ground = this.geometry.activeGround(scene.map, groundId);
    if (!ground || (groundId && ground.id !== groundId)) throw new Error("That map level was not found.");
    if (actorId && !easel.vtt.Actor.ids().includes(actorId)) throw new Error("That actor was not found.");
    const record = actorId ? new easel.vtt.Actor(actorId) : null;
    const actor = record && this.hooks.actor ? this.hooks.actor(actorType, actorId) : record ? { name: record.name, image: record.tokenImage || "" } : null;
    if (actorId && this.hooks.actor && !actor) throw new Error("That actor was not found.");
    const token = new easel.vtt.Token();
    token.sceneId = sceneId;
    token.groundId = ground.id;
    token.actorType = record?.type || actorType;
    if (actorId) token.actorId = actorId;
    token.name = text(name) || text(actor?.name);
    if (!token.name) throw new Error("A token needs a name.");
    token.image = actor?.image ?? "";
    const prototype = record?.defaultTokenId ? new easel.vtt.Token(record.defaultTokenId) : null;
    token.width = actor?.width || ground.grid?.size || 64;
    token.height = actor?.height || ground.grid?.size || 64;
    if (actor?.vision) token.vision = copy(actor.vision);
    if (prototype) for (const key of ["name", "image", "width", "height", "rotation", "disposition", "vision"]) token[key] = copy(prototype[key]);
    token.x = x;
    token.y = y;
    token.save();
    this.changed();
  }

  tokenUpdate({ tokenId, changes }, connection) {
    const token = new easel.vtt.Token(tokenId);
    const rights = tokenAccess(token, connection.user.id);
    if (!rights.control) throw new Error("You do not control that token.");
    const allowed = rights.gm ? ["name", "image", "width", "height", "rotation", "hidden", "disposition", "vision"] : ["rotation"];
    for (const [key, value] of Object.entries(changes)) {
      if (!allowed.includes(key)) throw new Error("You cannot change a token's " + key + ".");
      token[key] = key === "vision" ? copy(value) : value;
    }
    token.save();
    this.changed();
  }

  tokenMove({ tokenId, groundId, x, y }, connection) {
    const token = new easel.vtt.Token(tokenId);
    if (token.actorId) return new easel.vtt.Actor(token.actorId).moveToken(tokenId, groundId, x, y, connection.user.id);
    moveToken(token, groundId, x, y, connection.user.id);
  }

  actorPermissions({ actorId, ownerUserIds, viewerUserIds, controllerUserIds }, connection) {
    const actor = new easel.vtt.Actor(actorId);
    if (!actor.canWrite(connection.user.id)) throw new Error("Only an owner can change who has access to this actor.");
    const members = new Set(Application.users.list().map((user) => user.id));
    const users = (list) => {
      const ids = [...new Set(list.map(String))];
      for (const id of ids) if (!members.has(id)) throw new Error("Actor access can only be granted to game members.");
      return ids;
    };
    actor.ownerUserIds = users(ownerUserIds);
    actor.viewerUserIds = users(viewerUserIds);
    actor.controllerUserIds = users(controllerUserIds);
    actor.save();
    this.changed();
    this.hooks.actorChanged?.();
  }

  actorDefaultToken({ actorId, settings }, connection) {
    new easel.vtt.Actor(actorId).setDefaultToken(settings, connection.user.id);
    this.hooks.actorChanged?.();
  }

  tokenDelete({ tokenId }, connection) {
    this.requireGM(connection);
    for (const combatant of all(easel.vtt.Combatant)) if (combatant.tokenId === tokenId) combatant.remove();
    new easel.vtt.Token(tokenId).remove();
    this.changed();
  }

  order(combatId) {
    return all(easel.vtt.Combatant)
      .filter((entry) => entry.combatId === combatId)
      .sort(
        (a, b) =>
          Number(b.hasInitiative) - Number(a.hasInitiative) ||
          b.initiative - a.initiative ||
          a.name.localeCompare(b.name) ||
          a.id.localeCompare(b.id),
      );
  }

  combatStart({ sceneId }, connection) {
    this.requireGM(connection);
    new easel.vtt.Scene(sceneId);
    if (easel.vtt.Combat.ids().length) throw new Error("A combat is already running.");
    const combat = new easel.vtt.Combat();
    combat.sceneId = sceneId;
    combat.save();
    this.changed();
  }

  combatEnd({ combatId }, connection) {
    this.requireGM(connection);
    for (const entry of all(easel.vtt.Combatant)) if (entry.combatId === combatId) entry.remove();
    new easel.vtt.Combat(combatId).remove();
    this.changed();
  }

  combatantAdd({ combatId, tokenId }, connection) {
    this.requireGM(connection);
    const combat = new easel.vtt.Combat(combatId);
    if (all(easel.vtt.Combatant).some((entry) => entry.combatId === combatId && entry.tokenId === tokenId)) {
      throw new Error("That token is already in the combat.");
    }
    const token = new easel.vtt.Token(tokenId);
    if (token.sceneId !== combat.sceneId) throw new Error("The token must belong to the combat scene.");
    const combatant = new easel.vtt.Combatant();
    combatant.combatId = combatId;
    combatant.tokenId = tokenId;
    combatant.actorType = token.actorType;
    combatant.actorId = token.actorId || "";
    combatant.name = token.name;
    combatant.hidden = token.hidden;
    combatant.save();
    this.changed();
  }

  combatantRemove({ combatantId }, connection) {
    this.requireGM(connection);
    const combatant = new easel.vtt.Combatant(combatantId);
    const combat = new easel.vtt.Combat(combatant.combatId);
    const index = this.order(combat.id).findIndex((entry) => entry.id === combatantId);
    combatant.remove();
    if (combat.started && index >= 0 && index < combat.turnIndex) {
      combat.turnIndex -= 1;
      combat.save();
    }
    this.changed();
  }

  combatantSetInitiative({ combatantId, initiative }, connection) {
    this.requireGM(connection);
    this.setInitiative(new easel.vtt.Combatant(combatantId), initiative);
  }

  combatantRollInitiative({ combatantId }, connection) {
    const combatant = new easel.vtt.Combatant(combatantId);
    const rights = combatant.actorId ? access(new easel.vtt.Actor(combatant.actorId), connection.user.id) : { control: this.isGM(connection.user.id) };
    if (!rights.control) throw new Error("You do not control that combatant.");
    if (!this.hooks.initiative) throw new Error("This game does not roll initiative.");
    const result = this.hooks.initiative({ id: combatant.id, actorType: combatant.actorType, actorId: combatant.actorId, tokenId: combatant.tokenId, name: combatant.name }, { userId: connection.user.id });
    if (typeof result !== "number" || !Number.isFinite(result)) throw new Error("The initiative roll did not produce a number.");
    this.setInitiative(combatant, result);
  }

  setInitiative(combatant, initiative) {
    const combat = new easel.vtt.Combat(combatant.combatId);
    const current = combat.started ? this.order(combat.id)[combat.turnIndex]?.id : "";
    combatant.hasInitiative = true;
    combatant.initiative = initiative;
    combatant.save();
    if (current) {
      const index = this.order(combat.id).findIndex((entry) => entry.id === current);
      if (index >= 0 && index !== combat.turnIndex) {
        combat.turnIndex = index;
        combat.save();
      }
    }
    this.changed();
  }

  combatantDefeated({ combatantId, defeated }, connection) {
    this.requireGM(connection);
    const combatant = new easel.vtt.Combatant(combatantId);
    combatant.defeated = defeated;
    combatant.save();
    this.changed();
  }

  combatNext({ combatId }, connection) {
    this.requireGM(connection);
    this.step(new easel.vtt.Combat(combatId), 1);
  }

  combatPrevious({ combatId }, connection) {
    this.requireGM(connection);
    this.step(new easel.vtt.Combat(combatId), -1);
  }

  step(combat, direction) {
    const order = this.order(combat.id);
    const living = order.filter((entry) => !entry.defeated);
    if (!living.length) throw new Error("There is no one left to take a turn.");
    if (!combat.started) {
      if (direction < 0) throw new Error("The combat has not started.");
      combat.started = true;
      combat.round = 1;
      combat.turnIndex = order.indexOf(living[0]);
      combat.save();
      Application.events.emit("easel.vtt.roundStarted", { combatId: combat.id, round: 1 });
      Application.events.emit("easel.vtt.turnStarted", { combatId: combat.id, combatantId: living[0].id, round: 1 });
      this.changed();
      return;
    }
    const previous = order[combat.turnIndex];
    let index = combat.turnIndex;
    let round = combat.round;
    do {
      index += direction;
      if (index >= order.length) {
        index = 0;
        round += 1;
      } else if (index < 0) {
        if (round <= 1) throw new Error("This is the first turn.");
        index = order.length - 1;
        round -= 1;
      }
    } while (order[index].defeated);
    if (previous) Application.events.emit("easel.vtt.turnEnded", { combatId: combat.id, combatantId: previous.id, round: combat.round });
    if (round !== combat.round && direction > 0) Application.events.emit("easel.vtt.roundStarted", { combatId: combat.id, round });
    combat.turnIndex = index;
    combat.round = round;
    combat.save();
    Application.events.emit("easel.vtt.turnStarted", { combatId: combat.id, combatantId: order[index].id, round });
    this.changed();
  }

  post({ userId, speakerName = "", speakerActorType = "", speakerActorId = "", speakerTokenId = "", rollMode = "public", whisperUserIds = [], text: body = "", card = {} }) {
    if (!rollModes.includes(rollMode)) throw new Error("Unknown roll mode.");
    if (!body && !Object.keys(card).length) throw new Error("A message needs text or a card.");
    const message = new easel.vtt.ChatMessage();
    message.userId = userId;
    message.speakerName = text(speakerName);
    message.speakerActorType = speakerActorType;
    message.speakerActorId = speakerActorId;
    message.speakerTokenId = speakerTokenId;
    message.rollMode = rollMode;
    message.whisperUserIds = whisperUserIds.map(String);
    message.timestamp = Date.now();
    message.text = String(body).slice(0, 4000);
    message.card = copy(card);
    message.save();
    this.changed();
    return message.id;
  }

  chatSend({ text: body, rollMode, whisperUserIds }, connection) {
    if (!rollModes.includes(rollMode)) throw new Error("Unknown roll mode.");
    const message = String(body).trim();
    if (!message || message.length > 4000) throw new Error("Messages must contain between 1 and 4000 characters.");
    if (this.hooks.command) {
      const handled = this.hooks.command(message, { userId: connection.user.id, displayName: connection.user.displayName, rollMode, whisperUserIds });
      if (handled) return;
    }
    this.post({ userId: connection.user.id, speakerName: connection.user.displayName || "", rollMode, whisperUserIds, text: message });
  }

  journalSave({ journalId, name, content, playerVisible, folderId }, connection) {
    this.requireGM(connection);
    const entry = journalId ? new easel.vtt.JournalEntry(journalId) : new easel.vtt.JournalEntry();
    entry.name = text(name) || "Untitled";
    entry.content = content;
    entry.playerVisible = playerVisible;
    entry.folderId = folderId;
    entry.save();
    this.changed();
  }

  journalDelete({ journalId }, connection) {
    this.requireGM(connection);
    new easel.vtt.JournalEntry(journalId).remove();
    this.changed();
  }

  folderSave({ folderId, name, kind, parentId }, connection) {
    this.requireGM(connection);
    if (parentId && parentId === folderId) throw new Error("A folder cannot contain itself.");
    const folder = folderId ? new easel.vtt.Folder(folderId) : new easel.vtt.Folder();
    folder.name = text(name) || "New Folder";
    folder.kind = text(kind, 40);
    folder.parentId = parentId;
    folder.save();
    this.changed();
  }

  folderDelete({ folderId }, connection) {
    this.requireGM(connection);
    for (const folder of all(easel.vtt.Folder)) {
      if (folder.parentId === folderId) {
        folder.parentId = "";
        folder.save();
      }
    }
    new easel.vtt.Folder(folderId).remove();
    this.changed();
  }

  diceSave({ settings }, connection) {
    const existing = all(easel.vtt.DiceSettings).find((entry) => entry.userId === connection.user.id);
    const entry = existing ?? new easel.vtt.DiceSettings();
    entry.userId = connection.user.id;
    entry.settings = copy(settings);
    entry.save();
    connection.send("easel.vtt.state", { state: this.state(connection.user.id) });
  }
}
