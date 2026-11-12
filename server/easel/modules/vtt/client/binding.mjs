export default class Binding {
  constructor() {
    this.listeners = [];
  }

  configure(options) {
    this.destroy();
    Object.assign(this, options);
    if (typeof this.send !== "function") throw new Error("A VTT binding needs an event sender.");
  }

  listen(component, event, handler) {
    if (!component) return;
    const unsubscribe = component.on(event, handler);
    if (typeof unsubscribe === "function") this.listeners.push(unsubscribe);
  }

  destroy() {
    for (const unsubscribe of this.listeners) unsubscribe();
    this.listeners = [];
  }
}
