const api = "https://api.scryfall.com";
let last = 0;
const pace = async () => {
  const wait = last + 110 - Date.now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  last = Date.now();
};
const request = async (path, options) => {
  await pace();
  const response = await fetch(api + path, {
    headers: { Accept: "application/json", ...(options?.body ? { "Content-Type": "application/json" } : {}) },
    ...options,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.object === "error")
    throw new Error(
      body.status === 404
        ? "Your query didn't match any cards. Adjust your search terms and try again."
        : body.details || "Scryfall request failed.",
    );
  return body;
};
const large = (uris) => (uris?.large || uris?.normal || "").replace(/\?.*/, "");
const oracle = (face) => {
  let text = face.oracle_text || "";
  if (face.power !== undefined) text += "\n" + face.power + "/" + face.toughness;
  else if (face.loyalty !== undefined) text += "\n" + face.loyalty;
  return text.trim();
};
const faceSpec = (face, card) => ({
  name: face.name,
  type: face.type_line || "",
  cmc: card.cmc || 0,
  oracle: oracle(face),
  ...(face.power !== undefined ? { power: face.power, toughness: face.toughness } : {}),
  ...(face.loyalty !== undefined ? { loyalty: face.loyalty } : {}),
});
export const toSpec = (card) => {
  const token = /token|emblem/.test(card.layout || "") || /Token|Emblem/.test(card.type_line || "");
  if (card.card_faces && card.card_faces[0].image_uris) {
    let [front, back] = card.card_faces;
    let face = large(front.image_uris),
      backFace = large(back.image_uris);
    if (face.includes("/back/") && backFace.includes("/front/")) {
      [front, back] = [back, front];
      [face, backFace] = [backFace, face];
    }
    return {
      ...faceSpec(front, card),
      face,
      sid: card.id,
      ...(token ? { token } : {}),
      dfc: { ...faceSpec(back, card), face: backFace },
    };
  }
  const single = card.card_faces
    ? {
        name: card.name,
        type: card.type_line,
        cmc: card.cmc || 0,
        oracle: card.card_faces.map((face) => face.name + "\n" + oracle(face)).join("\n\n"),
      }
    : faceSpec(card, card);
  return {
    ...single,
    face: large(card.image_uris || card.card_faces?.[0]?.image_uris),
    sid: card.id,
    ...(token ? { token } : {}),
  };
};
export const named = async (name) =>
  request("/cards/named?fuzzy=" + encodeURIComponent(name));
export const byId = async (id) => request("/cards/" + encodeURIComponent(id));
export const search = async (query, options = {}) => {
  const parameters = new URLSearchParams({
    q: query,
    order: options.order || "name",
    unique: options.unique || "cards",
    include_extras: options.extras ? "true" : "false",
  });
  const body = await request("/cards/search?" + parameters);
  return body.data || [];
};
export const random = async (query) =>
  request("/cards/random" + (query ? "?q=" + encodeURIComponent(query) : ""));
export const rulings = async (card) => {
  const body = await request("/cards/" + card.id + "/rulings");
  return body.data || [];
};
export const collection = async (names) => {
  const found = new Map(),
    missing = [];
  for (let index = 0; index < names.length; index += 75) {
    const chunk = names.slice(index, index + 75);
    const body = await request("/cards/collection", {
      method: "POST",
      body: JSON.stringify({
        identifiers: chunk.map((name) => {
          const set = name.match(/^(.*?)\s+\(([A-Za-z0-9]+)\)\s+([\w-]+)$/);
          return set
            ? { set: set[2].toLowerCase(), collector_number: set[3] }
            : { name: name.split(" // ")[0] };
        }),
      }),
    });
    for (const card of body.data || []) {
      found.set(card.name.toLowerCase(), card);
      found.set(card.name.split(" // ")[0].toLowerCase(), card);
    }
    for (const item of body.not_found || []) missing.push(item.name || item.collector_number);
  }
  return { found, missing };
};
export const parseDeck = (text) => {
  const sections = { main: [], commander: [], sideboard: [] };
  let section = "main";
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const heading = line.toLowerCase().replace(/[:\s]+$/, "");
    if (/^(commander|commanders)$/.test(heading)) {
      section = "commander";
      continue;
    }
    if (/^(sideboard|maybeboard)$/.test(heading)) {
      section = "sideboard";
      continue;
    }
    if (/^(deck|main|mainboard|companion)$/.test(heading)) {
      section = "main";
      continue;
    }
    const match = line.match(/^(?:SB:\s*)?(\d+)x?\s+(.+?)(?:\s+\*([A-Z]+)\*)?$/);
    if (!match) continue;
    const target = line.startsWith("SB:") ? "sideboard" : match[3] === "CMDR" ? "commander" : section;
    sections[target].push({
      count: Math.min(250, Number(match[1])),
      name: match[2].trim(),
    });
  }
  return sections;
};
export const resolveDeck = async (sections) => {
  const names = [
    ...new Set(
      Object.values(sections)
        .flat()
        .map((entry) => entry.name),
    ),
  ];
  const { found, missing } = await collection(names);
  const result = {};
  for (const [key, entries] of Object.entries(sections))
    result[key] = entries.flatMap((entry) => {
      const plain = entry.name.replace(/\s+\([A-Za-z0-9]+\)\s+[\w-]+$/, "");
      const card =
        found.get(plain.toLowerCase()) ||
        found.get(plain.split(" // ")[0].toLowerCase());
      return card ? Array.from({ length: entry.count }, () => toSpec(card)) : [];
    });
  return { ...result, missing };
};
export const tokensFor = async (sid) => {
  const card = await byId(sid);
  const parts = (card.all_parts || []).filter(
    (part) =>
      part.id !== card.id &&
      (part.component === "token" ||
        (part.component === "combo_piece" && /Emblem/.test(part.type_line))),
  );
  const specs = [];
  for (const part of parts) specs.push(toSpec(await byId(part.id)));
  return specs;
};
