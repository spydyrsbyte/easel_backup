import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const library = fileURLToPath(new URL("../server/easel/server/library/", import.meta.url));
const S = (value = "") => ({ type: "String", default: value });
const B = (value = false) => ({ type: "Boolean", default: value });
const N = (value = 0) => ({ type: "Number", default: value });
const I = (value = 0) => ({ type: "Integer", default: value });
const A = (value = []) => ({ type: "Array", default: value });
const O = (value = {}) => ({ type: "Object", default: value });
const id = { id: "String" };

const members = [
  {
    kit: "layout", name: "tabletop", version: 1, entry: "client/tabletop.mjs",
    description: "Full-screen table frame: a canvas that fills the view with a tool rail, scene bar, hotbar, player list, sidebar, floating windows, toasts, and a turn banner laid over it.",
    properties: { sidebarOpen: B(true), sidebarWidth: N(340), toasts: A(), banner: O() },
    events: { sidebarToggle: { open: "Boolean" }, toastDismiss: id, insets: { insets: "Object" } },
    slots: ["canvas", "top", "rail", "bottom", "corner", "status", "sidebar", "windows"],
  },
  {
    kit: "layout", name: "window", version: 2, entry: "client/window2.mjs", file: "window2",
    description: "Floating window that is dragged by its title bar, resized from its corner, minimized, raised on click, and closed with Escape.",
    properties: { title: S(), subtitle: S(), icon: S(), x: N(80), y: N(80), width: N(420), height: N(480), minimized: B(), closable: B(true), resizable: B(true) },
    events: { move: { x: "Number", y: "Number" }, resize: { width: "Number", height: "Number" }, close: {}, focus: {}, minimize: { minimized: "Boolean" } },
    slots: ["content"],
  },
  {
    kit: "layout", name: "sidebar", version: 1, entry: "client/sidebar.mjs",
    description: "Icon-tabbed side panel. Each tab shows the attached child whose component id it names.",
    properties: { tabs: A(), active: S() },
    events: { select: id },
    slots: ["panels", "actions"],
  },
  {
    kit: "input", name: "toolrail", version: 1, entry: "client/toolrail.mjs",
    description: "Icon tool palette with exclusive tools, toggles, one-shot actions, grouped flyouts, tooltips, and single-key shortcuts.",
    properties: { tools: A(), active: S("select"), orientation: S("vertical"), shortcuts: B(true) },
    events: { select: id, toggle: { id: "String", on: "Boolean" }, action: id },
  },
  {
    kit: "input", name: "hotbar", version: 1, entry: "client/hotbar.mjs",
    description: "Numbered quick-use bar. Slots are used by click or number key, filled by drop, and edited from a menu.",
    properties: { slots: A(), size: I(10), shortcuts: B(true) },
    events: { use: { index: "Integer", id: "String" }, assign: { index: "Integer" }, clear: { index: "Integer" }, drop: { index: "Integer", data: "Object" } },
  },
  {
    kit: "input", name: "form", version: 1, entry: "client/form.mjs",
    description: "Property form built from a list of field descriptions: text, number, range, colour, switch, segment, select, image, textarea, and action rows.",
    properties: { fields: A(), values: O(), actions: A(), readOnly: B(), emptyText: S(), emptyIcon: S("pointer") },
    events: { change: { id: "String", value: "Object" }, file: { id: "String", file: "Object" }, action: id, submit: { values: "Object" } },
  },
  {
    kit: "maps", name: "scenenav", version: 1, entry: "client/scenenav.mjs",
    description: "Scene bar showing which scene players are in and which one the viewer is looking at, with game master actions.",
    properties: { scenes: A(), viewing: S(), gm: B() },
    events: { view: id, activate: id, action: { id: "String", action: "String" }, create: {} },
  },
  {
    kit: "maps", name: "layertree", version: 1, entry: "client/layertree.mjs",
    description: "Tree of layers or scene elements with selection, visibility switches, hover preview, and a context menu.",
    properties: { nodes: A(), selected: S(), actions: A(), emptyText: S() },
    events: { select: { id: "String", kind: "String" }, visibility: { id: "String", visible: "Boolean" }, preview: id, action: { id: "String", action: "String" } },
  },
  {
    kit: "narrative", name: "chat", version: 1, entry: "client/chat.mjs",
    description: "Chat log and composer with grouped messages, roll cards, whisper and roll modes, quick dice, message history, and a new-messages jump.",
    properties: { messages: A(), members: A(), userId: S(), mode: S("public"), modes: A(["public", "gm", "blind", "self"]), quickDice: A(), readOnly: B(), placeholder: S(), emptyText: S() },
    events: { send: { text: "String", mode: "String" }, mode: { mode: "String" }, cardAction: { messageId: "String", action: "String", payload: "Object" } },
  },
  {
    kit: "narrative", name: "journal", version: 2, entry: "client/journal2.mjs", file: "journal2",
    description: "Journal page that reads as formatted text and edits as plain text, with a private or shared switch.",
    properties: { entry: O(), canEdit: B() },
    events: { save: { name: "String", content: "String", playerVisible: "Boolean" } },
  },
  {
    kit: "combat", name: "tracker", version: 1, entry: "client/tracker.mjs",
    description: "Encounter tracker: initiative order, the current turn, health bars, round counter, and game master controls.",
    properties: { combat: O(), gm: B() },
    events: { start: {}, end: {}, next: {}, previous: {}, rollAll: {}, addSelected: {}, select: { id: "String", tokenId: "String" }, roll: id, defeated: { id: "String", defeated: "Boolean" }, remove: id, initiative: { id: "String", initiative: "Number" } },
  },
  {
    kit: "collections", name: "browser", version: 2, entry: "client/browser2.mjs", file: "browser2",
    description: "Searchable directory with folders, thumbnails, badges, per-entry menus, and entries that drag onto a map or into a folder.",
    properties: { items: A(), folders: A(), selected: S(), kind: S(), icon: S("file"), canCreate: B(), canManage: B(), allowFolders: B(true), draggable: B(true), createLabel: S("New"), placeholder: S("Search"), emptyTitle: S("Nothing here yet"), emptyText: S(), actions: A() },
    events: { select: id, open: id, create: { folderId: "String" }, createFolder: { parentId: "String" }, action: { id: "String", action: "String" }, folderAction: { id: "String", action: "String" }, move: { id: "String", folderId: "String" } },
  },
  {
    kit: "characters", name: "statsheet", version: 1, entry: "client/statsheet.mjs",
    description: "Character sheet drawn from a layout description: portrait and name, tabs, rollable statistics, resource bars, field rows, editable lists, and notes.",
    properties: { actor: O(), layout: O(), values: O(), readOnly: B() },
    events: { change: { path: "String", value: "Object" }, roll: { id: "String", label: "String", modifier: "Number" }, image: { file: "Object" }, rename: { name: "String" }, listAdd: id, listRemove: { id: "String", index: "Integer" } },
  },
  {
    kit: "display", name: "players", version: 1, entry: "client/players.mjs",
    description: "Compact list of the people at the table with presence, colour, and role.",
    properties: { players: A() },
    events: { select: id },
  },
  {
    kit: "surfaces", name: "gameboard", version: 1, entry: "client/gameboard.mjs",
    description: "Grid game board with sliding pieces, click or drag moves, legal-move hints, last-move and marked squares, coordinates, keyboard play, and a flipped view.",
    properties: { columns: I(8), rows: I(8), pattern: S("checker"), theme: S("walnut"), pieces: A(), selected: I(-1), targets: A(), last: A(), marks: A(), flipped: B(), interactive: B(), coordinates: B(true) },
    events: { square: { index: "Integer", name: "String" }, pick: { index: "Integer" }, move: { from: "Integer", to: "Integer" } },
  },
  {
    kit: "layout", name: "gametable", version: 1, entry: "client/gametable.mjs",
    description: "Board game frame: a board that fills the space between two seats, a side panel with a status line and action buttons, a result card, and toasts.",
    properties: { status: S(), detail: S(), statusIcon: S(), statusTone: S(), actions: A(), result: O(), toasts: A() },
    events: { action: id, resultAction: id, toastDismiss: id },
    slots: ["top", "board", "bottom", "sidebar"],
  },
  {
    kit: "display", name: "seat", version: 1, entry: "client/seat.mjs",
    description: "Player seat: who sits there, whose turn it is, a running clock, captured pieces, and sit or leave controls.",
    properties: { name: S(), image: S(), color: S(), label: S(), swatch: S(), status: S(), open: B(), you: B(), turn: B(), canSit: B(), canLeave: B(), sitLabel: S("Sit here"), clock: B(true), elapsed: N(), running: B(), startedAt: N(), limit: N(), captured: A(), advantage: S() },
    events: { sit: {}, leave: {} },
  },
  {
    kit: "display", name: "movelist", version: 1, entry: "client/movelist.mjs",
    description: "Numbered move record laid out in one column per player, following the latest move.",
    properties: { moves: A(), columns: I(2), current: S(), emptyText: S() },
    events: { select: id },
  },
];

for (const member of members) {
  const dir = path.join(library, member.kit);
  const file = (member.file || member.name) + ".json";
  const contract = {
    kind: "component",
    properties: { disabled: B(), ...member.properties },
    events: Object.fromEntries(Object.entries(member.events).map(([name, payload]) => [name, { payload }])),
    slots: Object.fromEntries((member.slots || []).map((slot) => [slot, {}])),
  };
  fs.writeFileSync(path.join(dir, "interfaces", file), JSON.stringify(contract, null, 2) + "\n");
  const manifestPath = path.join(dir, "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const name = member.name + "@" + member.version;
  manifest.client.interfaces = manifest.client.interfaces.filter((entry) => entry.name !== name);
  manifest.client.interfaces.push({ name, file: "interfaces/" + file, "http-entry": member.entry, ...(member.required ? { required: member.required } : {}) });
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  const catalogPath = path.join(dir, "catalog.json");
  const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
  catalog.members = catalog.members.filter((entry) => !(entry.name === member.name && entry.side === "client" && (entry.version || 1) === member.version));
  const contractDoc = "contracts/" + (member.file || member.name) + ".client.md";
  catalog.members.push({ name: member.name, side: "client", version: member.version, description: member.description, status: "used", dependencies: ["browser DOM"], entry: member.entry, contract: "interfaces/" + file, renderer: member.name, checks: ["scripts/test-kit-browser.mjs"], documentation: contractDoc, events: Object.keys(member.events) });
  fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2) + "\n");
  const lines = ["# easel." + member.kit + "." + member.name + "@" + member.version, "", member.description, "", "## Properties", "", "| Property | Type | Default |", "|---|---|---|"];
  for (const [key, rule] of Object.entries(contract.properties)) lines.push("| `" + key + "` | " + rule.type + " | `" + JSON.stringify(rule.default) + "` |");
  lines.push("", "## Events", "", "| Event | Payload |", "|---|---|");
  for (const [key, payload] of Object.entries(member.events)) lines.push("| `" + key + "` | " + (Object.keys(payload).length ? Object.entries(payload).map(([field, type]) => "`" + field + "` " + type).join(", ") : "none") + " |");
  if ((member.slots || []).length) lines.push("", "## Slots", "", member.slots.map((slot) => "`" + slot + "`").join(", "));
  const docPath = path.join(dir, contractDoc);
  if (!fs.existsSync(docPath) || fs.readFileSync(docPath, "utf8").startsWith("# easel.")) fs.writeFileSync(docPath, lines.join("\n") + "\n");
}
console.log("registered " + members.length + " components");
