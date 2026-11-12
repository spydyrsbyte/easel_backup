import { MagicCanvas } from "./canvas.mjs";
import { resolveImages } from "./battlemap.mjs";
import { loadText, text } from "./text.mjs";
import { parseDeckList, formatDeckList } from "./deck-list.mjs";
import { resolveDeck, searchCards, cardRulings } from "./cards.mjs";

const el = (tag, classes, value) => {
  const node = document.createElement(tag);
  if (classes) node.className = classes;
  if (value !== undefined) node.textContent = text(value);
  return node;
};
const button = (label, run, classes = "button secondary compact") => {
  const node = el("button", classes, label);
  node.type = "button";
  node.addEventListener("click", run);
  return node;
};
const choices = (label, options, value, changed) => {
  const node = el("select");
  node.setAttribute("aria-label", label);
  for (const [key, name] of options) {
    const option = el("option", "", name);
    option.value = key;
    node.append(option);
  }
  if (value !== undefined) node.value = String(value);
  if (changed) node.addEventListener("change", () => changed(node.value));
  return node;
};
const field = (label, node) => {
  const wrapper = el("label", "field");
  wrapper.append(el("span", "", label), node);
  return wrapper;
};
const zones = [
  "library",
  "hand",
  "battlefield",
  "graveyard",
  "exile",
  "command",
  "sideboard",
  "stack",
  "table",
];
const name = (value) => value.charAt(0).toUpperCase() + value.slice(1);

let Implementation;
export { Implementation as default };

export async function initialize({ Easel }) {
  await loadText();
  if (!document.querySelector("link[data-magic-style]")) {
    const style = el("link");
    style.rel = "stylesheet";
    style.href = new URL("./style.css", import.meta.url).href;
    style.dataset.magicStyle = "true";
    document.head.append(style);
  }
  const map = resolveImages(
    await (
      await fetch(new URL("./battlemaps/classic.json", import.meta.url))
    ).json(),
    new URL("./battlemaps/", import.meta.url),
  );
  const pixi = Easel.Interfaces.create("easel.graphics.pixi@1");
  class MagicTable {
    constructor() {
      this.element = el("section", "mtg-workspace play-workspace");
      this.serial = 0;
      this.pending = new Map();
      this.values = {};
      this.panel = "deck";
      this.toolbar = el("div", "workspace-toolbar");
      this.quick = el("div", "game-toolbar");
      this.toolbar.append(this.quick);
      this.players = el("div", "mtg-player-strip");
      this.views = el("div", "mtg-view-controls");
      this.views.append(
        button("My play area", () => this.canvas.view(this.props.user)),
        button("Whole table", () => this.canvas.view(null)),
      );
      this.rail = el("nav", "workspace-rail");
      this.rail.setAttribute("aria-label", "Game panels");
      for (const panel of [
        "deck",
        "card",
        "rules",
        "zones",
        "effects",
        "chat",
        "log",
        "settings",
      ])
        this.rail.append(
          button(
            name(panel),
            () => {
              this.panel = this.panel === panel ? null : panel;
              this.renderPanel();
            },
            "rail-button",
          ),
        );
      this.hide = button(
        "Hide panels",
        () => {
          this.panelsHidden = !this.panelsHidden;
          this.applyVisibility();
        },
        "button secondary compact",
      );
      this.views.append(this.hide);
      this.surface = el("div", "mtg-canvas");
      this.dock = el("aside", "workspace-dock dock-panel");
      const dockHeader = el("header", "dock-panel-header");
      this.panelTitle = el("h2");
      dockHeader.append(
        this.panelTitle,
        button(
          "×",
          () => {
            this.panel = null;
            this.renderPanel();
          },
          "icon-button",
        ),
      );
      dockHeader.lastChild.setAttribute("aria-label", "Close panel");
      this.content = el("div", "dock-panel-content");
      this.dock.append(dockHeader, this.content);
      this.error = el("p", "mtg-error");
      this.error.setAttribute("role", "alert");
      this.notice = el("p", "mtg-notice");
      this.notice.setAttribute("role", "status");
      this.element.append(
        this.surface,
        this.toolbar,
        this.players,
        this.views,
        this.rail,
        this.dock,
        this.error,
        this.notice,
      );
      this.canvas = new MagicCanvas(
        this.surface,
        pixi,
        (id, panel = "card") => {
          this.selected = id;
          this.panel = panel;
          this.renderPanel();
          this.renderCanvas();
        },
        (payload) => this.perform("move", payload),
        (action, payload) => this.perform(action, payload),
      );
      this.canvas.ready.catch((error) => {
        this.error.textContent =
          "The playmat could not start: " + error.message;
      });
    }
    ask(action, payload = {}) {
      const request = "magic-" + ++this.serial;
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          this.pending.delete(request);
          reject(new Error("The game request timed out."));
        }, 30000);
        this.pending.set(request, { resolve, reject, timeout });
        this.onEvent?.("action", { request, payload: { ...payload, action } });
      });
    }
    perform(action, payload = {}) {
      return this.ask(action, payload).catch((error) => {
        if (!this.dead) this.error.textContent = error.message;
      });
    }
    input(key, label, value = "", type = "text") {
      const node = el(type === "textarea" ? "textarea" : "input");
      if (type !== "textarea") node.type = type;
      node.value = this.values[key] ?? value;
      node.dataset.key = key;
      node.addEventListener("input", () => {
        this.values[key] = node.value;
      });
      this.content.append(field(label, node));
      return node;
    }
    update(props) {
      const previous = this.props;
      this.props = props;
      if (
        props.response.request &&
        props.response.request !== this.lastResponse
      ) {
        this.lastResponse = props.response.request;
        const pending = this.pending.get(props.response.request),
          result = props.response.result;
        if (pending) {
          clearTimeout(pending.timeout);
          this.pending.delete(props.response.request);
          if (result.declined) pending.reject(new Error(text(result.result)));
          else pending.resolve(result);
        }
        if (result?.declined) this.error.textContent = text(result.result);
        else {
          this.error.textContent = "";
          this.notice.textContent = result?.warnings?.map(text).join(" ") || "";
        }
      }
      if (props.error) this.error.textContent = props.error;
      const stateKey = JSON.stringify([
        props.state,
        props.user,
        props.inspection,
      ]);
      if (stateKey !== this.stateKey) {
        this.stateKey = stateKey;
        this.renderToolbar();
        this.renderPlayers();
        this.renderPanel();
        this.renderCanvas();
      }
      if (previous?.busy !== props.busy)
        this.element.setAttribute("aria-busy", String(props.busy));
    }
    renderCanvas() {
      if (this.props?.state.players)
        this.canvas.update(
          this.props.state,
          this.props.user,
          map,
          this.selected,
        );
    }
    renderToolbar() {
      const s = this.props.state;
      if (!s.players) return;
      const me = s.players.find((player) => player.id === this.props.user);
      const turn = s.players.find((player) => player.id === s.active);
      const title = el("div", "mtg-title");
      title.append(
        el(
          "span",
          "eyebrow",
          s.format === "commander" ? "COMMANDER" : "20-LIFE MAGIC",
        ),
        el("h2", "", "Magic: The Gathering"),
      );
      this.quick.replaceChildren(
        title,
        el(
          "span",
          "mtg-turn",
          `Turn ${s.turn} · ${turn?.name || "Waiting for players"} · ${s.phases[s.phase]}`,
        ),
      );
      const actions = el("div", "toolbar-actions mtg-quick-actions");
      if (!me && s.capabilities.play)
        actions.append(button("Take a seat", () => this.perform("sit")));
      if (me) {
        for (const [label, action, payload] of [
          ["Draw", "draw", { count: 1 }],
          ["Shuffle", "shuffle", {}],
          ["Mulligan", "mulligan", {}],
          ["Untap", "untap", {}],
          ["Next phase", "phase", { phase: (s.phase + 1) % s.phases.length }],
          ["Next turn", "turn", {}],
        ])
          actions.append(button(label, () => this.perform(action, payload)));
      }
      actions.append(button("Refresh", () => this.onEvent?.("refresh", {})));
      this.quick.append(actions);
    }
    renderPlayers() {
      const s = this.props.state;
      if (!s.players) return;
      this.players.replaceChildren(
        ...s.players.map((player) => {
          const seat = el(
            "div",
            "mtg-seat" + (s.active === player.id ? " active" : ""),
          );
          seat.append(
            el("span", "", player.name),
            el("strong", "mtg-life", player.life),
          );
          if (player.id === this.props.user || s.capabilities.controlOther) {
            seat.append(
              button("−", () =>
                this.perform("player", {
                  player: player.id,
                  field: "life",
                  delta: -1,
                }),
              ),
              button("+", () =>
                this.perform("player", {
                  player: player.id,
                  field: "life",
                  delta: 1,
                }),
              ),
            );
          }
          const library = s.libraries[player.id] || 0;
          seat.append(
            el(
              "small",
              "",
              `Library ${library} · Poison ${player.poison} · Energy ${player.energy}`,
            ),
          );
          return seat;
        }),
      );
    }
    applyVisibility() {
      this.toolbar.hidden = !!this.panelsHidden;
      this.players.hidden = !!this.panelsHidden;
      this.rail.hidden = !!this.panelsHidden;
      this.dock.hidden = !!this.panelsHidden || !this.panel;
      this.hide.textContent = this.panelsHidden ? "Show panels" : "Hide panels";
      this.canvas.reserveRight = this.panel && !this.panelsHidden ? 420 : 0;
      this.renderCanvas();
    }
    renderPanel() {
      const s = this.props?.state;
      if (!s?.players) return;
      const active = document.activeElement,
        key = this.content.contains(active) ? active.dataset.key : null,
        selection = active.selectionStart;
      this.content.replaceChildren();
      this.panelTitle.textContent = this.panel ? name(this.panel) : "";
      for (const button of this.rail.children)
        button.classList.toggle(
          "active",
          button.textContent.toLowerCase() === this.panel,
        );
      this.applyVisibility();
      if (!this.panel) return;
      this["panel" + name(this.panel)]?.(s);
      if (!s.capabilities.play)
        for (const control of this.content.querySelectorAll(
          "button,input,textarea,select",
        ))
          control.disabled = true;
      if (key) {
        const next = [...this.content.querySelectorAll("[data-key]")].find(
          (node) => node.dataset.key === key,
        );
        next?.focus({ preventScroll: true });
        if (next && selection !== null && next.type !== "number")
          try {
            next.setSelectionRange(selection, selection);
          } catch {}
      }
    }
    panelDeck(s) {
      const seated = s.players.some((player) => player.id === this.props.user);
      this.content.append(
        el(
          "p",
          "muted",
          seated
            ? "Import a deck list with Main, Commander and Sideboard sections. Your hand and library remain private."
            : "Take a seat to load your deck.",
        ),
      );
      if (!seated) return;
      const deckName = this.input(
        "deckName",
        "Deck name",
        s.deck?.name || "My deck",
      );
      const list = this.input(
        "deckList",
        "Deck list",
        s.deck ? formatDeckList(s.deck.entries) : "",
        "textarea",
      );
      list.rows = 12;
      list.placeholder =
        "4 Llanowar Elves\n20 Forest\n\nCommander\n1 Your commander";
      const lookup = el("input");
      lookup.type = "checkbox";
      lookup.checked = this.lookup !== false;
      lookup.addEventListener("change", () => (this.lookup = lookup.checked));
      const label = el("label", "mtg-checkbox");
      label.append(lookup, el("span", "", "Look up card details and art"));
      this.content.append(label);
      const load = button(
        "Import deck",
        async () => {
          load.disabled = true;
          this.error.textContent = "";
          try {
            let entries = parseDeckList(list.value);
            if (lookup.checked) entries = await resolveDeck(entries);
            await this.ask("import-begin", { name: deckName.value });
            for (let index = 0; index < entries.length; index += 6)
              await this.ask("import-chunk", {
                entries: entries.slice(index, index + 6),
              });
            await this.ask("import-commit");
            this.notice.textContent = "Deck loaded.";
          } catch (error) {
            this.error.textContent = error.message;
          } finally {
            load.disabled = false;
          }
        },
        "button primary",
      );
      load.disabled = !seated || !s.capabilities.play;
      const file = el("input");
      file.type = "file";
      file.accept = ".txt,.dek,.csv";
      file.setAttribute("aria-label", "Deck file");
      file.addEventListener("change", async () => {
        if (file.files[0]) {
          this.values.deckList = await file.files[0].text();
          this.renderPanel();
        }
      });
      this.content.append(file, load);
      const actions = el("div", "mtg-actions");
      actions.append(
        button("Draw seven", () => this.perform("draw", { count: 7 })),
        button("Reset my deck", () => {
          if (
            confirm("Return your cards to their deck and reset your counters?")
          )
            this.perform("reset");
        }),
        button("Clear my deck", () => {
          if (confirm("Remove your deck and cards from this game?"))
            this.perform("clear");
        }),
        button("Leave seat", () => this.perform("leave")),
      );
      this.content.append(actions);
      const query = this.input("search", "Search cards");
      this.content.append(
        button("Search", async () => {
          try {
            this.results = (await searchCards(query.value)).records;
            this.renderPanel();
          } catch (error) {
            this.error.textContent = error.message;
          }
        }),
      );
      for (const card of this.results || []) {
        const row = el("div", "mtg-search-result");
        row.append(
          el("span", "", card.name),
          button("Add to list", () => {
            this.values.deckList =
              (this.values.deckList ?? list.value) + "\n1 " + card.name;
            this.renderPanel();
          }),
        );
        this.content.append(row);
      }
    }
    selectedCard(s) {
      return (
        s.cards.find((card) => card.id === this.selected) ||
        s.inspection?.cards.find((card) => card.id === this.selected) ||
        this.props.inspection.cards?.find((card) => card.id === this.selected)
      );
    }
    panelCard(s) {
      const card = this.selectedCard(s);
      if (!card) {
        this.content.append(
          el("p", "muted", "Select a card on the playmat to inspect it."),
        );
        return;
      }
      if (!card.faceup) {
        this.content.append(
          el("h3", "", "Face-down card"),
          el("p", "muted", "This card is hidden from you."),
        );
        return;
      }
      this.content.append(el("h3", "", card.name));
      if (card.image) {
        const image = el("img", "mtg-card-image");
        image.src = card.transformed ? card.backImage : card.image;
        image.alt = card.name;
        this.content.append(image);
      }
      this.content.append(
        el("p", "", `${card.mana || ""} ${card.type || ""}`),
        el("p", "mtg-oracle", card.oracle || ""),
      );
      if (card.keywords?.length)
        this.content.append(
          el("p", "", "Keywords: " + card.keywords.join(", ")),
        );
      const counters = Object.entries(card.counters || {})
        .map(([key, count]) => key + ": " + count)
        .join(" · ");
      if (counters) this.content.append(el("p", "", counters));
      if (card.movable || card.controller === this.props.user) {
        const actions = el("div", "mtg-actions");
        actions.append(
          button("Cast / play", () => this.perform("cast", { id: card.id })),
          button(card.tapped ? "Untap card" : "Tap card", () =>
            this.perform("modify", {
              id: card.id,
              changes: { tapped: !card.tapped },
            }),
          ),
          button(card.facedown ? "Turn face up" : "Turn face down", () =>
            this.perform("modify", {
              id: card.id,
              changes: { facedown: !card.facedown },
            }),
          ),
          button(card.revealed ? "Hide card" : "Reveal card", () =>
            this.perform("modify", {
              id: card.id,
              changes: { revealed: !card.revealed },
            }),
          ),
          button("Transform", () =>
            this.perform("modify", {
              id: card.id,
              changes: { transformed: !card.transformed },
            }),
          ),
        );
        this.content.append(actions);
        const destination = choices(
          "Move to",
          zones.map((zone) => [zone, name(zone)]),
          this.values.destination || "battlefield",
          (value) => (this.values.destination = value),
        );
        const recipient = choices(
          "Destination player",
          s.players.map((player) => [player.id, player.name]),
          card.controller || this.props.user,
        );
        this.content.append(
          field("Move to", destination),
          field("Destination player", recipient),
          button("Move card", () =>
            this.perform("move", {
              id: card.id,
              zone: destination.value,
              player: recipient.value,
            }),
          ),
          button("Put on library bottom", () =>
            this.perform("move", {
              id: card.id,
              zone: "library",
              bottom: true,
            }),
          ),
        );
        const counter = this.input("counter", "Counter name", "+1/+1");
        const amount = this.input(
          "counterAmount",
          "Counter amount",
          "1",
          "number",
        );
        amount.min = -100;
        amount.max = 100;
        this.content.append(
          button("Adjust card counter", () =>
            this.perform("modify", {
              id: card.id,
              changes: {
                counter: { name: counter.value, delta: Number(amount.value) },
              },
            }),
          ),
        );
        const targets = choices(
          "Attach to",
          s.cards
            .filter(
              (item) =>
                item.id !== card.id &&
                item.faceup &&
                ["battlefield", "table"].includes(item.zone),
            )
            .map((item) => [item.id, item.name]),
        );
        this.content.append(
          field("Attach to", targets),
          button("Attach", () =>
            this.perform("attach", { id: card.id, host: targets.value }),
          ),
          button("Detach", () => this.perform("detach", { id: card.id })),
          button("Create copy", () => this.perform("clone", { id: card.id })),
          button("Remove token", () => this.perform("remove", { id: card.id })),
        );
      }
      if (
        s.capabilities.takeControl &&
        card.zone === "battlefield" &&
        card.controller !== this.props.user
      )
        this.content.append(
          button("Take control", () =>
            this.perform("take-control", { id: card.id }),
          ),
        );
      if (card.controller === this.props.user && card.controlHistory?.length)
        this.content.append(
          button("Return control", () =>
            this.perform("return-control", { id: card.id }),
          ),
        );
      if (card.scryfall)
        this.content.append(
          button("Card rulings", async () => {
            try {
              for (const ruling of await cardRulings(card.scryfall))
                this.content.append(
                  el("p", "", ruling.date + " · " + ruling.text),
                );
            } catch (error) {
              this.error.textContent = error.message;
            }
          }),
        );
    }
    panelRules(s) {
      const stack = el("section", "mtg-stack");
      stack.append(el("h3", "", "Stack"));
      for (const [index, id] of (s.stack || []).entries()) {
        const card = s.cards.find((card) => card.id === id);
        stack.append(
          el("p", "", (index ? "" : "Top: ") + (card?.name || "Card")),
        );
      }
      if (!s.stack?.length)
        stack.append(el("p", "muted", "The stack is empty."));
      else stack.append(button("Resolve top", () => this.perform("resolve")));
      this.content.append(stack);
      const combat = el("section", "mtg-combat");
      combat.append(el("h3", "", "Combat"));
      for (const attacker of s.combat?.attackers || [])
        combat.append(
          el(
            "p",
            "",
            `${attacker.name} → ${attacker.targetName} · ${attacker.blockers.length ? attacker.blockers.map((card) => card.name).join(", ") : "unblocked"}`,
          ),
        );
      combat.append(
        el(
          "p",
          "mtg-combat-summary",
          (s.combat?.summary || []).map(text).join(" ") ||
            "No combat damage is assigned.",
        ),
        button("Apply combat damage", () => this.perform("combat-damage")),
        button("Clear combat", () => this.perform("clear-combat")),
      );
      this.content.append(combat);
      const card = this.selectedCard(s),
        targets = choices(
          "Attack target",
          s.players
            .filter((player) => player.id !== this.props.user)
            .map((player) => [player.id, player.name]),
        );
      this.content.append(
        field("Attack target", targets),
        button("Attack with selected card", () =>
          this.perform("attack", { id: card?.id, target: targets.value }),
        ),
      );
      const attackers = choices(
        "Block attacker",
        (s.combat?.attackers || []).map((attacker) => [
          attacker.id,
          attacker.name,
        ]),
      );
      this.content.append(
        field("Block attacker", attackers),
        button("Block with selected card", () =>
          this.perform("block", { id: card?.id, attacker: attackers.value }),
        ),
      );
      const checks = el("section", "mtg-rule-checks");
      checks.append(el("h3", "", "Rules checks"));
      if (!s.checks?.length)
        checks.append(el("p", "muted", "Nothing to flag."));
      for (const check of s.checks || []) {
        const row = el("div", "mtg-rule-check");
        row.append(el("p", "", check.text));
        if (check.fix)
          row.append(
            button("Apply", () =>
              this.perform("apply-check", { key: check.key }),
            ),
          );
        checks.append(row);
      }
      this.content.append(checks);
      for (const [key, label] of [
        ["untap", "Auto untap"],
        ["draw", "Auto draw"],
        ["mana", "Auto empty mana"],
      ]) {
        const input = el("input");
        input.type = "checkbox";
        input.checked = !!s.assist[key];
        input.addEventListener("change", () =>
          this.perform("assist", { [key]: input.checked }),
        );
        const wrapper = el("label", "mtg-checkbox");
        wrapper.append(input, el("span", "", label));
        this.content.append(wrapper);
      }
    }
    panelZones(s) {
      const players = choices(
        "Browse player",
        s.players.map((player) => [player.id, player.name]),
        this.values.browsePlayer || this.props.user,
        (value) => (this.values.browsePlayer = value),
      );
      const zone = choices(
        "Browse zone",
        zones
          .filter((zone) => !["stack", "table", "hand"].includes(zone))
          .map((zone) => [zone, name(zone)]),
        this.values.browseZone || "library",
        (value) => (this.values.browseZone = value),
      );
      this.content.append(
        field("Player", players),
        field("Zone", zone),
        button("Browse zone", () =>
          this.perform("look", { player: players.value, zone: zone.value }),
        ),
        button("Close search", () => this.perform("close-look")),
      );
      const inspection = s.inspection || this.props.inspection;
      for (const card of inspection?.cards || []) {
        const row = el("div", "mtg-search-result");
        row.append(
          el("span", "", card.name),
          button("Inspect", () => {
            this.selected = card.id;
            this.panel = "card";
            this.renderPanel();
          }),
        );
        this.content.append(row);
      }
      const count = this.input("showCount", "Show top cards", "1", "number");
      this.content.append(
        button("Show to everyone", () =>
          this.perform("show", {
            zone: zone.value,
            count: Number(count.value),
          }),
        ),
        button("Stop showing cards", () => this.perform("close-show")),
      );
      for (const shown of s.shown || []) {
        this.content.append(
          el("h3", "", shown.name + " is showing " + shown.zone),
        );
        for (const card of shown.cards)
          this.content.append(el("p", "", card.name));
      }
    }
    panelEffects(s) {
      this.content.append(el("h3", "", "Player counters"));
      const player = choices(
        "Counter player",
        s.players.map((player) => [player.id, player.name]),
        this.props.user,
      );
      const type = choices("Player counter", [
        ["life", "Life"],
        ["poison", "Poison"],
        ["energy", "Energy"],
        ["commanderTax", "Commander tax"],
        ["counter", "Named counter"],
      ]);
      const key = this.input("playerCounter", "Counter name", "experience"),
        delta = this.input("playerDelta", "Adjustment", "1", "number");
      this.content.append(
        field("Player", player),
        field("Counter", type),
        button("Adjust player counter", () =>
          this.perform("player", {
            player: player.value,
            field: type.value,
            key: key.value,
            delta: Number(delta.value),
          }),
        ),
      );
      const mana = choices(
        "Mana color",
        ["W", "U", "B", "R", "G", "C"].map((color) => [color, color]),
      );
      this.content.append(
        field("Mana color", mana),
        button("Add mana", () =>
          this.perform("player", {
            player: player.value,
            field: "mana",
            key: mana.value,
            delta: 1,
          }),
        ),
        button("Spend mana", () =>
          this.perform("player", {
            player: player.value,
            field: "mana",
            key: mana.value,
            delta: -1,
          }),
        ),
      );
      const commander = choices(
        "Commander damage source",
        (s.commanders || []).map((source) => [source.id, source.name]),
      );
      this.content.append(
        field("Commander", commander),
        button("Adjust commander damage", () =>
          this.perform("player", {
            player: player.value,
            field: "commanderDamage",
            source: commander.value,
            delta: Number(delta.value),
          }),
        ),
      );
      this.content.append(el("h3", "", "Create a token"));
      const token = this.input("tokenName", "Token name", "Creature token"),
        power = this.input("tokenPower", "Power", "1"),
        toughness = this.input("tokenToughness", "Toughness", "1");
      this.content.append(
        button("Create token", () =>
          this.perform("token", {
            name: token.value,
            type: "Token Creature",
            power: power.value,
            toughness: toughness.value,
          }),
        ),
      );
      const sides = this.input("dice", "Die sides", "20", "number");
      this.content.append(
        button("Roll die", () =>
          this.perform("roll", { sides: Number(sides.value) }),
        ),
      );
      this.content.append(
        el("h3", "", "Card events"),
        el(
          "p",
          "muted",
          "Select one of your cards, then edit its event definitions.",
        ),
      );
      const card = this.selectedCard(s),
        events = this.input(
          "events",
          "Event definitions",
          JSON.stringify(card?.events || [], null, 2),
          "textarea",
        );
      events.rows = 8;
      this.content.append(
        button("Save card events", () => {
          try {
            this.perform("set-events", {
              id: card?.id,
              events: JSON.parse(events.value),
            });
          } catch (error) {
            this.error.textContent = error.message;
          }
        }),
        button("Remember card events", () =>
          this.perform("remember-events", { id: card?.id }),
        ),
        button("Forget saved events", () =>
          this.perform("forget-events", { id: card?.id }),
        ),
      );
      this.content.append(el("details", "mtg-vocabulary"));
      this.content.lastChild.append(
        el("summary", "", "Available events and responses"),
        el("pre", "", JSON.stringify(s.eventVocabulary, null, 2)),
      );
    }
    panelChat(s) {
      const messages = el("div", "mtg-chat");
      for (const item of s.chat || [])
        messages.append(el("p", "", item.name + ": " + item.message));
      this.content.append(messages);
      const input = this.input("chat", "Message");
      const form = el("form");
      form.append(
        button(
          "Send message",
          () => {
            if (input.value.trim())
              this.ask("chat", { message: input.value.trim() })
                .then(() => {
                  this.values.chat = "";
                  this.renderPanel();
                })
                .catch((error) => (this.error.textContent = error.message));
          },
          "button primary",
        ),
      );
      this.content.append(form);
    }
    panelLog(s) {
      for (const item of [...s.log].reverse())
        this.content.append(el("p", "mtg-log", item.text));
    }
    panelSettings(s) {
      if (!s.capabilities.manage) {
        this.content.append(
          el(
            "p",
            "muted",
            "Only game administrators can change these settings.",
          ),
        );
        return;
      }
      const format = choices(
        "Game format",
        [
          ["commander", "Commander · 40 life"],
          ["standard", "20-life format"],
        ],
        s.format,
        (value) => this.perform("settings", { format: value }),
      );
      const shape = choices(
        "Table shape",
        ["auto", "square", "circle", "polygon"].map((value) => [
          value,
          name(value),
        ]),
        s.shape,
        (value) => this.perform("settings", { shape: value }),
      );
      this.content.append(
        field("Format", format),
        field("Table shape", shape),
        button(
          "Start a new game",
          () => {
            if (
              confirm(
                "Reset all players, decks, cards and counters for a new game?",
              )
            )
              this.perform("new-game");
          },
          "button primary",
        ),
      );
    }
    destroy() {
      this.dead = true;
      this.canvas.destroy();
      for (const request of this.pending.values()) {
        clearTimeout(request.timeout);
        request.reject(new Error("Disconnected"));
      }
      this.pending.clear();
    }
  }
  Implementation = MagicTable;
}
