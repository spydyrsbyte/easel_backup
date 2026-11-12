export function isGM(userId) {
  return (Application.users?.list?.() ?? []).some((member) => member.id === userId && member.role === "administrator");
}

export function access(actor, userId) {
  const gm = isGM(userId);
  const owner = gm || Boolean(actor?.ownerUserIds?.includes(userId));
  const controller = owner || Boolean(actor?.controllerUserIds?.includes(userId));
  const viewer = controller || Boolean(actor?.viewerUserIds?.includes(userId));
  return { gm, read: viewer, write: owner, control: controller };
}

export function tokenAccess(token, userId) {
  if (token.actorId) return access(new easel.vtt.Actor(token.actorId), userId);
  const gm = isGM(userId);
  return { gm, read: gm, write: gm, control: gm };
}

export function moveToken(token, groundId, x, y, userId) {
  if (!token.sceneId || token.isDefault) throw new Error("Place the token on a scene before moving it.");
  const rights = tokenAccess(token, userId);
  if (!rights.control) throw new Error("You do not control that token.");
  const scene = new easel.vtt.Scene(token.sceneId);
  const geometry = Easel.Interfaces.create("easel.maps.geometry@1");
  const ground = groundId || token.groundId;
  const level = geometry.activeGround(scene.map, ground);
  if (!level || level.id !== ground) throw new Error("That map level was not found.");
  if (!rights.gm) {
    if (ground !== token.groundId) throw new Error("Only the GM can move a token to another level.");
    const doors = new Map(easel.vtt.DoorState.ids().map((id) => new easel.vtt.DoorState(id)).filter((door) => door.sceneId === scene.id).map((door) => [door.wallId, door.open]));
    const walls = geometry.battleView(scene.map, ground, { includeHidden: true }).walls.map((wall) => doors.has(String(wall.id)) ? { ...wall, open: doors.get(String(wall.id)) } : wall);
    if (geometry.movementBlocked(walls, { x: token.x, y: token.y }, { x, y }, { w: token.width, h: token.height })) throw new Error("That path is blocked.");
  }
  token.groundId = ground;
  token.x = x;
  token.y = y;
  token.save();
  Application.events.emit("easel.vtt.changed", {});
}
