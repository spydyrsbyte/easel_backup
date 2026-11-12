import { Base } from "./base.mjs";
import { safeImage, element as el } from "./safe.mjs";

export default class Compendium extends Base {
  constructor() {
    super("easel.collections.compendium", ["filters", "preview"]);
    this.scrollTop = 0;
  }

  update(p) {
    this.begin({ ...p, title: "" });
    const wrap = el("div", "kit-compendium-wrap kit-content");
    wrap.style.display = "flex";
    wrap.style.flexDirection = "column";
    wrap.style.gap = "8px";

    const filterBar = el("div", "kit-row kit-compendium-bar");
    filterBar.style.justifyContent = "space-between";

    const allEntries = Array.isArray(p.entries) ? p.entries : [];
    const categories = Array.isArray(p.categories) && p.categories.length > 0
      ? p.categories
      : Array.from(new Set(allEntries.map((e) => e.category).filter(Boolean)));

    const catSelect = el("select", "kit-compendium-cat");
    const allOpt = el("option", "", "All Categories");
    allOpt.value = "all";
    catSelect.append(allOpt);

    for (const c of categories) {
      const opt = el("option", "", c);
      opt.value = c;
      catSelect.append(opt);
    }
    catSelect.value = this.selectedCategory ?? p.selectedCategory ?? "all";

    const searchInput = el("input", "kit-compendium-search");
    searchInput.type = "search";
    searchInput.placeholder = "Filter compendium...";
    searchInput.value = this.searchQuery ?? p.searchQuery ?? "";
    searchInput.style.flex = "1";

    const curRange = Array.isArray(p.levelRange) && p.levelRange.length === 2 ? p.levelRange : [0, 20];

    const minLevelInput = el("input");
    minLevelInput.type = "number";
    minLevelInput.placeholder = "Min";
    minLevelInput.style.width = "60px";
    minLevelInput.value = String(this.minLevel ?? curRange[0] ?? 0);

    const maxLevelInput = el("input");
    maxLevelInput.type = "number";
    maxLevelInput.placeholder = "Max";
    maxLevelInput.style.width = "60px";
    maxLevelInput.value = String(this.maxLevel ?? curRange[1] ?? 20);

    filterBar.append(catSelect);
    filterBar.append(searchInput);
    filterBar.append(minLevelInput);
    filterBar.append(maxLevelInput);
    wrap.append(filterBar);
    wrap.append(this.slots.filters);

    const itemHeight = typeof p.itemHeight === "number" && p.itemHeight > 0 ? p.itemHeight : 36;
    const viewportHeight = typeof p.viewportHeight === "number" && p.viewportHeight > 0 ? p.viewportHeight : 360;

    const viewport = el("div", "kit-compendium-viewport");
    viewport.style.height = viewportHeight + "px";
    viewport.style.overflowY = "auto";
    viewport.style.position = "relative";
    viewport.style.border = "1px solid var(--kit-border, #ffffff24)";
    viewport.style.borderRadius = "8px";
    viewport.style.background = "var(--kit-surface, #20242b)";

    const spacer = el("div", "kit-compendium-spacer");
    spacer.style.position = "relative";
    viewport.append(spacer);

    let filtered = [];

    const renderSlice = (scrollTop) => {
      spacer.replaceChildren();
      const top = Number.isFinite(scrollTop) ? scrollTop : 0;
      const startIndex = Math.max(0, Math.min(Math.max(0, filtered.length - 1), Math.floor(top / itemHeight) - 2));
      const endIndex = Math.min(filtered.length, Math.ceil((top + viewportHeight) / itemHeight) + 2);

      const sliceContainer = el("div", "kit-compendium-slice");
      sliceContainer.style.position = "absolute";
      sliceContainer.style.top = `${startIndex * itemHeight}px`;
      sliceContainer.style.left = "0";
      sliceContainer.style.right = "0";
      sliceContainer.style.display = "flex";
      sliceContainer.style.flexDirection = "column";

      for (let i = startIndex; i < endIndex; i++) {
        const item = filtered[i];
        const row = el("div", "kit-item kit-row kit-compendium-row");
        row.dataset.entryId = item.id;
        row.style.height = itemHeight + "px";
        row.style.padding = "4px 8px";
        row.style.justifyContent = "space-between";
        row.style.cursor = "pointer";
        row.draggable = true;

        row.ondragstart = (ev) => {
          ev.dataTransfer?.setData("text/plain", item.id);
          ev.dataTransfer?.setData("application/x-easel-kit", JSON.stringify({ id: item.id, packId: p.packId || "", type: item.type || "entry" }));
          this.emit("dragStart", { packId: p.packId || "", entryId: item.id });
        };

        const left = el("div", "kit-row");
        if (item.icon) {
          const img = el("img", "kit-image");
          img.src = safeImage(item.icon);
          img.style.width = "20px";
          img.style.height = "20px";
          left.append(img);
        }
        left.append(el("span", "kit-label", item.name));

        const lvl = item.level ?? item.cr;
        if (lvl !== undefined) {
          left.append(el("span", "kit-badge", "Lvl " + lvl));
        }
        row.append(left);

        const right = el("div", "kit-row");
        const inspectBtn = el("button", "kit-badge", "Inspect");
        inspectBtn.onclick = (ev) => {
          ev.stopPropagation();
          this.emit("inspect", { packId: p.packId || "", entryId: item.id });
        };
        right.append(inspectBtn);

        const selectBtn = this.button("Select", "select", { packId: p.packId || "", entryId: item.id });
        selectBtn.className = "kit-badge";
        right.append(selectBtn);

        row.append(right);
        sliceContainer.append(row);
      }
      spacer.append(sliceContainer);
    };

    const recompute = () => {
      this.selectedCategory = catSelect.value || this.selectedCategory || p.selectedCategory || "all";
      this.searchQuery = searchInput.value;
      this.minLevel = minLevelInput.value !== "" ? Number(minLevelInput.value) : 0;
      this.maxLevel = maxLevelInput.value !== "" ? Number(maxLevelInput.value) : 20;

      const selCat = this.selectedCategory;
      const query = this.searchQuery.toLowerCase().trim();
      const minLvl = this.minLevel;
      const maxLvl = this.maxLevel;

      filtered = allEntries.filter((e) => {
        if (selCat !== "all" && e.category !== selCat) return false;
        const lvl = e.level ?? e.cr;
        if (lvl !== undefined && (lvl < minLvl || lvl > maxLvl)) return false;
        if (query) {
          const text = `${e.name || ""} ${(e.tags || []).join(" ")} ${e.description || ""}`.toLowerCase();
          if (!text.includes(query)) return false;
        }
        return true;
      });

      const totalHeight = filtered.length * itemHeight;
      spacer.style.height = totalHeight + "px";
      renderSlice(viewport.scrollTop);
    };

    const emitFilter = () => {
      viewport.scrollTop = 0;
      this.scrollTop = 0;
      recompute();
      this.emit("filterChange", {
        category: catSelect.value,
        query: searchInput.value,
        levelRange: [Number(minLevelInput.value) || 0, Number(maxLevelInput.value) || 20],
      });
    };

    catSelect.onchange = emitFilter;
    searchInput.oninput = emitFilter;
    minLevelInput.onchange = emitFilter;
    maxLevelInput.onchange = emitFilter;

    viewport.onscroll = () => {
      this.scrollTop = viewport.scrollTop;
      renderSlice(viewport.scrollTop);
    };

    recompute();
    if (this.scrollTop) {
      viewport.scrollTop = this.scrollTop;
    }

    wrap.append(viewport);
    this.content.append(wrap);
    this.content.append(this.slots.preview);
  }
}
