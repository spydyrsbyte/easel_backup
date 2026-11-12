const cache = /* @__PURE__ */ new Map();
let queue = Promise.resolve();
function rememberCard(card) {
  const faces = card.card_faces || [],
    front = card.image_uris || faces[0]?.image_uris;
  const data = {
    id: card.id,
    name: card.name,
    scryfall: card.id,
    image: front?.normal || "",
    backImage: faces[1]?.image_uris?.normal || "",
    type: card.type_line,
    oracle: (
      card.oracle_text ||
      faces
        .map(
          (f) => `${f.name}
${f.oracle_text || ""}`,
        )
        .join("\n\n")
    ).slice(0, 2500),
    mana: card.mana_cost || faces[0]?.mana_cost || "",
    power: card.power || faces[0]?.power || "",
    toughness: card.toughness || faces[0]?.toughness || "",
    backType: faces[1]?.type_line || "",
    backPower: faces[1]?.power || "",
    backToughness: faces[1]?.toughness || "",
  };
  cache.set(card.name.toLowerCase(), data);
  if (faces[0]?.name) cache.set(faces[0].name.toLowerCase(), data);
  return data;
}
async function collection(names) {
  const task = queue
    .catch(() => {})
    .then(async () => {
      const response = await fetch(
        "https://api.scryfall.com/cards/collection",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            identifiers: names.map((name) => ({ name })),
          }),
        },
      );
      if (!response.ok)
        throw new Error(`Card lookup failed (${response.status}).`);
      const result = await response.json();
      if (result.not_found?.length)
        throw new Error(
          "Cards not found: " + result.not_found.map((c) => c.name).join(", "),
        );
      result.data.forEach(rememberCard);
      return result;
    });
  const pause = () => new Promise((resolve) => setTimeout(resolve, 150));
  queue = task.then(pause, pause);
  return task;
}
const cardName = (name) =>
  String(name)
    .trim()
    .replace(/\s*\/\/\s*/g, " // ");
const frontFace = (name) => cardName(name).split(" // ")[0];
async function resolveDeck(entries) {
  const missing = [
    ...new Set(
      entries
        .map((e) => cardName(e.name))
        .filter(
          (name) =>
            !cache.has(name.toLowerCase()) &&
            !cache.has(frontFace(name).toLowerCase()),
        )
        .map(frontFace),
    ),
  ];
  for (let i = 0; i < missing.length; i += 75)
    await collection(missing.slice(i, i + 75));
  return entries.map((entry) => {
    const name = cardName(entry.name);
    const card =
      cache.get(name.toLowerCase()) || cache.get(frontFace(name).toLowerCase());
    if (!card) throw new Error("Card not found: " + entry.name);
    return { ...entry, ...card };
  });
}
async function searchCards(query) {
  const task = queue.then(async () => {
    const response = await fetch(
      "https://api.scryfall.com/cards/search?q=" +
        encodeURIComponent(query) +
        "&unique=cards",
      { headers: { Accept: "application/json" } },
    );
    if (response.status === 404) return { records: [] };
    if (!response.ok)
      throw new Error(`Card search failed (${response.status}).`);
    const result = await response.json();
    return {
      records: result.data.slice(0, 30).map(rememberCard),
      notice:
        result.total_cards > 30
          ? { i18n: "easel.mtg.showing-the-first-30-cards-narrow" }
          : "",
    };
  });
  const pause = () => new Promise((resolve) => setTimeout(resolve, 150));
  queue = task.then(pause, pause);
  return task;
}
const rulings = /* @__PURE__ */ new Map();
function cardRulings(id) {
  if (!/^[0-9a-f-]{36}$/i.test(String(id || ""))) return Promise.resolve([]);
  if (!rulings.has(id)) {
    const task = queue.then(async () => {
      const response = await fetch(
        "https://api.scryfall.com/cards/" + id + "/rulings",
        {
          headers: { Accept: "application/json" },
        },
      );
      if (response.status === 404) return [];
      if (!response.ok)
        throw new Error(`Rulings lookup failed (${response.status}).`);
      const result = await response.json();
      return result.data.map((ruling) => ({
        date: ruling.published_at,
        source: ruling.source === "wotc" ? "Wizards of the Coast" : "Scryfall",
        text: ruling.comment,
      }));
    });
    const pause = () => new Promise((resolve) => setTimeout(resolve, 150));
    queue = task.then(pause, pause);
    rulings.set(id, task);
    task.catch(() => rulings.delete(id));
  }
  return rulings.get(id);
}
export { cardRulings, resolveDeck, searchCards };
