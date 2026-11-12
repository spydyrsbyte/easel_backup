function parseDeckList(text) {
  const entries = [];
  let section = "main";
  for (const [index, raw] of String(text).split(/\r?\n/).entries()) {
    let line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith("//")) continue;
    const heading = line
      .replace(/[\[\]:]/g, "")
      .trim()
      .toLowerCase();
    if (["commander", "command", "commanders"].includes(heading)) {
      section = "command";
      continue;
    }
    if (["sideboard", "side"].includes(heading)) {
      section = "sideboard";
      continue;
    }
    if (["main", "mainboard", "deck"].includes(heading)) {
      section = "main";
      continue;
    }
    let rowSection = section;
    if (/^SB:\s*/i.test(line)) {
      rowSection = "sideboard";
      line = line.replace(/^SB:\s*/i, "");
    }
    const match = line.match(/^(\d+)\s*x?\s+(.+)$/i);
    if (!match)
      throw new Error(
        `Line ${index + 1}: use a quantity followed by a card name.`,
      );
    const name = match[2]
      .replace(/\s+\([A-Za-z0-9]+\)\s*[A-Za-z0-9-]*\s*\*?[Ff]?\*?$/, "")
      .trim();
    const quantity = Number(match[1]);
    if (
      !name ||
      !Number.isSafeInteger(quantity) ||
      quantity < 1 ||
      quantity > 250
    )
      throw new Error(`Line ${index + 1}: invalid name or quantity.`);
    const existing = entries.find(
      (e) =>
        e.name.toLowerCase() === name.toLowerCase() && e.section === rowSection,
    );
    if (existing) existing.quantity += quantity;
    else entries.push({ name, quantity, section: rowSection });
  }
  if (!entries.length) throw new Error("Paste a deck list first.");
  if (entries.reduce((sum, e) => sum + e.quantity, 0) > 250)
    throw new Error("A deck may contain up to 250 cards.");
  return entries;
}
function formatDeckList(entries = []) {
  return ["command", "main", "sideboard"]
    .map((section) => {
      const rows = entries.filter((e) => e.section === section);
      return rows.length
        ? `${{ command: "Commander", main: "Deck", sideboard: "Sideboard" }[section]}
${rows.map((e) => `${e.quantity} ${e.name}`).join("\n")}`
        : "";
    })
    .filter(Boolean)
    .join("\n\n");
}
export { formatDeckList, parseDeckList };
