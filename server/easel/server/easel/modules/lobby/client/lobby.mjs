import { applicationName, element, control } from "./dom.mjs";

export default class Lobby {
  constructor() {
    this.element = element("section", "lobby");
    const intro = element("section", "lobby-intro");
    const introduction = element("div");
    this.eyebrow = element("span", "eyebrow", "YOUR TABLES");
    this.heading = element("h1", "", "Easel");
    this.who = element("p", "muted", "Choose a table, or start a new one.");
    introduction.append(this.eyebrow, this.heading, this.who);
    this.create = control("Start a table", "button primary", () =>
      this.onEvent?.("navigate", { view: "applications" }),
    );
    intro.append(introduction, this.create);
    this.error = element("p", "lobby-error");
    this.error.setAttribute("role", "alert");
    this.notice = element("p", "lobby-notice");
    this.notice.setAttribute("role", "status");
    this.tablesPage = element("section", "tables-page");
    const sectionHeading = element("div", "section-heading");
    const heading = element("h2", "", "Tables ");
    this.count = element("span", "count", "0");
    heading.append(this.count);
    this.search = element("input", "search-input");
    this.search.type = "search";
    this.search.placeholder = "Search tables…";
    this.search.setAttribute("aria-label", "Search tables");
    this.search.addEventListener("input", () => this.filter());
    sectionHeading.append(heading, this.search);
    this.list = element("div", "table-grid lobby-games");
    this.empty = element("div", "empty-state");
    this.empty.append(
      element("h2", "", "No tables yet"),
      element(
        "p",
        "muted",
        "Choose a game from Applications to start a table.",
      ),
    );
    this.noResults = element(
      "p",
      "empty-state",
      "No tables match your search.",
    );
    this.noResults.hidden = true;
    this.tablesPage.append(
      sectionHeading,
      this.list,
      this.empty,
      this.noResults,
    );
    this.library = element("section", "table-grid application-library");
    this.library.setAttribute("aria-label", "Installed applications");
    this.form = element("form", "lobby-create");
    this.createDialog = element("dialog", "modal create-modal");
    this.createDialog.setAttribute("aria-labelledby", "create-table-title");
    const createHeader = element("header");
    const createTitle = element("h2", "", "A new place to play");
    createTitle.id = "create-table-title";
    createHeader.append(
      createTitle,
      control("×", "icon-button", () => this.closeDialog(this.createDialog)),
    );
    createHeader.lastChild.setAttribute("aria-label", "Close create table");
    this.createFeedback = element("p", "lobby-error");
    this.createFeedback.setAttribute("role", "alert");
    this.createDialog.append(createHeader, this.createFeedback, this.form);
    const field = (id, text, input) => {
      const label = element("label", "field");
      label.append(element("span", "", text));
      label.htmlFor = id;
      input.id = id;
      label.append(input);
      this.form.append(label);
      return input;
    };
    this.name = field("lobby-name", "Table name", element("input"));
    this.name.placeholder = "Friday night games";
    this.name.required = true;
    this.name.maxLength = 100;
    this.application = field("lobby-application", "Game", element("select"));
    this.access = field("lobby-access", "Who can join", element("select"));
    for (const [value, text] of [
      ["open", "Anyone signed in"],
      ["invite", "Members only"],
    ]) {
      const option = element("option", "", text);
      option.value = value;
      this.access.append(option);
    }
    const modules = element("details", "lobby-modules");
    modules.append(element("summary", "", "Modules"));
    this.modules = element("div");
    modules.append(this.modules);
    this.form.append(modules);
    this.submit = element("button", "button primary", "Create table");
    this.submit.type = "submit";
    const createFooter = element("footer", "modal-actions");
    createFooter.append(
      control("Cancel", "button secondary", () =>
        this.closeDialog(this.createDialog),
      ),
      this.submit,
    );
    this.form.append(createFooter);
    this.management = element("div", "settings-content lobby-management");
    this.managementDialog = element("dialog", "modal settings-modal");
    this.managementDialog.setAttribute(
      "aria-labelledby",
      "table-settings-title",
    );
    const managementHeader = element("header");
    this.managementTitle = element("h2");
    this.managementTitle.id = "table-settings-title";
    const close = control("×", "icon-button", () => {
      this.selectedGame = null;
      this.closeDialog(this.managementDialog);
    });
    close.setAttribute("aria-label", "Close table settings");
    managementHeader.append(this.managementTitle, close);
    this.managementTabs = element("nav", "settings-tabs");
    this.managementTabs.setAttribute("aria-label", "Table settings sections");
    this.tab = "general";
    for (const [id, text] of [
      ["general", "General"],
      ["users", "Users and roles"],
    ]) {
      const button = control(text, "button secondary", () => {
        this.tab = id;
        this.manage(this.props);
      });
      button.dataset.tab = id;
      this.managementTabs.append(button);
    }
    this.managementFeedback = element("p", "lobby-error");
    this.managementFeedback.setAttribute("role", "alert");
    this.managementNotice = element("p", "lobby-notice");
    this.managementNotice.setAttribute("role", "status");
    this.managementDialog.append(
      managementHeader,
      this.managementTabs,
      this.managementFeedback,
      this.managementNotice,
      this.management,
    );
    this.managementDialog.addEventListener("close", () => {
      this.selectedGame = null;
      this.feedback();
    });
    this.createDialog.addEventListener("close", () => this.feedback());
    this.accounts = element("section", "settings-page lobby-accounts");
    this.element.append(
      intro,
      this.error,
      this.notice,
      this.tablesPage,
      this.library,
      this.accounts,
      this.createDialog,
      this.managementDialog,
    );
    this.requires = new Map();
    this.onClick = (event) => {
      const button = event.target.closest("button[data-action]");
      if (button && this.list.contains(button))
        this.onEvent?.(button.dataset.action, { game: button.dataset.game });
    };
    this.onApplication = () => this.checkRequired();
    this.onSubmit = (event) => {
      event.preventDefault();
      this.onEvent?.("create", {
        name: this.name.value.trim(),
        application: this.application.value,
        modules: [...this.modules.querySelectorAll("input:checked")].map(
          (box) => box.value,
        ),
        access: this.access.value,
      });
    };
    this.list.addEventListener("click", this.onClick);
    this.application.addEventListener("change", this.onApplication);
    this.form.addEventListener("submit", this.onSubmit);
  }
  openCreate(application) {
    this.returnFocus = document.activeElement;
    if (application) this.application.value = application;
    this.checkRequired();
    this.createDialog.showModal();
    this.feedback();
    this.name.focus();
  }
  closeDialog(dialog) {
    dialog.close();
    this.returnFocus?.focus();
  }
  feedback() {
    if (!this.props) return;
    const modal = this.createDialog.open || this.managementDialog.open;
    this.error.hidden = !!modal;
    this.notice.hidden = !!modal;
    this.error.textContent = this.props.error;
    this.notice.textContent = this.props.notice;
    this.createFeedback.textContent = this.createDialog.open
      ? this.props.error
      : "";
    this.managementFeedback.textContent = this.managementDialog.open
      ? this.props.error
      : "";
    this.managementNotice.textContent = this.managementDialog.open
      ? this.props.notice
      : "";
  }
  filter() {
    const query = this.search.value.trim().toLowerCase();
    let visible = 0;
    for (const item of this.list.children) {
      item.hidden = !item.dataset.tableName.includes(query);
      if (!item.hidden) visible++;
    }
    this.noResults.hidden = !this.props.games.length || visible > 0;
  }
  checkRequired() {
    const required = this.requires.get(this.application.value) || [];
    for (const box of this.modules.querySelectorAll("input")) {
      if (box.dataset.required === "true") box.checked = false;
      const needed = required.includes(box.value);
      box.dataset.required = String(needed);
      box.disabled = needed;
      if (needed) box.checked = true;
    }
  }
  choices(props) {
    const key = JSON.stringify([props.applications, props.modules]);
    if (key === this.choicesKey) return;
    this.choicesKey = key;
    const selected = this.application.value;
    this.requires = new Map(
      props.applications.map((app) => [app.id, app.requires]),
    );
    this.application.replaceChildren(
      ...props.applications.map((app) => {
        const option = element("option", "", applicationName(app.id));
        option.value = app.id;
        return option;
      }),
    );
    if (this.requires.has(selected)) this.application.value = selected;
    this.modules.replaceChildren(
      ...props.modules.map((id) => {
        const label = element("label", "lobby-module");
        const box = element("input");
        box.type = "checkbox";
        box.value = id;
        label.append(box, " " + id);
        return label;
      }),
    );
    this.checkRequired();
  }
  games(props) {
    this.list.replaceChildren(
      ...props.games.map((game) => {
        const item = element("article", "table-card lobby-game");
        item.dataset.tableName = game.name.toLowerCase();
        const text = element("div", "card-content");
        const topline = element("div", "card-topline");
        topline.append(
          element("span", "eyebrow", applicationName(game.application)),
          element(
            "span",
            game.running ? "status live" : "status",
            game.running ? "Ready to play" : "Stopped",
          ),
        );
        const title = element("h3", "", game.name);
        const footer = element("div", "card-footer");
        footer.append(
          element(
            "span",
            "",
            game.access === "invite" ? "Members only" : "Open table",
          ),
        );
        const actions = element("div", "board-card-actions");
        const action = (name, label, enabled = true) => {
          const button = element("button", "button plain compact", label);
          button.type = "button";
          button.dataset.action = name;
          button.dataset.game = game.id;
          button.disabled = props.busy || !enabled;
          actions.append(button);
        };
        if (props.manageable.includes(game.id)) {
          const button = element(
            "button",
            "button plain compact",
            "Settings",
          );
          button.type = "button";
          button.addEventListener("click", () => {
            this.selectedGame = game.id;
            this.tab = "general";
            this.returnFocus = button;
            this.manage(this.props);
            this.managementDialog.showModal();
            this.feedback();
            this.onEvent?.("refresh", {});
          });
          actions.append(button);
        }
        action("join", "Join", game.running);
        footer.append(actions);
        text.append(topline, title, footer);
        item.append(text);
        return item;
      }),
    );
    this.empty.hidden = props.games.length > 0;
    this.count.textContent = props.games.length;
    this.filter();
  }
  update(props) {
    this.props = props;
    const view = props.admin ? props.view : "tables";
    if (view !== this.view && this.createDialog.open)
      this.closeDialog(this.createDialog);
    this.view = view;
    this.heading.textContent =
      view === "applications"
        ? "Choose a game"
        : view === "settings"
          ? "Users"
          : "Easel";
    this.eyebrow.textContent =
      view === "applications"
        ? "GAME LIBRARY"
        : view === "settings"
          ? "SERVER SETTINGS"
          : "YOUR TABLES";
    this.who.textContent =
      view === "applications"
        ? "Start a table with an installed game application."
        : view === "settings"
          ? "Manage the people who can administer your server."
          : "Choose a table, or start a new one.";
    this.create.hidden = !props.admin || view !== "tables";
    this.tablesPage.hidden = view !== "tables";
    this.library.hidden = view !== "applications";
    this.accounts.hidden = view !== "settings";
    if (!props.admin && this.createDialog.open)
      this.closeDialog(this.createDialog);
    this.submit.disabled = props.busy;
    this.choices(props);
    this.games(props);
    this.manage(props);
    this.feedback();
    this.library.replaceChildren(
      ...props.applications.map((app) => {
        const card = element("article", "table-card application-card");
        const content = element("div", "card-content");
        const description =
          app.id === "easel.chess.game"
            ? "A classic board for two players. Move your pieces and play at your own pace."
            : app.id === "easel.checkers.game"
              ? "Capture, jump and crown your checkers in a game for two players."
              : app.id === "easel.mtg.game"
                ? "A multiplayer Magic tabletop with private decks and hands, playmats, counters, casting, combat and rules assistance."
                : app.id === "easel.mtgtable.game"
                  ? "The scripted six-player Tabletop Simulator Magic table: playmats, draw, scry, mill and reveal buttons, life trackers, commander damage, counters, dice and importers."
                  : "A demonstration table with a twenty-sided die.";
        const start = control("Start a table", "button primary", () =>
          this.openCreate(app.id),
        );
        start.disabled = props.busy;
        content.append(
          element("span", "eyebrow", "GAME APPLICATION"),
          element("h3", "", applicationName(app.id)),
          element("p", "muted", description),
          start,
        );
        card.append(content);
        return card;
      }),
    );
    this.accounts.replaceChildren(
      element("h2", "", "Server administrators"),
      element(
        "p",
        "muted",
        "Installation administrators can create and start games and manage all users. Game roles apply within each game.",
      ),
    );
    if (props.admin)
      for (const user of props.users) {
        const row = element("div", "settings-row management-row");
        row.append(element("span", "", user.displayName));
        const button = element(
          "button",
          "button secondary compact",
          user.admin ? "Remove administrator" : "Make administrator",
        );
        button.type = "button";
        button.disabled = props.busy;
        button.addEventListener("click", () =>
          this.onEvent?.("admin", { user: user.id, admin: !user.admin }),
        );
        row.append(button);
        this.accounts.append(row);
      }
  }
  manage(props) {
    const game = props.games.find(
      (game) =>
        game.id === this.selectedGame && props.manageable.includes(game.id),
    );
    if (!game) {
      if (this.managementDialog.open) this.closeDialog(this.managementDialog);
      return;
    }
    this.managementTitle.textContent = game.name;
    for (const button of this.managementTabs.children)
      button.classList.toggle("selected", button.dataset.tab === this.tab);
    this.management.replaceChildren();
    if (this.tab === "general") {
      this.management.append(
        element("h3", "", "Table access"),
        element("p", "muted", "Choose who can join this table."),
      );
    }
    const access = element("select");
    access.setAttribute("aria-label", "Game access");
    for (const [value, text] of [
      ["open", "Anyone signed in"],
      ["invite", "Members only"],
    ]) {
      const option = element("option", "", text);
      option.value = value;
      access.append(option);
    }
    access.value = game.access;
    access.disabled = props.busy;
    access.addEventListener("change", () =>
      this.onEvent?.("access", { game: game.id, access: access.value }),
    );
    if (this.tab === "general") {
      this.management.append(access);
      if (props.admin) {
        const lifecycle = control(
          game.running ? "Stop table" : "Start table",
          "button secondary",
          () =>
            this.onEvent?.(game.running ? "stop" : "start", {
              game: game.id,
            }),
        );
        lifecycle.disabled = props.busy;
        const group = element("section", "settings-group");
        group.append(
          element("h3", "", "Table session"),
          element(
            "p",
            "muted",
            game.running
              ? "This table is running and can accept players."
              : "Start the table to let players join.",
          ),
          lifecycle,
        );
        const remove = control("Delete table", "button secondary", () => {
          if (
            confirm(
              "Delete " +
                game.name +
                "? Its saved state, members and settings are removed permanently.",
            )
          )
            this.onEvent?.("delete", { game: game.id });
        });
        remove.disabled = props.busy;
        const danger = element("section", "settings-group");
        danger.append(
          element("h3", "", "Delete table"),
          element(
            "p",
            "muted",
            "Stops the table and permanently removes its saved state, members and settings.",
          ),
          remove,
        );
        this.management.append(group, danger);
      }
      return;
    }
    this.management.append(
      element("h3", "", "Members and roles"),
      element(
        "p",
        "muted",
        "Administrators manage the table. Players can take a seat. Spectators can watch.",
      ),
    );
    const members = props.memberships[game.id] || [];
    for (const user of members) {
      const row = element("div", "role-row management-row");
      row.append(element("span", "", user.displayName));
      const role = element("select");
      role.setAttribute("aria-label", "Role for " + user.displayName);
      for (const name of ["administrator", "player", "spectator"]) {
        const option = element("option", "", name);
        option.value = name;
        role.append(option);
      }
      role.value = user.role;
      role.disabled = props.busy;
      role.addEventListener("change", () =>
        this.onEvent?.("role", {
          game: game.id,
          user: user.id,
          role: role.value,
        }),
      );
      const remove = element("button", "button secondary compact", "Remove");
      remove.type = "button";
      remove.disabled = props.busy;
      remove.addEventListener("click", () =>
        this.onEvent?.("remove", { game: game.id, user: user.id }),
      );
      row.append(role, remove);
      this.management.append(row);
    }
    const add = element("form", "management-add");
    const users = element("select");
    users.setAttribute("aria-label", "User to add");
    for (const user of props.users.filter(
      (user) => !members.some((member) => member.id === user.id),
    )) {
      const option = element("option", "", user.displayName);
      option.value = user.id;
      users.append(option);
    }
    const send = element("button", "button primary", "Add member");
    send.type = "submit";
    send.disabled = props.busy || !users.options.length;
    add.append(users, send);
    add.addEventListener("submit", (event) => {
      event.preventDefault();
      this.onEvent?.("add", { game: game.id, user: users.value });
    });
    this.management.append(element("h3", "", "Add a member"), add);
  }
  destroy() {
    if (this.createDialog.open) this.createDialog.close();
    if (this.managementDialog.open) this.managementDialog.close();
    this.list.removeEventListener("click", this.onClick);
    this.application.removeEventListener("change", this.onApplication);
    this.form.removeEventListener("submit", this.onSubmit);
  }
}
