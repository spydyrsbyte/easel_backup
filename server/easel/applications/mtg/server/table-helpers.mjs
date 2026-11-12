function createGrouping({
  direction = "vertical",
  maxCards = 5,
  maxSpan = null,
  step = 0.2,
  key = (card) => card.name,
  turned = (card) => Boolean(card.tapped),
  id = () => "group-" + Math.random().toString(36).slice(2),
} = {}) {
  if (!["vertical", "horizontal"].includes(direction))
    throw new TypeError("Group cards vertically or horizontally.");
  if (!Number.isInteger(maxCards) || maxCards < 1)
    throw new TypeError("A group holds at least one card.");
  const vertical = direction === "vertical";
  const along = (area) => (vertical ? area.height : area.width);
  const across = (area) => (vertical ? area.width : area.height);
  const length = (area) => (vertical ? area.card.height : area.card.width);
  const breadth = (area, card) =>
    (vertical ? !turned(card) : turned(card))
      ? area.card.width
      : area.card.height;
  const offset = (area) => {
    const room = Math.max(0, along(area));
    const span =
      maxSpan === null
        ? room + length(area)
        : Math.min(maxSpan, room + length(area));
    return maxCards > 1
      ? Math.max(
          0,
          Math.min(length(area) * step, (span - length(area)) / (maxCards - 1)),
        )
      : 0;
  };
  const crossOf = (area, card) => (vertical ? card.x : card.y) * across(area);
  const groups = (cards) => {
    const found = /* @__PURE__ */ new Map();
    for (const card of cards)
      if (card.group) {
        if (!found.has(card.group)) found.set(card.group, []);
        found.get(card.group).push(card);
      }
    for (const members of found.values())
      members.sort((a, b) => (a.groupIndex || 0) - (b.groupIndex || 0));
    return found;
  };
  function layout(area, members, base) {
    const gap = offset(area);
    members.forEach((card, index) => {
      card.groupIndex = index;
      const position =
        along(area) > 0 ? Math.min(1, (index * gap) / along(area)) : 0.5;
      const anchor = Math.min(1, Math.max(0, base / Math.max(1, across(area))));
      if (vertical) Object.assign(card, { x: anchor, y: position });
      else Object.assign(card, { x: position, y: anchor });
    });
    return members;
  }
  function leave(area, cards, card) {
    if (!card.group) return [];
    const base = crossOf(area, card);
    const rest = cards
      .filter((other) => other !== card && other.group === card.group)
      .sort((a, b) => (a.groupIndex || 0) - (b.groupIndex || 0));
    delete card.group;
    delete card.groupIndex;
    return layout(area, rest, base);
  }
  function slot(area, cards, exclude) {
    const reserved = [];
    for (const members of groups(
      cards.filter((card) => card !== exclude),
    ).values()) {
      const base = crossOf(area, members[0]);
      const half2 = Math.max(...members.map((card) => breadth(area, card))) / 2;
      reserved.push([base - half2, base + half2]);
    }
    for (const card of cards)
      if (card !== exclude && !card.group) {
        const base = crossOf(area, card),
          half2 = breadth(area, card) / 2;
        reserved.push([base - half2, base + half2]);
      }
    const half = (vertical ? area.card.width : area.card.height) / 2;
    const slack = half * 0.08;
    for (let base = 0; base <= across(area) + 1e-9; base += half * 0.08)
      if (
        !reserved.some(
          ([from, to]) =>
            base - half < to + slack && base + half > from - slack,
        )
      )
        return base;
    return null;
  }
  function join(area, cards, card, groupid) {
    const members =
      groups(cards.filter((other) => other !== card)).get(groupid) || [];
    card.group = groupid;
    return layout(
      area,
      [...members, card],
      members.length ? crossOf(area, members[0]) : crossOf(area, card),
    );
  }
  function place(area, cards, card) {
    const match = key(card);
    for (const [groupid, members] of groups(
      cards.filter((other) => other !== card),
    ))
      if (members.length < maxCards && key(members[0]) === match)
        return join(area, cards, card, groupid);
    const base = slot(area, cards, card);
    if (base === null) return null;
    card.group = id();
    return layout(area, [card], base);
  }
  function drop(area, cards, card) {
    const at = crossOf(area, card),
      match = key(card);
    for (const [groupid, members] of groups(
      cards.filter((other) => other !== card),
    )) {
      const half =
        Math.max(...members.map((other) => breadth(area, other))) / 2;
      if (
        members.length < maxCards &&
        key(members[0]) === match &&
        Math.abs(at - crossOf(area, members[0])) <= half
      )
        return join(area, cards, card, groupid);
    }
    return null;
  }
  function above(cards, card) {
    if (!card.group) return [card];
    return cards
      .filter(
        (other) =>
          other.group === card.group &&
          (other.groupIndex || 0) >= (card.groupIndex || 0),
      )
      .sort((a, b) => (a.groupIndex || 0) - (b.groupIndex || 0));
  }
  return { groups, layout, leave, place, drop, above, slot };
}
function createReset({
  home,
  owner = (card) => card.owner,
  isToken = (card) => Boolean(card.token),
  clearCard = () => {},
  resetPlayer = () => {},
  shuffle = () => {},
  random = (min, max) => min + Math.floor(Math.random() * (max - min)),
} = {}) {
  if (typeof home !== "function")
    throw new TypeError("Say where each card returns to.");
  function player(state, id) {
    state.cards = state.cards.filter(
      (card) => owner(card) !== id || !isToken(card),
    );
    for (const card of state.cards) {
      if (owner(card) !== id) continue;
      card.controller = id;
      card.zone = home(card);
      card.tapped = card.facedown = card.revealed = false;
      card.counters = {};
      card.x = card.y = 0.5;
      for (const key of ["group", "groupIndex", "region"]) delete card[key];
      clearCard(card);
    }
    const seat = state.players.find((item) => item.id === id);
    if (seat) resetPlayer(seat, state);
  }
  function newGame(state) {
    for (const seat of state.players) player(state, seat.id);
    state.cards = state.cards.filter((card) => !isToken(card));
    for (const seat of state.players) shuffle(state, seat.id);
    state.turn = 1;
    state.phase = 0;
    state.active = state.players.length
      ? state.players[random(0, state.players.length)].id
      : null;
    return state.active;
  }
  return { player, newGame };
}
export { createGrouping, createReset };
