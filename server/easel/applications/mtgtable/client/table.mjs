import { TableCanvas } from "./canvas.mjs";
import * as scryfall from "./scryfall.mjs";
import { deckFromUrl, isDeckUrl } from "./decks.mjs";
import { proxied } from "./web.mjs";

const el = (tag, classes, value) => {
  const node = document.createElement(tag);
  if (classes) node.className = classes;
  if (value !== undefined) node.textContent = value;
  return node;
};
const button = (label, run, classes = "button secondary compact") => {
  const node = el("button", classes, label);
  node.type = "button";
  node.addEventListener("click", run);
  return node;
};
const seatCss = {
  White: "#ffffff",
  Red: "#db1a18",
  Yellow: "#e7e52c",
  Green: "#31b32b",
  Blue: "#1f87ff",
  Purple: "#a020f0",
};
const keywordList = [
  "Deathtouch",
  "Defender",
  "Double Strike",
  "First Strike",
  "Flying",
  "Haste",
  "Hexproof",
  "Indestructible",
  "Lifelink",
  "Menace",
  "Reach",
  "Trample",
  "Vigilance",
  "Exerted",
  "Frozen",
  "Monstrous",
  "Renowned",
  "Goaded",
  "Phased Out",
];
const helpText = [
  ["Left click a table button", "Draw, scry, mill, reveal or untap once. Right click does three cards, or type a number while hovering."],
  ["Reveal button", "Right click swaps between fanned-out and stacked reveal."],
  ["Mulligan", "Left click is a friendly mulligan to seven, right click an unfriendly one."],
  ["Drag a deck", "Takes the top card. Hold Shift (or press and hold) to move the whole deck."],
  ["Drag from a bag", "Takes a new counter, die or marker. Drop it back on a bag to delete it."],
  ["F / Q / E", "Flip, rotate left, rotate right (tap) the hovered or selected objects."],
  ["R / G / Delete", "Shuffle a deck or roll a die, group selected cards into a deck, delete."],
  ["Type a number", "Over a deck to deal that many cards to your hand, over a counter or life total to set it."],
  ["Numpad 1-9, 0", "Untap, draw, scry, mill, fanned reveal, stacked reveal, graveyard, exile, bottom of library, end turn."],
  ["Alt / Inspect card", "Hold Alt over any visible card or choose Inspect card from its context menu. Escape closes it."],
  ["[ / ]", "Rotate your view. Use View player area to focus across the table."],
  ["Wheel / right drag", "Zoom and pan the camera. Middle drag also pans."],
];

let Implementation;
export { Implementation as default };

export async function initialize({ Easel }) {
  if (!document.querySelector("link[data-mtgtable-style]")) {
    const style = el("link");
    style.rel = "stylesheet";
    style.href = new URL("./style.css", import.meta.url).href;
    style.dataset.mtgtableStyle = "true";
    document.head.append(style);
  }
  const base = new URL("./", import.meta.url);
  const layout = await (await fetch(new URL("./layout.json", import.meta.url))).json();
  const pixi = Easel.Interfaces.create("easel.graphics.pixi@1");
  const asset = (name) => (/^https?:\/\//.test(name || "") ? proxied(name) : new URL("assets/" + name, base).href);
  const storedBack = () => {
    try {
      return localStorage.getItem("easel.mtgtable.back") || "";
    } catch {
      return "";
    }
  };
  const withBack = (specs) => {
    const back = storedBack();
    return back ? specs.map((spec) => ({ ...spec, back })) : specs;
  };

  class MtgTable {
    constructor() {
      this.element = el("section", "mtgt-workspace play-workspace");
      this.serial = 0;
      this.pending = new Map();
      this.local = [];
      this.seenLog = 0;
      this.toolbar = el("div", "mtgt-toolbar");
      this.surface = el("div", "mtgt-canvas");
      this.preview = el("aside", "mtgt-preview");
      this.zoomed = el("div", "mtgt-zoom");
      this.cameraSlot = el("div", "mtgt-kit-camera");
      this.toolbar.append(this.cameraSlot);
      this.slots = { camera: this.cameraSlot, inspection: this.zoomed };
      this.zoomed.addEventListener("click", () => this.zoom(null));
      this.chatPanel = el("section", "mtgt-chat");
      this.panel = el("section", "mtgt-panel");
      this.panel.hidden = true;
      this.menuNode = el("ul", "mtgt-menu");
      this.menuNode.hidden = true;
      this.banner = el("div", "mtgt-banner");
      this.error = el("p", "mtgt-error");
      this.error.setAttribute("role", "alert");
      this.element.append(this.surface, this.toolbar, this.preview, this.zoomed, this.chatPanel, this.panel, this.banner, this.error, this.menuNode);
      this.buildChat();
      this.closeMenu = (event) => {
        if (!this.menuNode.contains(event.target)) this.hideMenu();
      };
      document.addEventListener("pointerdown", this.closeMenu, true);
      this.canvas = new TableCanvas(this.surface, pixi, layout, base, {
        act: (action, payload) => this.perform(action, payload),
        menu: (item, x, y, point) => this.menu(item, x, y, point),
        hover: (item) => this.showPreview(item),
        zoom: (item) => this.zoom(item),
        edit: (item) => this.editText(item),
        ask: (label, value) => prompt(label, value),
        mulligan: (unfriendly) => this.mulligan(unfriendly),
      });
      this.canvas.ready.catch((error) => {
        this.error.textContent = "The table could not start: " + error.message;
      });
    }
    ask(action, payload = {}) {
      const request = "mtgt-" + ++this.serial;
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          this.pending.delete(request);
          reject(new Error("The table request timed out."));
        }, 30000);
        this.pending.set(request, { resolve, reject, timeout });
        this.onEvent?.("action", { request, payload: { ...payload, action } });
      });
    }
    perform(action, payload = {}) {
      return this.ask(action, payload).then(
        (result) => {
          if (result?.search !== undefined) this.showSearch(result.search);
          return result;
        },
        (error) => {
          if (!this.dead) this.flashError(error.message);
          return null;
        },
      );
    }
    flashError(message) {
      this.error.textContent = message;
      clearTimeout(this.errorTimer);
      this.errorTimer = setTimeout(() => (this.error.textContent = ""), 6000);
    }
    update(props) {
      this.props = props;
      const command = props.cameraCommand;
      if (command?.id && command.id !== this.lastCameraCommand) {
        this.lastCameraCommand = command.id;
        if (command.type === "closeInspection") this.zoom(null);
        else this.canvas.ready.then(() => {
          if (command.type === "rotate") this.canvas.rotate(command.degrees);
          if (command.type === "view") this.canvas.view(command.seat ? "seat" : "table", command.seat || this.state?.viewer);
          if (command.type === "zoom") {
            const rect = this.canvas.app.canvas.getBoundingClientRect();
            this.canvas.wheel({ preventDefault() {}, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2, deltaY: command.factor > 1 ? -1 : 1 });
          }
        });
      }
      if (props.response?.request && props.response.request !== this.lastResponse) {
        this.lastResponse = props.response.request;
        const pending = this.pending.get(props.response.request),
          result = props.response.result;
        if (pending) {
          clearTimeout(pending.timeout);
          this.pending.delete(props.response.request);
          if (result?.declined) pending.reject(new Error(result.result));
          else pending.resolve(result);
        }
      }
      if (props.error) this.flashError(props.error);
      const state = props.state;
      if (!state?.objects) return;
      const key = props.revision + ":" + state.viewer;
      if (key === this.stateKey) return;
      this.stateKey = key;
      this.state = state;
      this.canvas.ready.then(() => this.canvas.update(state, state.viewer));
      this.renderToolbar();
      this.renderLog();
    }
    renderToolbar() {
      const state = this.state;
      const title = el("div", "mtgt-title");
      title.append(el("span", "eyebrow", "TABLETOP"), el("h2", "", "MTG"));
      const seats = el("div", "mtgt-seats");
      for (const color of layout.colors) {
        const seat = state.seats[color];
        const chip = button(seat.user ? seat.name : color, () => {
          if (!seat.user) this.perform("sit", { seat: color });
          else if (color === state.viewer && confirm("Leave the " + color + " seat?")) this.perform("stand");
        }, "mtgt-seat" + (color === state.viewer ? " mine" : "") + (seat.user ? " taken" : ""));
        chip.style.setProperty("--seat", seatCss[color]);
        chip.title = seat.user ? color + ": " + seat.name : "Sit at " + color;
        const life = el("span", "mtgt-seat-life", String(state.players[color].life));
        if (seat.user) chip.append(life);
        if (state.turn?.enabled && state.turn.color === color) chip.classList.add("turn");
        seats.append(chip);
      }
      const turn = el("div", "mtgt-turn");
      if (state.turn?.enabled) {
        turn.append(el("span", "", "Turn: " + (state.seats[state.turn.color].name || state.turn.color)));
        if (state.turn.color === state.viewer) turn.append(button("End turn", () => this.perform("turn")));
      } else if (state.viewer) turn.append(button("Start turns", () => this.perform("turn")));
      const tools = el("div", "mtgt-tools");
      tools.append(
        button("Deck importer", () => this.showImporter()),
        button("Card spawner", () => this.showSpawner()),
        button("Chat", () => {
          this.chatPanel.hidden = !this.chatPanel.hidden;
        }),
        button("Help", () => this.showHelp()),
        button("My seat", () => this.canvas.view("seat")),
        this.cameraSlot,
      );
      if (this.props.manage)
        tools.append(
          button("Reset table", () => {
            if (confirm("Reset every card, counter and deck on the table?")) this.perform("reset");
          }),
        );
      this.toolbar.replaceChildren(title, seats, turn, tools);
    }
    buildChat() {
      this.logList = el("ol", "mtgt-log");
      const form = el("form", "mtgt-chat-form");
      this.chatInput = el("input");
      this.chatInput.placeholder = "Chat, or type a command (scryfall help)";
      this.chatInput.maxLength = 2000;
      this.chatInput.setAttribute("aria-label", "Chat message");
      form.append(this.chatInput, button("Send", () => form.requestSubmit(), "button primary compact"));
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const message = this.chatInput.value.trim();
        if (!message) return;
        this.chatInput.value = "";
        this.chat(message);
      });
      this.chatPanel.append(this.logList, form);
    }
    say(message) {
      this.local.push({ t: Date.now(), text: message, local: true });
      this.renderLog();
    }
    renderLog() {
      if (!this.state) return;
      const entries = [...this.state.log.map((entry) => ({ ...entry, t: entry.t - (this.state.now - Date.now()) })), ...this.local].sort((a, b) => a.t - b.t).slice(-200);
      const atBottom = this.logList.scrollHeight - this.logList.scrollTop - this.logList.clientHeight < 40;
      this.logList.replaceChildren(
        ...entries.map((entry) => {
          const row = el("li", entry.kind === "chat" ? "chat" : entry.local ? "local" : entry.to ? "private" : "broadcast");
          if (entry.kind === "chat") {
            const who = el("strong", "", (entry.meta?.name || "Spectator") + ": ");
            who.style.color = seatCss[entry.color] || "#aaaaaa";
            row.append(who, document.createTextNode(entry.text));
          } else {
            row.textContent = entry.text;
            if (seatCss[entry.color]) row.style.color = seatCss[entry.color];
          }
          return row;
        }),
      );
      if (atBottom) this.logList.scrollTop = this.logList.scrollHeight;
      const fresh = this.state.log.filter((entry) => entry.kind !== "chat" && entry.t > this.seenLog);
      if (this.seenLog && fresh.length) {
        const latest = fresh[fresh.length - 1];
        this.banner.textContent = latest.text;
        this.banner.style.color = seatCss[latest.color] || "#ffffff";
        this.banner.classList.add("show");
        clearTimeout(this.bannerTimer);
        this.bannerTimer = setTimeout(() => this.banner.classList.remove("show"), 4000);
      }
      this.seenLog = Math.max(this.seenLog, ...this.state.log.map((entry) => entry.t), 1);
    }
    async chat(message) {
      const playmat = message.match(/^playmat\s+(\S+)$/i);
      if (playmat) return this.perform("playmat", { url: /^(clear|off|none)$/i.test(playmat[1]) ? "" : playmat[1] });
      const command = message.match(/^scryfall\s+(.*)$/i);
      if (!command) return this.perform("chat", { message });
      this.perform("chat", { message });
      try {
        await this.scryfallCommand(command[1].trim());
      } catch (error) {
        this.say(error.message);
      }
    }
    async scryfallCommand(text) {
      const [word, ...rest] = text.split(/\s+/);
      const argument = rest.join(" ");
      const lowerWord = word.toLowerCase();
      if (lowerWord === "help")
        return this.say(
          "Scryfall commands: scryfall <cardname> · scryfall print <cardname> · scryfall text <cardname> · scryfall legal <cardname> · scryfall rules <cardname> · scryfall search <syntax> · scryfall random <syntax> <quantity>",
        );
      if (lowerWord === "back") {
        if (!/^https?:\/\//.test(argument)) return this.say("Use: scryfall back <image URL>");
        try {
          localStorage.setItem("easel.mtgtable.back", argument);
        } catch {}
        return this.say("Card backs for your imports are now " + argument);
      }
      if (lowerWord === "clear" && /^back/i.test(argument)) {
        try {
          localStorage.removeItem("easel.mtgtable.back");
        } catch {}
        return this.say("Card backs reset to default.");
      }
      if (lowerWord === "clear" && /^queue/i.test(argument)) return this.say("The import queue is empty.");
      if (lowerWord === "quality") return this.say("Card images always use Scryfall's large quality.");
      if (lowerWord === "deck") return this.say("Paste the deck list or link into the Deck importer.");
      if (/^https?:\/\//.test(word)) {
        if (argument) {
          const card = await scryfall.named(argument);
          return this.spawnSpecs([{ ...scryfall.toSpec(card), face: word }], "main");
        }
        if (/\.(png|jpe?g|webp|gif)(\?|$)/i.test(word)) return this.spawnSpecs([{ name: "Custom card", type: "", cmc: 0, oracle: "", face: word }], "main");
        return this.importFromUrl(word);
      }
      if (lowerWord === "print") {
        const cards = await scryfall.search('!"' + argument + '"', { unique: "prints", order: "released" });
        return this.spawnSpecs(cards.slice(0, 24).map(scryfall.toSpec), "part");
      }
      if (lowerWord === "text") {
        const card = await scryfall.named(argument);
        return this.perform("chat", { message: card.name + ": " + scryfall.toSpec(card).oracle });
      }
      if (lowerWord === "legal") {
        const card = await scryfall.named(argument);
        const legal = Object.entries(card.legalities || {}).filter(([, value]) => value === "legal").map(([format]) => format);
        return this.perform("chat", { message: card.name + " is legal in: " + (legal.join(", ") || "nothing") });
      }
      if (lowerWord === "rules") {
        const card = await scryfall.named(argument);
        const rulings = await scryfall.rulings(card);
        if (!rulings.length) return this.say(card.name + " has no rulings.");
        return this.perform("chat", { message: card.name + " rulings:\n" + rulings.map((ruling) => "• " + ruling.comment).join("\n").slice(0, 1900) });
      }
      if (lowerWord === "search") {
        const cards = await scryfall.search(argument);
        return this.spawnSpecs(cards.slice(0, 100).map(scryfall.toSpec), "part", true);
      }
      if (lowerWord === "random") {
        const quantity = Number(rest[rest.length - 1]);
        const query = Number.isFinite(quantity) ? rest.slice(0, -1).join(" ") : argument;
        const count = Number.isFinite(quantity) ? Math.max(1, Math.min(20, quantity)) : 1;
        const specs = [];
        for (let index = 0; index < count; index++) specs.push(scryfall.toSpec(await scryfall.random(query.replace(/^\?q=/, ""))));
        return this.spawnSpecs(specs, "main");
      }
      const card = await scryfall.named(text);
      await this.spawnSpecs([scryfall.toSpec(card)], "main");
    }
    spawnSpecs(specs, at, deck = false) {
      if (!this.state?.viewer) return this.say("Take a seat to spawn cards.");
      if (!specs.length) return this.say("Your query didn't match any cards.");
      return this.perform("spawn", { cards: withBack(specs), at, deck: deck || specs.length > 6, name: "" });
    }
    async importDeck(source, title, progress = () => {}) {
      let sections,
        name = title;
      if (isDeckUrl(source)) {
        progress("Reading the deck from " + source.trim() + "…");
        sections = await deckFromUrl(source);
        name = name || sections.name;
      } else sections = scryfall.parseDeck(source);
      progress("Looking up cards on Scryfall…");
      const resolved = await scryfall.resolveDeck({ main: sections.main, commander: sections.commander, sideboard: sections.sideboard });
      const result = await this.perform("import", { name, main: withBack(resolved.main), commander: withBack(resolved.commander), sideboard: withBack(resolved.sideboard) });
      return result ? resolved : null;
    }
    async importFromUrl(url) {
      if (!this.state?.viewer) return this.say("Take a seat to import a deck.");
      const resolved = await this.importDeck(url, "", (text) => this.say(text));
      if (resolved) this.say("Imported " + resolved.main.length + " cards." + (resolved.missing.length ? " Not found: " + resolved.missing.join(", ") : ""));
    }
    showPreview(item) {
      const object = item?.object;
      let face = null;
      if (object && (item.type === "object" || item.type === "hand")) {
        if (object.kind === "card" && object.card && !object.faceDown) face = object.transformed && object.card.dfc ? object.card.dfc : object.card;
        if (object.kind === "deck" && object.top) face = object.top;
      }
      this.previewFace = face;
      if (!face) {
        this.preview.classList.remove("show");
        return;
      }
      const image = el("img");
      image.src = asset(face.face || layout.images.back);
      image.alt = face.name;
      const details = el("div", "mtgt-preview-text");
      details.append(el("strong", "", face.name), el("span", "", face.type || ""), el("p", "", face.oracle || ""));
      this.preview.replaceChildren(image, details);
      this.preview.classList.add("show");
    }
    zoom(item, pinned = false) {
      if (item) this.showPreview(item);
      const open = !!item && !!this.previewFace;
      this.zoomed.classList.toggle("pinned", open && pinned);
      this.zoomed.classList.toggle("show", open);
      const face = open ? this.previewFace : null;
      this.onEvent?.("inspection", { open, pinned: open && pinned, data: face ? { name: face.name, type: face.type || "", oracle: face.oracle || "", image: asset(face.face || layout.images.back), faceUp: true } : {} });
    }
    openPanel(title, ...children) {
      const header = el("header", "mtgt-panel-header");
      header.append(el("h3", "", title), button("×", () => (this.panel.hidden = true), "icon-button"));
      header.lastChild.setAttribute("aria-label", "Close");
      const body = el("div", "mtgt-panel-body");
      body.append(...children);
      this.panel.replaceChildren(header, body);
      this.panel.hidden = false;
      return body;
    }
    showImporter() {
      const name = el("input");
      name.placeholder = "Deck name";
      const list = el("textarea");
      list.rows = 14;
      list.placeholder = "Paste a deck link (Moxfield, Archidekt, TappedOut, MTGGoldfish, Scryfall, Deckstats, Deckbox, CubeCobra, Pastebin) or a list:\n\n1 Sol Ring\n1 Command Tower\n...\n\nCommander\n1 Atraxa, Praetors' Voice\n\nSideboard\n1 Swords to Plowshares";
      list.value = this.draftDeck || "";
      list.addEventListener("input", () => (this.draftDeck = list.value));
      const status = el("p", "muted", "Add a deck link or a deck list in standard text format. The library goes into your library zone, commanders into your commander zones.");
      const submit = button("Import", async () => {
        if (!this.state.viewer) return (status.textContent = "Take a seat first.");
        submit.disabled = true;
        status.textContent = "Looking up cards on Scryfall…";
        try {
          const resolved = await this.importDeck(list.value, name.value.trim(), (text) => (status.textContent = text));
          status.textContent = resolved ?"Imported " + resolved.main.length + " cards." + (resolved.missing.length ? " Not found: " + resolved.missing.join(", ") : "") : "The import failed.";
        } catch (error) {
          status.textContent = error.message;
        } finally {
          submit.disabled = false;
        }
      }, "button primary");
      this.openPanel("MTG Deck Importer", name, list, submit, status);
    }
    showSpawner() {
      const field = (label) => {
        const input = el("input");
        input.setAttribute("aria-label", label);
        const wrapper = el("label", "mtgt-field");
        wrapper.append(el("span", "", label), input);
        return [wrapper, input];
      };
      const [nameRow, nameInput] = field("Name");
      const [cmcRow, cmcInput] = field("CMC");
      const [powerRow, powerInput] = field("Power");
      const [toughnessRow, toughnessInput] = field("Toughness");
      const colors = el("div", "mtgt-colors");
      const chosen = new Set();
      for (const [code, image] of [["W", "ui-white.png"], ["U", "ui-blue.png"], ["B", "ui-black.png"], ["R", "ui-red.png"], ["G", "ui-green.png"], ["C", "ui-colorless.png"]]) {
        const toggle = button("", () => {
          if (chosen.has(code)) chosen.delete(code);
          else chosen.add(code);
          toggle.classList.toggle("on", chosen.has(code));
        }, "mtgt-mana");
        const icon = el("img");
        icon.src = asset(image);
        icon.alt = code;
        toggle.append(icon);
        colors.append(toggle);
      }
      const kind = el("div", "mtgt-kind");
      let type = "other";
      for (const option of ["token", "emblem", "other"]) {
        const label = el("label");
        const radio = el("input");
        radio.type = "radio";
        radio.name = "mtgt-spawn-type";
        radio.checked = option === "other";
        radio.addEventListener("change", () => (type = option));
        label.append(radio, document.createTextNode(" " + option[0].toUpperCase() + option.slice(1)));
        kind.append(label);
      }
      const status = el("p", "muted");
      const go = button("Search", async () => {
        let query = nameInput.value.trim();
        if (cmcInput.value) query += " cmc=" + cmcInput.value.trim();
        if (powerInput.value) query += " power=" + powerInput.value.trim();
        if (toughnessInput.value) query += " toughness=" + toughnessInput.value.trim();
        if (chosen.size) {
          query += " color:" + [...chosen].join("");
          const excluded = ["W", "U", "B", "R", "G", "C"].filter((code) => !chosen.has(code));
          if (excluded.length) query += " (" + excluded.map((code) => "-c:" + code).join(" AND ") + ")";
        }
        if (type === "token") query += " layout=token";
        if (type === "emblem") query += " layout=emblem";
        status.textContent = "Searching…";
        try {
          const cards = await scryfall.search(query.trim(), { extras: type !== "other" });
          const spec = scryfall.toSpec(cards[0]);
          await this.spawnSpecs([spec], "part");
          if (spec.sid && type === "other") {
            const tokens = await scryfall.tokensFor(spec.sid).catch(() => []);
            if (tokens.length) await this.spawnSpecs(tokens, "main");
          }
          status.textContent = "Spawned " + cards[0].name + ".";
        } catch (error) {
          status.textContent = error.message;
        }
      }, "button primary");
      const typeRow = el("label", "mtgt-field");
      typeRow.append(el("span", "", "Type"), kind);
      const colorRow = el("label", "mtgt-field");
      colorRow.append(el("span", "", "Color"), colors);
      this.openPanel("MTG Card Spawner", nameRow, cmcRow, powerRow, toughnessRow, colorRow, typeRow, go, status);
    }
    showHelp() {
      const list = el("dl", "mtgt-help");
      for (const [term, description] of helpText) list.append(el("dt", "", term), el("dd", "", description));
      const instructions = el("img", "mtgt-help-image");
      instructions.src = asset(layout.images.instructions);
      instructions.alt = "Table instructions";
      const commands = el("img", "mtgt-help-image");
      commands.src = asset(layout.images.commands);
      commands.alt = "Chat commands";
      this.openPanel("Table instructions", list, instructions, commands);
    }
    showSearch(search) {
      if (!search) {
        this.panel.hidden = true;
        return;
      }
      const grid = el("div", "mtgt-search");
      for (const entry of search.cards) {
        const tile = el("figure", "mtgt-search-card");
        const image = el("img");
        image.src = asset(entry.card.face || layout.images.back);
        image.alt = entry.card.name;
        image.loading = "lazy";
        const actions = el("figcaption");
        actions.append(
          button("Hand", () => this.perform("pick", { id: search.id, card: entry.id, toHand: { index: 0 } })),
          button("Table", () => this.perform("pick", { id: search.id, card: entry.id })),
        );
        tile.append(image, actions);
        grid.append(tile);
      }
      this.openPanel("Search (" + search.cards.length + " cards)", grid);
    }
    valuePanel() {
      const value = el("input");
      value.type = "number";
      value.min = "0";
      value.placeholder = "here";
      const repeat = el("input");
      repeat.type = "number";
      repeat.min = "1";
      repeat.placeholder = "X";
      const row = el("label", "mtgt-field");
      row.append(el("span", "", "repeat X times"), repeat);
      const okay = button("✓", () => {
        if (value.value === "") return;
        this.panel.hidden = true;
        this.perform("cascade", { cmc: Number(value.value), repeat: Number(repeat.value) || 0 });
      }, "button primary");
      const body = this.openPanel("enter CMC to cascade for", value, row, okay);
      value.focus();
      return body;
    }
    typePanel() {
      const types = new Set();
      const toggles = el("div", "mtgt-types");
      for (const type of ["Land", "Creature", "Artifact", "Enchantment", "Planeswalker", "Instant", "Sorcery"]) {
        const toggle = button(type, () => {
          if (types.has(type)) types.delete(type);
          else types.add(type);
          toggle.classList.toggle("on", types.has(type));
        }, "mtgt-toggle");
        toggles.append(toggle);
      }
      const custom = el("input");
      custom.placeholder = "enter custom type";
      const repeat = el("input");
      repeat.type = "number";
      repeat.min = "1";
      repeat.placeholder = "X";
      const row = el("label", "mtgt-field");
      row.append(el("span", "", "repeat X times"), repeat);
      const okay = button("✓", () => {
        const list = [...types];
        if (custom.value.trim()) list.push(custom.value.trim());
        this.panel.hidden = true;
        this.perform("revealUntil", { types: list, repeat: Number(repeat.value) || 0 });
      }, "button primary");
      this.openPanel("select type(s) to look for", toggles, custom, row, okay);
    }
    async mulligan(unfriendly) {
      const result = await this.perform("mulligan", { unfriendly });
      if (result?.confirm && confirm(result.confirm)) await this.perform("mulligan", { unfriendly, force: true });
    }
    editText(item) {
      const value = prompt(item.object.template === "notecard" ? "Notecard text" : "Counter label", item.object.text || "");
      if (value !== null) this.perform("text", { id: item.key, value });
    }
    inLibrary(item) {
      const seat = this.state.viewer && layout.seats[this.state.viewer];
      if (!seat) return false;
      return Math.abs(item.x - seat.library.x) <= 1.6 && Math.abs(item.z - seat.library.z) <= 2.2;
    }
    libraryPile() {
      const seat = layout.seats[this.state.viewer];
      if (!seat) return null;
      return [...this.state.objects].reverse().find((object) => (object.kind === "deck" || object.kind === "card") && Math.abs(object.x - seat.library.x) <= 1.6 && Math.abs(object.z - seat.library.z) <= 2.2);
    }
    menu(item, x, y, point) {
      const entries = [];
      const add = (label, run, extra = {}) => entries.push({ label, run, ...extra });
      const ids = this.canvas.selection().filter((key) => this.canvas.items.some((entry) => entry.key === key && entry.type !== "fixture"));
      if (!item) {
        add("have a response", () => this.perform("emote", { kind: "response" }));
        add("could you not", () => this.perform("emote", { kind: "couldyounot" }));
        add("hand counts", () => this.perform("emote", { kind: "handcounts" }));
        if (this.state.turn?.enabled && this.state.turn.color === this.state.viewer) add("End turn", () => this.perform("turn"));
        if (!this.state.turn?.enabled && this.state.viewer) add("Start turns", () => this.perform("turn"));
        add("Whole table view", () => this.canvas.view("table"));
        if (this.state.viewer) add("My seat view", () => this.canvas.view("seat"));
        return this.showMenu(entries, x, y);
      }
      const object = item.object;
      if ((object?.card && !object.faceDown) || object?.top)
        add("Inspect card", () => this.zoom(item, true));
      if (item.type === "hand") {
        if (item.seat !== this.state.viewer) return;
        add("Sort Hand by CMC", () => this.perform("sortHand"));
        add("Random Discard", () => this.perform("randomDiscard"));
        add("Play face down", async () => {
          const seat = layout.seats[this.state.viewer];
          const result = await this.perform("move", { moves: [{ id: item.key, x: seat.spawn.main.x, z: seat.spawn.main.z }] });
          if (result) this.perform("flip", { ids: [item.key] });
        });
        const library = this.libraryPile();
        if (library) add("Top of Library", () => this.perform("move", { moves: [{ id: item.key, x: library.x, z: library.z }], onto: library.id }));
        add("Bottom of Library", () => this.perform("bottom", { ids: [item.key] }));
        add(item.hand ? "Move to hand" : "Move to scry area", () => this.perform("move", { moves: [{ id: item.key }], toHand: { index: item.hand ? 0 : 1 } }));
        add("To Graveyard", () => this.perform("graveyard", { ids: [item.key] }));
        add("To Exile", () => this.perform("exile", { ids: [item.key] }));
        return this.showMenu(entries, x, y);
      }
      if (object.kind === "card") {
        const face = !object.faceDown && (object.transformed && object.card?.dfc ? object.card.dfc : object.card);
        add("Flip  [F]", () => this.perform("flip", { ids: ids.length ? ids : [item.key] }));
        add("Rotate right  [E]", () => this.perform("rotate", { ids: ids.length ? ids : [item.key], by: 90 }));
        add("Rotate left  [Q]", () => this.perform("rotate", { ids: ids.length ? ids : [item.key], by: -90 }));
        if (object.card?.dfc && !object.faceDown) add("Transform (other face)", () => this.perform("transform", { id: item.key }));
        add("Make Token Copy", () => this.perform("tokenCopy", { id: item.key }));
        add("Copy Card Exactly", () => this.perform("tokenCopy", { id: item.key, exact: true }));
        if (face && /cascade/i.test(face.oracle || "")) add("Cascade", () => this.perform("cascadeCard", { id: item.key }));
        const counters = object.counters || {};
        if (counters.plus === undefined) add("Add +1/+1 counter", () => this.perform("card", { id: item.key, plus: 1 }));
        else
          add("+1/+1 counters", null, {
            children: [
              ["+1", () => this.perform("card", { id: item.key, plus: counters.plus + 1 })],
              ["-1", () => this.perform("card", { id: item.key, plus: counters.plus - 1 })],
              ["+10", () => this.perform("card", { id: item.key, plus: counters.plus + 10 })],
              ["Remove", () => this.perform("card", { id: item.key, plus: null })],
            ],
          });
        if (counters.counter === undefined) add("Add counter", () => this.perform("card", { id: item.key, counter: 0 }));
        else
          add("Counter", null, {
            children: [
              ["+1", () => this.perform("card", { id: item.key, counter: counters.counter + 1 })],
              ["-1", () => this.perform("card", { id: item.key, counter: counters.counter - 1 })],
              ["+10", () => this.perform("card", { id: item.key, counter: counters.counter + 10 })],
              ["Remove", () => this.perform("card", { id: item.key, counter: null })],
            ],
          });
        add("Power/Toughness", null, {
          children: [
            ["Set…", () => {
              const initial = object.pt ? object.pt.join("/") : face?.power !== undefined ? face.power + "/" + face.toughness : "0/0";
              const value = prompt("Power/Toughness", initial);
              const match = value?.match(/^\s*(-?\d+)\s*\/\s*(-?\d+)\s*$/);
              if (match) this.perform("card", { id: item.key, pt: [Number(match[1]), Number(match[2])] });
            }],
            ...(object.pt ? [["Remove", () => this.perform("card", { id: item.key, pt: null })]] : []),
          ],
        });
        add("Keywords", null, { children: keywordList.map((keyword) => [(object.keywords?.includes(keyword) ? "✓ " : "") + keyword, () => this.perform("card", { id: item.key, keyword })]) });
        add("Stun counter", null, {
          children: [
            ["+1", () => this.perform("card", { id: item.key, stun: (counters.stun || 0) + 1 })],
            ["Remove", () => this.perform("card", { id: item.key, stun: 0 })],
          ],
        });
        if (object.card?.sid)
          add("Get Tokens and Emblems", async () => {
            try {
              const tokens = await scryfall.tokensFor(object.card.sid);
              if (!tokens.length) return this.say("No tokens or emblems found for " + object.card.name + ".");
              this.perform("spawn", { cards: withBack(tokens), at: { x: object.x + 2.6, z: object.z } });
            } catch (error) {
              this.say(error.message);
            }
          });
        if (face?.name && !object.faceDown)
          add("Rulings", async () => {
            try {
              const card = object.card.sid ? await scryfall.byId(object.card.sid) : await scryfall.named(face.name);
              const rulings = await scryfall.rulings(card);
              this.say(rulings.length ? card.name + " rulings:\n" + rulings.map((ruling) => "• " + ruling.comment).join("\n") : card.name + " has no rulings.");
            } catch (error) {
              this.say(error.message);
            }
          });
        this.zoneEntries(add, ids.length ? ids : [item.key]);
      } else if (object.kind === "deck") {
        add("Draw 1", () => this.perform("deal", { id: item.key, count: 1 }));
        add("Deal…", () => {
          const count = Number(prompt("How many cards?", "7"));
          if (count > 0) this.perform("deal", { id: item.key, count });
        });
        add("Shuffle  [R]", () => this.perform("shuffle", { id: item.key }));
        add("Flip  [F]", () => this.perform("flip", { ids: [item.key] }));
        add("Search", () => this.perform("search", { id: item.key }));
        add("Take top card", () => this.perform("take", { id: item.key, x: object.x + 2.6, z: object.z }));
        add("Rotate right  [E]", () => this.perform("rotate", { ids: [item.key], by: 90 }));
        if (this.inLibrary(item)) {
          add("Cascade for X", () => this.valuePanel());
          add("Reveal until Type", () => this.typePanel());
          for (const land of ["Plains", "Island", "Swamp", "Mountain", "Forest"]) add("Get Basic " + land, () => this.perform("basic", { land }));
        }
        this.zoneEntries(add, ids.length ? ids : [item.key]);
      } else if (object.kind === "bag") {
        if (object.template === "planechase") {
          if (!object.unpacked) add("Unpack", () => this.perform("unpack", { id: item.key }));
        } else add("Take one", () => this.perform("take_from_bag", { id: item.key, x: object.x + (object.x > 0 ? -3 : 3), z: object.z }));
      } else {
        if (object.kind === "die") add("Roll  [R]", () => this.perform("roll", { id: item.key }));
        if (object.kind === "counter") {
          add("+1", () => this.perform("counter", { id: item.key, delta: 1 }));
          add("-1", () => this.perform("counter", { id: item.key, delta: -1 }));
          add("Set…", () => {
            const value = prompt("Value", String(object.value));
            if (value !== null && value.trim() !== "") this.perform("counter", { id: item.key, set: Number(value) });
          });
          add("Reset", () => this.perform("counter", { id: item.key, set: object.template === "plusxy" || object.template === "rhystic" ? 1 : 0 }));
        }
        if (object.template === "text" || object.template === "notecard") add("Edit text", () => this.editText(item));
        if (object.template === "skipper") add(object.faceDown ? "Unskip (flip)" : "Skip turns (flip)", () => this.perform("flip", { ids: [item.key] }));
        if (object.template === "krark") add("Krark's Thumb: " + (object.thumb ? "Yes" : "No"), () => this.perform("coin", { id: item.key, mode: "thumb" }));
        add("Rotate right  [E]", () => this.perform("rotate", { ids: [item.key], by: 90 }));
        add("Delete", () => this.perform("remove", { ids: ids.length ? ids : [item.key] }));
      }
      this.showMenu(entries, x, y);
    }
    zoneEntries(add, ids) {
      if (!this.state.viewer) return;
      add("To Hand", () => this.perform("move", { moves: ids.map((id) => ({ id })), toHand: { index: 0 } }));
      add("To Graveyard  [7]", () => this.perform("graveyard", { ids }));
      add("To Exile  [8]", () => this.perform("exile", { ids }));
      add("To Bottom of Library  [9]", () => this.perform("bottom", { ids }));
      if (ids.length > 1) add("Group  [G]", () => this.perform("group", { ids }));
      add("Delete", () => this.perform("remove", { ids }));
    }
    showMenu(entries, x, y) {
      if (!entries.length) return;
      const list = this.menuNode;
      const build = (items, target) => {
        for (const entry of items) {
          const row = el("li");
          if (entry.children) {
            row.className = "has-children";
            row.append(el("span", "", entry.label + "  ▸"));
            const nested = el("ul", "mtgt-menu nested");
            build(entry.children.map(([label, run]) => ({ label, run })), nested);
            row.append(nested);
          } else {
            const action = button(entry.label, () => {
              this.hideMenu();
              entry.run();
            }, "mtgt-menu-item");
            row.append(action);
          }
          target.append(row);
        }
      };
      list.replaceChildren();
      build(entries, list);
      const bounds = this.element.getBoundingClientRect();
      list.hidden = false;
      const width = list.offsetWidth,
        height = list.offsetHeight;
      list.style.left = Math.min(x - bounds.left, bounds.width - width - 8) + "px";
      list.style.top = Math.max(8, Math.min(y - bounds.top, bounds.height - height - 8)) + "px";
    }
    hideMenu() {
      this.menuNode.hidden = true;
    }
    destroy() {
      this.dead = true;
      document.removeEventListener("pointerdown", this.closeMenu, true);
      this.canvas.destroy();
      for (const request of this.pending.values()) {
        clearTimeout(request.timeout);
        request.reject(new Error("Disconnected"));
      }
      this.pending.clear();
    }
  }
  Implementation = MtgTable;
}
