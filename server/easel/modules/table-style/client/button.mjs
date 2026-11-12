export default class Button {
  constructor() {
    this.element = document.createElement("button");
    this.element.className = "primary";
    this.click = () => this.onEvent?.("pressed", {});
    this.element.addEventListener("click", this.click);
  }
  update(p) {
    this.element.textContent = "✦ " + p.text;
    this.element.disabled = !p.enabled;
  }
  destroy() {
    this.element.removeEventListener("click", this.click);
  }
}
