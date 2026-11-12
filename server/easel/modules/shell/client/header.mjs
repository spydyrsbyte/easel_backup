import { el, button } from "./dom.mjs";

export default class Header {
  constructor() {
    this.element = el("header", "topbar");
    const navigation = el("div", "easel-header-navigation");
    const breadcrumb = el("div", "breadcrumb");
    this.brand = el("a", "", "Easel");
    this.brand.href = "/";
    this.brandClick = (event) => {
      event.preventDefault();
      this.onEvent?.("navigate", { view: "tables" });
    };
    this.brand.addEventListener("click", this.brandClick);
    this.title = el("strong");
    breadcrumb.append(this.brand, el("span", "", "/"), this.title);
    const applicationActions = el("nav", "easel-header-app-menu");
    navigation.append(breadcrumb, applicationActions);
    const controls = el("div", "header-actions");
    const status = el("div", "header-status");
    this.menu = el("div", "user-menu");
    this.avatar = el("span", "avatar");
    this.name = el("span", "account-name");
    this.trigger = button("", "user-menu-button", () =>
      this.toggle(this.popup.hidden),
    );
    this.trigger.setAttribute("aria-haspopup", "menu");
    this.trigger.setAttribute("aria-expanded", "false");
    this.trigger.append(this.avatar, this.name);
    this.popup = el("div", "user-menu-list");
    this.popup.setAttribute("role", "menu");
    this.popup.hidden = true;
    this.settings = button("Settings", "", () => {
      this.toggle(false);
      this.onEvent?.("navigate", { view: "settings" });
    });
    this.settings.setAttribute("role", "menuitem");
    const actions = el("div", "account-actions");
    this.popup.append(this.settings, actions);
    this.popup.addEventListener("click", () => this.toggle(false));
    this.menu.append(this.trigger, this.popup);
    controls.append(status, this.menu);
    this.element.append(navigation, controls);
    this.slots = { actions, navigation: applicationActions, status };
    this.outside = (event) => {
      if (!this.menu.contains(event.target)) this.toggle(false);
    };
    this.escape = (event) => {
      if (event.key === "Escape" && !this.popup.hidden) {
        this.toggle(false);
        this.trigger.focus();
      }
    };
    document.addEventListener("pointerdown", this.outside);
    document.addEventListener("keydown", this.escape);
  }
  toggle(open) {
    this.popup.hidden = !open;
    this.trigger.setAttribute("aria-expanded", String(open));
    if (open) this.popup.querySelector("button:not([hidden])")?.focus();
  }
  mount() {
    for (const button of this.popup.querySelectorAll("button"))
      button.setAttribute("role", "menuitem");
  }
  update(props) {
    this.title.textContent = props.title;
    this.name.textContent = props.user;
    this.trigger.setAttribute("aria-label", props.user || "Account menu");
    this.avatar.textContent = props.user.slice(0, 2).toUpperCase() || "E";
    this.settings.hidden = !props.admin;
  }
  destroy() {
    this.brand.removeEventListener("click", this.brandClick);
    document.removeEventListener("pointerdown", this.outside);
    document.removeEventListener("keydown", this.escape);
  }
}
