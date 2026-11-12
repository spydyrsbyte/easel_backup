export default class Panel {
  constructor() {
    this.element = document.createElement("section");
    this.heading = document.createElement("h1");
    this.content = document.createElement("div");
    this.slots = { content: this.content };
    this.element.append(this.heading, this.content);
  }
  update(p) {
    this.heading.textContent = p.text;
  }
  destroy() {}
}
