import { fetchJson, fetchText } from "./web.mjs";
import { parseDeck } from "./scryfall.mjs";

const fromBoards = (boards) => {
  const sections = { main: [], commander: [], sideboard: [] };
  const add = (section, board) => {
    for (const entry of Object.values(board?.cards || {}))
      if (entry?.card?.name)
        sections[section].push({ count: entry.quantity || 1, name: entry.card.name });
  };
  add("main", boards.mainboard);
  add("commander", boards.commanders);
  add("commander", boards.companions);
  add("sideboard", boards.sideboard);
  return sections;
};
const archidekt = (deck) => {
  const sections = { main: [], commander: [], sideboard: [] };
  const excluded = new Set(
    (deck.categories || [])
      .filter((category) => category.includedInDeck === false)
      .map((category) => category.name),
  );
  for (const entry of deck.cards || []) {
    const name = entry.card?.oracleCard?.name || entry.card?.name;
    if (!name) continue;
    const categories = entry.categories || [];
    const section = categories.includes("Commander")
      ? "commander"
      : categories.includes("Sideboard")
        ? "sideboard"
        : categories.some((category) => excluded.has(category))
          ? null
          : "main";
    if (section) sections[section].push({ count: entry.quantity || 1, name });
  }
  return sections;
};
const textDeck = async (url) => {
  const sections = parseDeck(await fetchText(url, "text/plain"));
  if (!sections.main.length && !sections.commander.length)
    throw new Error("No deck list was found at " + url);
  return sections;
};
export const isDeckUrl = (value) => /^https?:\/\/\S+$/i.test(value.trim());
export async function deckFromUrl(raw) {
  const url = new URL(raw.trim());
  const host = url.hostname.replace(/^www\./, "");
  const path = url.pathname.split("/").filter(Boolean);
  if (host.endsWith("moxfield.com")) {
    const id = path[path.indexOf("decks") + 1];
    const deck = await fetchJson("https://api2.moxfield.com/v3/decks/all/" + id);
    return { name: deck.name || "", ...fromBoards(deck.boards || {}) };
  }
  if (host.endsWith("archidekt.com")) {
    const id = path[path.indexOf("decks") + 1];
    const deck = await fetchJson("https://archidekt.com/api/decks/" + id + "/");
    return { name: deck.name || "", ...archidekt(deck) };
  }
  if (host === "scryfall.com" && path.includes("decks")) {
    const id = path[path.indexOf("decks") + 1];
    return { name: "", ...(await textDeck("https://api.scryfall.com/decks/" + id + "/export/text")) };
  }
  if (host.endsWith("tappedout.net")) {
    url.search = "?fmt=txt";
    return { name: path[path.length - 1] || "", ...(await textDeck(url.href)) };
  }
  if (host.endsWith("mtggoldfish.com")) {
    const id = path[path.indexOf("deck") + 1];
    return { name: "", ...(await textDeck("https://www.mtggoldfish.com/deck/download/" + id)) };
  }
  if (host.endsWith("deckstats.net")) {
    url.searchParams.set("export_txt", "1");
    return { name: "", ...(await textDeck(url.href)) };
  }
  if (host === "pastebin.com" && path[0] !== "raw")
    return { name: "", ...(await textDeck("https://pastebin.com/raw/" + path[path.length - 1])) };
  if (host.endsWith("cubecobra.com")) {
    const id = path[path.length - 1];
    return { name: id, ...(await textDeck("https://cubecobra.com/cube/download/plaintext/" + id)) };
  }
  if (host.endsWith("deckbox.org")) {
    const id = path[path.indexOf("sets") + 1];
    const html = await fetchText("https://deckbox.org/sets/" + id + "/export");
    const text = html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&#39;/g, "'");
    return { name: "", ...parseDeck(text) };
  }
  return { name: "", ...(await textDeck(url.href)) };
}
