export default class Provider {
  constructor() {
    this.element = document.createElement("a");
    this.element.className = "provider";
  }
  update(props) {
    this.element.href = "/auth/" + encodeURIComponent(props.name) + "/start";
    this.element.textContent = "Continue with " + props.name;
  }
  destroy() {}
}
