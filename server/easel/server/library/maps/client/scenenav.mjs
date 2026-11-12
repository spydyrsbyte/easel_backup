import { Component, h, icon, iconButton, keyed, menu } from "./ui.mjs";

export default class SceneNav extends Component {
  constructor() {
    super("easel.maps.scenenav", "nav");
    this.element.classList.add("ez-glass");
    this.element.setAttribute("aria-label", "Scenes");
    this.list = h("div", { class: "ez-scenenav-list" });
    this.add = iconButton("plus", "New scene", () => this.emit("create", {}));
    this.element.append(this.list, this.add);
    this.on(this.list, "wheel", (event) => {
      if (event.deltaY) this.list.scrollLeft += event.deltaY;
    }, { passive: true });
  }

  render(props) {
    this.props = props;
    this.add.hidden = !props.gm;
    const scenes = props.scenes || [];
    this.element.hidden = !scenes.length && !props.gm;
    keyed(
      this.list,
      scenes,
      (scene) => scene.id,
      (scene) => {
        const node = h("button", { type: "button", class: "ez-scene" });
        node.addEventListener("click", () => this.emit("view", { id: String(scene.id) }));
        node.addEventListener("dblclick", () => {
          if (this.props.gm) this.emit("activate", { id: String(scene.id) });
        });
        node.addEventListener("contextmenu", (event) => {
          if (!this.props.gm) return;
          event.preventDefault();
          const current = (this.props.scenes || []).find((entry) => entry.id === scene.id) || scene;
          menu(
            [
              { id: "activate", label: "Show to players", icon: "play", disabled: !!current.active },
              { id: "edit", label: "Edit scene", icon: "edit" },
              { id: "settings", label: "Scene settings", icon: "settings" },
              { id: "navigation", label: "Show in players' scene bar", icon: "pin", checked: !!current.navigation },
              { id: "duplicate", label: "Duplicate", icon: "copy" },
              { separator: true },
              { id: "delete", label: "Delete scene", icon: "trash", danger: true },
            ],
            { x: event.clientX, y: event.clientY },
            (id) => this.emit(id === "activate" ? "activate" : "action", id === "activate" ? { id: String(scene.id) } : { id: String(scene.id), action: id }),
          );
        });
        return node;
      },
      (node, scene) => {
        node.dataset.active = String(!!scene.active);
        node.dataset.viewing = String(scene.id === props.viewing);
        node.title = scene.active ? scene.name + " — players are here" : scene.name;
        const signature = scene.name + "|" + (scene.kind || "") + "|" + !!scene.navigation;
        if (node.dataset.signature !== signature) {
          node.dataset.signature = signature;
          node.replaceChildren(scene.kind === "stage" ? icon("theater", 14) : "", h("span", { text: scene.name }));
        }
      },
    );
  }
}
