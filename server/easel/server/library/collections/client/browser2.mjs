import { Component, h, icon, iconButton, button, safeUrl, menu } from "./ui.mjs";

export default class Browser extends Component {
  constructor() {
    super("easel.collections.browser", "div");
    this.search = h("input", { type: "search", placeholder: "Search", "aria-label": "Search" });
    this.create = button("New", { kind: "primary", iconName: "plus", onClick: () => this.emit("create", { folderId: "" }) });
    this.folder = iconButton("folder", "New folder", () => this.emit("createFolder", { parentId: "" }));
    this.bar = h("div", { class: "ez-browser-bar" }, h("div", { class: "ez-search" }, icon("search", 15), this.search), this.folder, this.create);
    this.list = h("div", { class: "ez-browser-list", role: "tree" });
    this.element.append(this.bar, this.list);
    this.closed = new Set();
    this.on(this.search, "input", () => this.draw());
    this.on(this.list, "dragover", (event) => {
      if (this.props.canManage && event.target.closest("[data-folder]")) event.preventDefault();
    });
    this.on(this.list, "drop", (event) => {
      const target = event.target.closest("[data-folder]");
      if (!target || !this.props.canManage) return;
      event.preventDefault();
      try {
        const data = JSON.parse(event.dataTransfer.getData("application/x-easel-kit") || "{}");
        if (data.id && data.source === (this.props.kind || "")) this.emit("move", { id: String(data.id), folderId: target.dataset.folder });
      } catch {}
    });
  }

  render(props) {
    this.props = props;
    this.create.hidden = !props.canCreate;
    this.create.querySelector("span").textContent = props.createLabel || "New";
    this.folder.hidden = !props.canManage || props.allowFolders === false;
    this.search.placeholder = props.placeholder || "Search";
    this.draw();
  }

  entry(item) {
    const props = this.props;
    const node = h("div", { class: "ez-entry", role: "treeitem", tabIndex: 0, "aria-selected": String(item.id === props.selected), draggable: props.draggable !== false && item.draggable !== false });
    const thumb = h("span", { class: "ez-entry-thumb" });
    const image = safeUrl(item.image);
    if (image) thumb.append(h("img", { src: image, alt: "", loading: "lazy", draggable: false }));
    else thumb.append(icon(item.icon || props.icon || "file", 16));
    const main = h("span", { class: "ez-entry-main" }, h("span", { class: "ez-entry-name", text: item.name || "Untitled" }), item.detail ? h("span", { class: "ez-entry-sub", text: item.detail }) : "");
    node.append(thumb, main);
    for (const badge of item.badges || []) node.append(h("span", { class: "ez-chip " + (badge.kind ? "ez-chip-" + badge.kind : ""), text: badge.label }));
    const actions = (item.actions || props.actions || []).filter((action) => !action.gm || props.canManage);
    if (actions.length) {
      const more = iconButton("more", "Options for " + (item.name || "entry"), (event) => {
        event.stopPropagation();
        const bounds = more.getBoundingClientRect();
        menu(actions, { x: bounds.right - 190, y: bounds.bottom + 2 }, (id) => this.emit("action", { id: String(item.id), action: id }));
      });
      node.append(more);
      node.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        menu(actions, { x: event.clientX, y: event.clientY }, (id) => this.emit("action", { id: String(item.id), action: id }));
      });
    }
    node.addEventListener("click", (event) => {
      if (!event.target.closest(".ez-iconbtn")) this.emit("select", { id: String(item.id) });
    });
    node.addEventListener("dblclick", () => this.emit("open", { id: String(item.id) }));
    node.addEventListener("keydown", (event) => {
      if (event.key === "Enter") this.emit("open", { id: String(item.id) });
    });
    node.addEventListener("dragstart", (event) => {
      event.dataTransfer.setData("application/x-easel-kit", JSON.stringify({ id: String(item.id), source: props.kind || "", kind: props.kind || "", name: item.name || "", ...(item.drag || {}) }));
      event.dataTransfer.effectAllowed = "copyMove";
    });
    return node;
  }

  draw() {
    const props = this.props;
    const query = this.search.value.trim().toLowerCase();
    const items = (props.items || []).filter((item) => !query || String(item.name || "").toLowerCase().includes(query) || String(item.detail || "").toLowerCase().includes(query));
    const folders = props.folders || [];
    const known = new Set(folders.map((folder) => folder.id));
    const nodes = [];
    const build = (parentId, depth) => {
      const out = [];
      for (const folder of folders.filter((entry) => (entry.parentId || "") === parentId).sort((a, b) => (a.sort || 0) - (b.sort || 0) || String(a.name).localeCompare(String(b.name)))) {
        const children = build(folder.id, depth + 1);
        const own = items.filter((item) => item.folderId === folder.id).map((item) => this.entry(item));
        if (query && !children.length && !own.length) continue;
        const open = query ? true : !this.closed.has(folder.id);
        const head = h("button", { type: "button", class: "ez-folder-head", dataset: { folder: folder.id } }, icon("chevronDown", 14), icon("folder", 15), h("span", { text: folder.name }), h("span", { class: "ez-folder-count", text: own.length || "" }));
        head.addEventListener("click", () => {
          if (this.closed.has(folder.id)) this.closed.delete(folder.id);
          else this.closed.add(folder.id);
          this.draw();
        });
        if (props.canManage)
          head.addEventListener("contextmenu", (event) => {
            event.preventDefault();
            menu(
              [
                { id: "create", label: props.createLabel || "New entry here", icon: "plus" },
                { id: "rename", label: "Rename folder", icon: "edit" },
                { separator: true },
                { id: "delete", label: "Delete folder", icon: "trash", danger: true },
              ],
              { x: event.clientX, y: event.clientY },
              (id) => {
                if (id === "create") this.emit("create", { folderId: String(folder.id) });
                else this.emit("folderAction", { id: String(folder.id), action: id });
              },
            );
          });
        out.push(h("div", { class: "ez-folder", dataset: { open: String(open), folder: folder.id } }, head, h("div", { class: "ez-folder-body" }, children, own)));
      }
      return out;
    };
    nodes.push(...build("", 0));
    for (const item of items.filter((entry) => !entry.folderId || !known.has(entry.folderId))) nodes.push(this.entry(item));
    if (!nodes.length) {
      nodes.push(h("div", { class: "ez-empty" }, icon(props.icon || "file", 30), h("strong", { text: query ? "Nothing matches" : props.emptyTitle || "Nothing here yet" }), h("span", { text: query ? "Try a different search." : props.emptyText || "" })));
    }
    const scroll = this.list.scrollTop;
    this.list.replaceChildren(...nodes);
    this.list.dataset.folder = "";
    this.list.scrollTop = scroll;
  }
}
