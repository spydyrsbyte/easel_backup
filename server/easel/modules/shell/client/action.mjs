export default class Action {
  constructor() {
    this.element = document.createElement("button");
    this.element.type = "button";
    this.element.className = "button secondary compact";
    this.click = () => this.onEvent?.("pressed", {});
    this.element.addEventListener("click", this.click);
  }
  update(props) {
    this.element.textContent = props.text;
    this.element.hidden = !props.visible;
    this.element.disabled = !props.enabled;
  }
  destroy() {
    this.element.removeEventListener("click", this.click);
  }
}
