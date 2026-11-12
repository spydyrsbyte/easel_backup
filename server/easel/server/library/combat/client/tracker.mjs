import { Component, h, icon, iconButton, button, avatar, keyed, menu } from "./ui.mjs";

export default class Tracker extends Component {
  constructor() {
    super("easel.combat.tracker", "div");
    this.round = h("div", { class: "ez-tracker-round" });
    this.previous = iconButton("back", "Previous turn", () => this.emit("previous", {}));
    this.next = button("Next turn", { kind: "primary", iconName: "skip", onClick: () => this.emit("next", {}) });
    this.more = iconButton("more", "Encounter options", (event) => {
      const bounds = event.currentTarget.getBoundingClientRect();
      menu(
        [
          { id: "rollAll", label: "Roll all initiative", icon: "d20" },
          { id: "addSelected", label: "Add selected tokens", icon: "plus" },
          { separator: true },
          { id: "end", label: "End the encounter", icon: "close", danger: true },
        ],
        { x: bounds.right - 200, y: bounds.bottom + 4 },
        (id) => this.emit(id === "end" ? "end" : id, {}),
      );
    });
    this.bar = h("div", { class: "ez-tracker-bar" }, this.round, this.previous, this.next, this.more);
    this.list = h("div", { class: "ez-tracker-list", role: "list" });
    this.empty = h("div", { class: "ez-empty" });
    this.element.append(this.bar, this.list, this.empty);
  }

  render(props) {
    const combat = props.combat && props.combat.id ? props.combat : null;
    const gm = !!props.gm;
    this.bar.hidden = !combat;
    this.list.hidden = !combat;
    this.empty.hidden = !!combat;
    if (!combat) {
      this.empty.replaceChildren(icon("swords", 30), h("strong", { text: "No encounter is running" }), h("span", { text: gm ? "Start one to track initiative and turns." : "The game master has not started one." }), gm ? button("Start an encounter", { kind: "primary", iconName: "play", onClick: () => this.emit("start", {}) }) : "");
      return;
    }
    this.round.textContent = combat.started ? "Round " + combat.round : "Not started";
    this.next.querySelector("span").textContent = combat.started ? "Next turn" : "Begin";
    for (const node of [this.previous, this.next, this.more]) node.hidden = !gm;
    this.previous.disabled = !combat.started;
    const combatants = combat.combatants || [];
    keyed(
      this.list,
      combatants,
      (entry) => entry.id,
      (entry) => {
        const node = h("div", { class: "ez-combatant", role: "listitem", tabIndex: 0 });
        node.addEventListener("click", (event) => {
          if (!event.target.closest("button, input")) this.emit("select", { id: String(entry.id), tokenId: String(node.dataset.token || "") });
        });
        node.addEventListener("contextmenu", (event) => {
          if (!this.props.gm) return;
          event.preventDefault();
          const current = (this.props.combat?.combatants || []).find((item) => item.id === entry.id) || entry;
          menu(
            [
              { id: "roll", label: "Roll initiative", icon: "d20" },
              { id: "defeated", label: current.defeated ? "Mark as active" : "Mark as defeated", icon: "skull" },
              { separator: true },
              { id: "remove", label: "Remove from encounter", icon: "trash", danger: true },
            ],
            { x: event.clientX, y: event.clientY },
            (id) => {
              if (id === "roll") this.emit("roll", { id: String(entry.id) });
              else if (id === "defeated") this.emit("defeated", { id: String(entry.id), defeated: !current.defeated });
              else this.emit("remove", { id: String(entry.id) });
            },
          );
        });
        return node;
      },
      (node, entry) => {
        const current = combat.currentId === entry.id;
        const signature = JSON.stringify([entry, current, gm]);
        if (node.dataset.signature === signature) return;
        node.dataset.signature = signature;
        node.dataset.current = String(current);
        node.dataset.defeated = String(!!entry.defeated);
        node.dataset.token = entry.tokenId || "";
        const sub = h("div", { class: "ez-combatant-sub" });
        if (entry.hidden) sub.append(h("span", { class: "ez-chip", text: "Hidden" }));
        if (entry.defeated) sub.append(h("span", { class: "ez-chip ez-chip-danger", text: "Defeated" }));
        const bar = entry.bar;
        if (bar && Number(bar.max) > 0) {
          const ratio = Math.max(0, Math.min(1, Number(bar.value) / Number(bar.max)));
          const track = h("div", { class: "ez-bar", dataset: { level: ratio > 0.5 ? "high" : ratio > 0.25 ? "mid" : "low" } }, h("span", { style: { width: ratio * 100 + "%" } }));
          sub.append(track, h("span", { text: bar.value + " / " + bar.max }));
        } else if (current) sub.append(h("span", { text: "Taking their turn" }));
        let initiative;
        if (entry.hasInitiative && gm) {
          const input = h("input", { type: "number", value: entry.initiative, "aria-label": "Initiative for " + entry.name });
          input.addEventListener("change", () => {
            if (Number.isFinite(Number(input.value))) this.emit("initiative", { id: String(entry.id), initiative: Number(input.value) });
          });
          initiative = h("div", { class: "ez-init" }, input);
        } else if (entry.hasInitiative) initiative = h("div", { class: "ez-init", text: entry.initiative });
        else if (entry.canControl || gm) initiative = iconButton("d20", "Roll initiative for " + entry.name, () => this.emit("roll", { id: String(entry.id) }));
        else initiative = h("div", { class: "ez-init", text: "–" });
        node.replaceChildren(avatar(entry.name, entry.image, 34, entry.color), h("div", { class: "ez-combatant-main" }, h("div", { class: "ez-combatant-name", text: entry.name }), sub), initiative);
      },
    );
    const active = this.list.querySelector('[data-current="true"]');
    if (active && this.lastCurrent !== combat.currentId) active.scrollIntoView({ block: "nearest", behavior: "smooth" });
    this.lastCurrent = combat.currentId;
    if (!combatants.length && !this.list.firstChild) this.list.append(h("div", { class: "ez-empty" }, h("span", { text: gm ? "Right-click a token and choose Add to encounter." : "No one has joined yet." })));
    else if (combatants.length) this.list.querySelector(".ez-empty")?.remove();
  }
}
