import { el, button, icon } from "./dom.mjs";

export default class Shell {
  constructor() {
    this.element = el("div", "app-shell");
    this.sidebar = el("aside", "sidebar");
    const brand = el("a", "brand");
    brand.href = "/";
    const mark = el("img");
    mark.src = new URL("./mark.svg", import.meta.url).href;
    mark.alt = "";
    brand.append(mark);
    brand.append(el("span", "", "Easel"));
    const sections = el("nav", "sidebar-sections");
    sections.setAttribute("aria-label", "Your space");
    this.applications = button("Applications", "nav-item", () =>
      this.onEvent?.("navigate", { view: "applications" }),
    );
    this.tables = button("My Games", "nav-item active", () =>
      this.onEvent?.("navigate", { view: "tables" }),
    );
    this.applications.setAttribute("aria-label", "Applications");
    this.tables.setAttribute("aria-label", "My Games");
    this.applications.replaceChildren(
      icon("M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z"),
      el("span", "", "Applications"),
    );
    this.tables.replaceChildren(
      icon("M4 4h16v16H4zM8 8h.01M16 8h.01M12 12h.01M8 16h.01M16 16h.01"),
      el("span", "", "My Games"),
    );
    this.tableList = el("div", "sidebar-list");
    sections.append(this.applications, this.tables, this.tableList);
    const server = el("div", "server-card");
    const serverText = el("div");
    serverText.append(
      el("strong", "", "Easel"),
      el("small", "", "Your games. Your server."),
    );
    server.append(el("span", "server-icon", "◇"), serverText);
    this.sidebar.append(
      brand,
      el("span", "sidebar-label", "YOUR SPACE"),
      sections,
      server,
    );
    const main = el("div", "main-shell");
    const header = el("div", "shell-header");
    const content = el("main", "workspace");
    main.append(header, content);
    this.element.append(this.sidebar, main);
    this.slots = { header, content };
  }
  update(props) {
    this.element.dataset.signedIn = String(props.signedIn);
    this.element.classList.toggle("board-shell", !!props.activeGame);
    this.applications.hidden = !props.admin;
    this.applications.classList.toggle(
      "active",
      props.view === "applications" && !props.activeGame,
    );
    this.tables.classList.toggle(
      "active",
      props.view === "tables" && !props.activeGame,
    );
    this.tableList.replaceChildren(
      ...props.games.map((game) => {
        const node = button("", "sidebar-link", () =>
          this.onEvent?.("join", { game: game.id }),
        );
        node.title = game.name;
        node.append(el("span", "", game.name));
        if (game.running) node.append(el("i", "sidebar-live"));
        node.classList.toggle("active", props.activeGame === game.id);
        node.disabled = !game.running;
        return node;
      }),
    );
    if (!props.games.length)
      this.tableList.append(el("span", "sidebar-empty", "No tables yet"));
  }
  destroy() {}
}
