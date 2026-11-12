export default class Session {
  constructor() {
    this.element = document.createElement("section");
    this.element.className = "session";
    const content = document.createElement("div");
    const game = document.createElement("div");
    game.className = "session-game";
    this.element.append(content, game);
    this.slots = { content, game };
  }
  update(props) {
    this.element.hidden = !props.visible;
  }
  destroy() {}
}
