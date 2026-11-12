export default class Status {
  constructor() {
    this.element = document.createElement("p");
    this.element.className = "connection-status";
    this.element.setAttribute("role", "status");
    this.element.setAttribute("aria-live", "polite");
  }
  update(props) {
    this.element.hidden = !props.visible;
    this.element.textContent = props.text;
  }
  destroy() {}
}
