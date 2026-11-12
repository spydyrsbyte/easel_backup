const finite = (value, fallback) => (Number.isFinite(value) ? value : fallback);
const containerKinds = ["deck", "pile", "playregion", "hand", "discard"];
function cardControllable(card, pile) {
  return (
    card.movable === true &&
    card.permissions?.control !== false &&
    pile?.permissions?.control !== false &&
    card.permissions?.read !== false &&
    pile?.permissions?.read !== false
  );
}
function pileReceivable(pile) {
  return (pile.permissions?.receive ?? pile.permissions?.control) === true;
}
function pileAtPoint(piles, point) {
  const candidates = [...piles].reverse().filter((pile) => {
    if (pile.visible === false || pile.permissions?.read === false)
      return false;
    const local = worldToPile(pile, point);
    return (
      local.x >= 0 &&
      local.y >= 0 &&
      local.x <= pile.width &&
      local.y <= pile.height
    );
  });
  return candidates.find((pile) => pile.kind !== "playregion") || candidates[0];
}
function containerOwner(owner, { kind = "pile", playerid, boardid } = {}) {
  const value = owner || {
    metatype: kind === "hand" ? "account" : "board",
    id: kind === "hand" ? playerid : boardid,
  };
  const scope = value.metatype === "player" ? "account" : value.metatype;
  if (!["account", "board"].includes(scope) || !Number.isSafeInteger(value.id))
    throw new TypeError(
      "Container owners reference a player/account or a board.",
    );
  if (kind === "hand" && scope !== "account")
    throw new TypeError("Hands must be player owned.");
  return { ...value, metatype: scope };
}
function pileData(record, context = {}) {
  const kind = record.kind === "table" ? "playregion" : record.kind || "pile";
  if (!containerKinds.includes(kind))
    throw new TypeError("Use deck, pile, playregion, hand or discard.");
  const layout =
    record.layout ||
    { deck: "stack", hand: "fan", discard: "stack" }[kind] ||
    "free";
  if (!["free", "stack", "spread", "fan"].includes(layout))
    throw new TypeError("Unknown card layout.");
  return {
    ...record,
    kind,
    layout,
    owner: containerOwner(record.owner, { ...context, kind }),
    x: finite(record.x, 0),
    y: finite(record.y, 0),
    width: Math.max(0.1, finite(record.width, 3)),
    height: Math.max(0.1, finite(record.height, 3)),
    orientation: finite(record.orientation, 0),
    visible: record.visible !== false && record.permissions?.read !== false,
  };
}
function tableLayout({
  players,
  width = 16,
  height = 16,
  shape = "auto",
  size = 1,
  boardid,
} = {}) {
  const count = players.length;
  const requested = typeof shape === "string" ? { type: shape } : shape;
  const sides =
    requested.type === "square"
      ? 4
      : requested.type === "circle"
        ? 64
        : requested.type === "polygon"
          ? Math.max(3, Math.round(finite(requested.sides, count)))
          : Math.max(4, count);
  const radius = Math.min(width, height) * 0.34 * finite(size, 1),
    center = { x: width / 2, y: height / 2 };
  const points = Array.from({ length: sides }, (_, i) => {
    const angle = Math.PI / 2 - Math.PI / sides + (i * Math.PI * 2) / sides;
    return {
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius,
    };
  });
  const seats = players.map((player, i) => {
    const edge =
      count === 2 && sides === 4
        ? i * 2
        : Math.floor((i * sides) / Math.max(count, 1));
    const angle = Math.PI / 2 + (edge * Math.PI * 2) / sides;
    const distance = radius * Math.cos(Math.PI / sides) + 1.15;
    return {
      ...player,
      x: center.x + Math.cos(angle) * distance,
      y: center.y + Math.sin(angle) * distance,
      orientation: ((angle - Math.PI / 2) * 180) / Math.PI,
      span: Math.max(
        1.6,
        Math.min(
          5.6,
          2 * radius * Math.sin(Math.PI / Math.max(sides, count || 1)) * 0.85,
        ),
      ),
    };
  });
  const owner = { metatype: "board", id: boardid };
  const piles = [
    {
      id: "deck",
      name: { i18n: "gamekit.draw-pile" },
      kind: "deck",
      owner,
      x: center.x - 3.2,
      y: center.y - 1.4,
      width: 2,
      height: 2.8,
    },
    {
      id: "table",
      name: { i18n: "gamekit.play-region" },
      kind: "playregion",
      owner,
      x: center.x - 2.8,
      y: center.y - 3.2,
      width: 5.6,
      height: 6.4,
    },
    {
      id: "discard",
      name: { i18n: "gamekit.discard" },
      kind: "discard",
      owner,
      x: center.x + 1.2,
      y: center.y - 1.4,
      width: 2,
      height: 2.8,
    },
    ...seats.map((seat) => ({
      id: `hand-${seat.id}`,
      name: `${seat.name || "Player " + seat.id}'s hand`,
      kind: "hand",
      owner: { metatype: "account", id: seat.id },
      x: seat.x - seat.span / 2,
      y: seat.y - 1,
      width: seat.span,
      height: 2,
      orientation: seat.orientation,
    })),
  ];
  return { points, seats, piles, sides };
}
function pileToWorld(pile, point) {
  const radians = (pile.orientation * Math.PI) / 180,
    c = Math.cos(radians),
    s = Math.sin(radians);
  const x = point.x - pile.width / 2,
    y = point.y - pile.height / 2;
  return {
    x: pile.x + pile.width / 2 + c * x - s * y,
    y: pile.y + pile.height / 2 + s * x + c * y,
  };
}
function worldToPile(pile, point) {
  const radians = (-pile.orientation * Math.PI) / 180,
    c = Math.cos(radians),
    s = Math.sin(radians);
  const x = point.x - pile.x - pile.width / 2,
    y = point.y - pile.y - pile.height / 2;
  return {
    x: pile.width / 2 + c * x - s * y,
    y: pile.height / 2 + s * x + c * y,
  };
}
export {
  cardControllable,
  containerKinds,
  containerOwner,
  pileAtPoint,
  pileData,
  pileReceivable,
  pileToWorld,
  tableLayout,
  worldToPile,
};
