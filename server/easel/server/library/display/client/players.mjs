import { Component, h, avatar, keyed } from "./ui.mjs";

export default class Players extends Component {
  constructor() {
    super("easel.display.players", "div");
    this.element.classList.add("ez-glass");
    this.element.setAttribute("role", "list");
    this.element.setAttribute("aria-label", "Players");
  }

  render(props) {
    const players = [...(props.players || [])].sort((a, b) => Number(!!b.online) - Number(!!a.online) || String(a.name).localeCompare(String(b.name)));
    this.element.hidden = !players.length;
    keyed(
      this.element,
      players,
      (player) => player.id,
      (player) => {
        const node = h("div", { class: "ez-player", role: "listitem" });
        node.addEventListener("click", () => this.emit("select", { id: String(player.id) }));
        return node;
      },
      (node, player) => {
        const signature = JSON.stringify(player);
        if (node.dataset.signature === signature) return;
        node.dataset.signature = signature;
        node.dataset.online = String(player.online !== false);
        node.replaceChildren(avatar(player.name, player.image, 22, player.color), h("span", { class: "ez-player-name", text: player.name }), player.role ? h("span", { class: "ez-chip " + (player.gm ? "ez-chip-primary" : ""), text: player.role }) : "", h("span", { class: "ez-player-dot" }));
      },
    );
  }
}
