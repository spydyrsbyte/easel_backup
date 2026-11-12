export default class Providers {
  constructor() {
    this.element = document.createElement("div");
    this.element.className = "providers";
    this.slots = { content: this.element };
  }
  update() {}
  destroy() {}
}
