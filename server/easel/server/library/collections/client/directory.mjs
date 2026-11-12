import { Base } from "./base.mjs";
import { safeImage, element as el } from "./safe.mjs";

export default class Directory extends Base {
  constructor() {
    super("easel.collections.directory", ["header", "actions"]);
  }

  update(p) {
    this.begin({ ...p, title: "" });
    const wrap = el("div", "kit-directory-wrap kit-content");
    wrap.style.display = "flex";
    wrap.style.flexDirection = "column";
    wrap.style.gap = "8px";

    this.content.append(this.slots.header);

    const bar = el("div", "kit-row kit-directory-bar");
    bar.style.justifyContent = "space-between";

    const searchInput = el("input", "kit-directory-search");
    searchInput.type = "search";
    searchInput.placeholder = "Search directory...";
    searchInput.value = this.searchQuery ?? p.searchQuery ?? "";
    searchInput.style.flex = "1";
    bar.append(searchInput);

    if (p.canCreate !== false) {
      const newBtn = this.button(p.createLabel || "Create Entry", "create", { folderId: "", type: "entry" });
      newBtn.className = "kit-directory-create";
      bar.append(newBtn);
    }
    wrap.append(bar);

    const folders = Array.isArray(p.folders) ? p.folders : [];
    const entries = Array.isArray(p.entries) ? p.entries : [];

    const treeEl = el("div", "kit-directory-tree");
    treeEl.style.display = "flex";
    treeEl.style.flexDirection = "column";
    treeEl.style.gap = "4px";

    const renderFolder = (f, level, visited = new Set()) => {
      if (visited.has(f.id)) return el("div");
      visited.add(f.id);

      const fWrap = el("div", "kit-directory-folder-wrap");
      const fHeader = el("div", "kit-row kit-directory-folder-header");
      fHeader.style.paddingLeft = `${level * 16}px`;
      fHeader.style.cursor = "pointer";
      fHeader.style.userSelect = "none";
      fHeader.style.justifyContent = "space-between";

      const left = el("div", "kit-row");
      const isCollapsed = f.collapsed === true;
      const arrow = el("span", "kit-directory-arrow", isCollapsed ? "▶ " : "▼ ");
      left.append(arrow);

      const title = el("span", "kit-label", f.name);
      if (f.color) title.style.color = f.color;
      left.append(title);
      fHeader.append(left);

      const addBtn = el("button", "kit-badge", "+");
      addBtn.title = "Add entry here";
      addBtn.onclick = (ev) => {
        ev.stopPropagation();
        this.emit("create", { folderId: f.id, type: "entry" });
      };
      if (p.canCreate !== false) fHeader.append(addBtn);

      fHeader.onclick = () => {
        this.emit("toggleFolder", { folderId: f.id, collapsed: !isCollapsed });
      };
      fWrap.append(fHeader);

      if (!isCollapsed) {
        const childFolders = folders.filter((cf) => cf.parentId === f.id);
        for (const cf of childFolders) {
          fWrap.append(renderFolder(cf, level + 1, visited));
        }

        const childEntries = entries.filter((e) => e.folderId === f.id);
        for (const ce of childEntries) {
          fWrap.append(renderEntry(ce, level + 1));
        }
      }

      return fWrap;
    };

    const renderEntry = (e, level) => {
      const row = el("div", "kit-item kit-row kit-directory-entry");
      row.dataset.entryId = e.id;
      row.style.paddingLeft = `${level * 16 + 8}px`;
      row.style.justifyContent = "space-between";
      row.style.cursor = "pointer";
      row.draggable = true;

      if (e.id === p.activeId) {
        row.setAttribute("aria-selected", "true");
        row.style.borderColor = "var(--kit-accent, #d6ae65)";
      }

      row.ondragstart = (ev) => {
        ev.dataTransfer?.setData("text/plain", e.id);
        ev.dataTransfer?.setData("application/x-easel-kit", JSON.stringify({ id: e.id, type: e.type || "entry" }));
        this.emit("dragStart", { id: e.id, type: e.type || "entry" });
      };

      const left = el("div", "kit-row");
      if (e.icon) {
        const icon = el("img", "kit-image");
        icon.src = safeImage(e.icon);
        icon.style.width = "18px";
        icon.style.height = "18px";
        left.append(icon);
      }
      left.append(el("span", "", e.name));
      row.append(left);

      row.onclick = (ev) => {
        if (ev.target.closest(".kit-directory-actions")) return;
        this.emit("select", { id: e.id, type: e.type || "entry" });
      };

      const right = el("div", "kit-row kit-directory-actions");
      const dupBtn = el("button", "kit-badge", "Duplicate");
      dupBtn.onclick = (ev) => {
        ev.stopPropagation();
        this.emit("duplicate", { id: e.id });
      };
      right.append(dupBtn);

      const delBtn = el("button", "kit-badge", "Delete");
      delBtn.onclick = (ev) => {
        ev.stopPropagation();
        this.emit("delete", { id: e.id });
      };
      right.append(delBtn);

      if (p.canManage !== false) row.append(right);
      return row;
    };

    const showTree = (q) => {
      this.searchQuery = q;
      const lower = q.toLowerCase().trim();
      treeEl.replaceChildren();

      if (lower) {
        const matched = entries.filter((e) => (e.name || "").toLowerCase().includes(lower));
        for (const e of matched) {
          treeEl.append(renderEntry(e, 0));
        }
      } else {
        const rootFolders = folders.filter((f) => !f.parentId);
        for (const f of rootFolders) {
          treeEl.append(renderFolder(f, 0));
        }

        const rootEntries = entries.filter((e) => !e.folderId);
        for (const e of rootEntries) {
          treeEl.append(renderEntry(e, 0));
        }
      }
    };

    searchInput.oninput = (e) => {
      showTree(e.target.value);
      this.emit("search", { query: e.target.value });
    };

    showTree(searchInput.value);
    wrap.append(treeEl);
    this.content.append(wrap);
    this.content.append(this.slots.actions);
  }
}
