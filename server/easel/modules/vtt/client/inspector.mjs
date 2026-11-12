const clone = (value) => JSON.parse(JSON.stringify(value ?? null));
const newId = (prefix) => prefix + "-" + Math.random().toString(36).slice(2, 10);
const LAYER_NAMES = { object: "Images", drawing: "Drawings", wall: "Walls", token: "Tokens", light: "Lights", roof: "Roofs" };

function setPath(target, path, value) {
  const parts = path.split(".");
  for (const part of parts.slice(0, -1)) target = target[part] = target[part] ?? {};
  target[parts[parts.length - 1]] = value;
}

export function tokenFields() {
  return [
    { id: "name", label: "Name", type: "text" },
    { id: "image", label: "Picture", type: "image" },
    { id: "size", label: "Size", type: "number", min: 1, max: 12, step: 1, hint: "In grid squares." },
    { id: "disposition", label: "Attitude", type: "segment", options: [{ id: "friendly", label: "Friendly" }, { id: "neutral", label: "Neutral" }, { id: "hostile", label: "Hostile" }] },
    { id: "hidden", label: "Hidden from players", type: "switch" },
    { type: "section", label: "Sight and light" },
    { id: "sight", label: "Reveals the map", type: "switch", hint: "Players who control this token see what it sees." },
    { id: "range", label: "Sight range", type: "number", min: 0, max: 200, step: 1, hint: "In squares. 0 means as far as the walls allow." },
    { id: "lightRadius", label: "Carries a light", type: "number", min: 0, max: 60, step: 1, hint: "Radius in squares. 0 for none." },
    { id: "lightColor", label: "Light colour", type: "color" },
  ];
}

export function sceneFields() {
  return [{ id: "name", label: "Name", type: "text" }];
}

export function mapInspector(ctrl) {
  const map = () => ctrl.draft;
  const grounds = () => (map().layers || []).filter((layer) => layer.type === "ground");
  const ground = () => grounds().find((entry) => entry.id === ctrl.groundId) || grounds()[0];
  const findItem = (id) => {
    for (const level of grounds())
      for (const layer of level.children || []) {
        const index = (layer.items || []).findIndex((item) => item.id === id);
        if (index >= 0) return { level, layer, index, item: layer.items[index] };
      }
    return null;
  };
  const findLayer = (id) => {
    for (const level of grounds()) {
      if (level.id === id) return { level, layer: level, siblings: map().layers, isGround: true };
      const index = (level.children || []).findIndex((layer) => layer.id === id);
      if (index >= 0) return { level, layer: level.children[index], siblings: level.children, index };
    }
    return null;
  };
  const commit = (mutate) => {
    const next = clone(map());
    ctrl.draft = next;
    mutate();
    ctrl.changeDraft(ctrl.draft);
  };
  const api = {
    nodes() {
      return grounds()
        .map((level, index) => ({
          id: level.id,
          kind: "ground",
          name: level.name || "Level " + (index + 1),
          visible: level.visible !== false,
          children: [...(level.children || [])].reverse().map((layer) => ({ id: layer.id, kind: layer.type, name: layer.name || LAYER_NAMES[layer.type] || layer.type, visible: layer.visible !== false, count: (layer.items || []).length })),
        }))
        .reverse();
    },
    treeActions() {
      return [
        { heading: "Add a layer" },
        { id: "add:object", label: "Images", icon: "image" },
        { id: "add:roof", label: "Roof", icon: "roof" },
        { id: "add:wall", label: "Walls", icon: "wall" },
        { id: "add:light", label: "Lights", icon: "light" },
        { id: "add:drawing", label: "Drawings", icon: "pen" },
        { separator: true },
        { id: "level", label: "Add a level above", icon: "layers" },
        { id: "up", label: "Move up", icon: "chevronUp" },
        { id: "down", label: "Move down", icon: "chevronDown" },
        { separator: true },
        { id: "delete", label: "Delete", icon: "trash", danger: true },
      ];
    },
    treeAction(id, action) {
      const found = findLayer(id);
      if (!found) return;
      if (action.startsWith("add:")) {
        const type = action.slice(4);
        commit(() => findLayer(found.level.id).layer.children.push({ id: newId(type), type, name: "", visible: true, shape: null, items: [] }));
      } else if (action === "level") {
        commit(() => {
          const base = ground();
          map().layers.push({ id: newId("ground"), type: "ground", name: "Level " + (grounds().length + 1), visible: true, height: 0, image: null, alphaMask: null, grid: clone(base?.grid) || { type: "square", size: 100, offset: { left: 0, top: 0 }, relativesize: { size: 5, label: "ft" }, color: "#ffffff40", visible: true }, ambient: 1, gmBrightness: 0.6, children: ["object", "wall", "token", "light"].map((type) => ({ id: newId(type), type, name: "", visible: true, shape: null, items: [] })) });
        });
      } else if (action === "delete") {
        if (found.isGround && grounds().length < 2) return ctrl.toast("A map keeps at least one level.");
        if (!found.isGround && found.layer.type === "token") return ctrl.toast("The token layer cannot be deleted.");
        commit(() => {
          const target = findLayer(id);
          target.siblings.splice(target.siblings.indexOf(target.layer), 1);
        });
        ctrl.selection = { kind: "", id: "" };
        ctrl.layerId = "";
      } else if (action === "up" || action === "down") {
        commit(() => {
          const target = findLayer(id);
          const position = target.siblings.indexOf(target.layer);
          const next = position + (action === "up" ? 1 : -1);
          if (next < 0 || next >= target.siblings.length) return;
          [target.siblings[position], target.siblings[next]] = [target.siblings[next], target.siblings[position]];
        });
      }
    },
    setVisible(id, visible) {
      commit(() => (findLayer(id).layer.visible = visible));
    },
    addImage(url, x, y) {
      const picture = new Image();
      const place = (width, height) => {
        const item = { id: newId("image"), image: url, x: Math.round(x - width / 2), y: Math.round(y - height / 2), width, height, opacity: 1, rotation: 0 };
        commit(() => {
          const level = ground();
          let layer = (level.children || []).find((entry) => entry.id === ctrl.layerId && (entry.type === "object" || entry.type === "roof")) || [...(level.children || [])].reverse().find((entry) => entry.type === "object");
          if (!layer) {
            layer = { id: newId("object"), type: "object", name: "", visible: true, shape: null, items: [] };
            level.children.unshift(layer);
          }
          layer.items.push(item);
        });
        ctrl.selection = { kind: "image", id: item.id };
        ctrl.render();
      };
      picture.onload = () => {
        const scale = Math.min(1, 800 / Math.max(picture.naturalWidth, picture.naturalHeight));
        place(Math.round(picture.naturalWidth * scale), Math.round(picture.naturalHeight * scale));
      };
      picture.onerror = () => place(200, 200);
      picture.src = url;
    },
    form() {
      const selection = ctrl.selection;
      const level = ground();
      if (!level) return { fields: [], values: {}, emptyText: "This map has no level." };
      const item = ["light", "wall", "image"].includes(selection.kind) ? findItem(selection.id) : null;
      if (item && selection.kind === "light")
        return {
          values: { item: { color: "#ffe2b0", intensity: 1, radius: 0, enabled: true, ...item.item, cells: Math.round((Number(item.item.radius) || 0) / (Number(level.grid?.size) || 100)) } },
          fields: [
            { type: "section", label: "Light" },
            { id: "item.enabled", label: "Lit", type: "switch" },
            { id: "item.color", label: "Colour", type: "color" },
            { id: "item.intensity", label: "Brightness", type: "range", min: 0.1, max: 1, step: 0.05, percent: true },
            { id: "item.cells", label: "Reach", type: "number", min: 0, max: 80, step: 1, hint: "In squares. 0 sets it from the brightness." },
            { id: "deleteItem", type: "action", text: "Delete light", icon: "trash", kind: "danger" },
          ],
        };
      if (item && selection.kind === "wall") {
        const column = item.item.column || item.item.kind === "column";
        const door = item.item.door || item.item.kind === "door";
        return {
          values: { item: { ...item.item, type: column ? "column" : door ? "door" : "wall", open: !!item.item.open, locked: !!item.item.locked, secret: !!item.item.secret } },
          fields: column
            ? [{ type: "section", label: "Pillar" }, { id: "item.radius", label: "Radius", type: "number", min: 4, max: 400, step: 1, hint: "In pixels." }, { id: "deleteItem", type: "action", text: "Delete pillar", icon: "trash", kind: "danger" }]
            : [
                { type: "section", label: door ? "Door" : "Wall" },
                { id: "item.type", label: "Kind", type: "segment", options: [{ id: "wall", label: "Wall" }, { id: "door", label: "Door" }] },
                { id: "item.open", label: "Open", type: "switch", when: "item.door" },
                { id: "item.locked", label: "Locked", type: "switch", when: "item.door", hint: "Players cannot open a locked door." },
                { id: "item.secret", label: "Secret", type: "switch", when: "item.door", hint: "Players see a plain wall." },
                { id: "deleteItem", type: "action", text: door ? "Delete door" : "Delete wall", icon: "trash", kind: "danger" },
              ],
        };
      }
      if (item && selection.kind === "image")
        return {
          values: { item: { opacity: 1, rotation: 0, ...item.item } },
          fields: [
            { type: "section", label: "Image" },
            { id: "item.image", label: "Picture", type: "image" },
            { id: "item.width", label: "Width", type: "number", min: 1, max: 20000, step: 1 },
            { id: "item.height", label: "Height", type: "number", min: 1, max: 20000, step: 1 },
            { id: "item.rotation", label: "Rotation", type: "range", min: -180, max: 180, step: 1, unit: "°" },
            { id: "item.opacity", label: "Opacity", type: "range", min: 0, max: 1, step: 0.05, percent: true },
            { id: "deleteItem", type: "action", text: "Delete image", icon: "trash", kind: "danger" },
          ],
        };
      if (selection.kind === "layer") {
        const found = findLayer(selection.id);
        if (found)
          return {
            values: { layer: { name: "", ...found.layer, visible: found.layer.visible !== false } },
            fields: [
              { type: "section", label: LAYER_NAMES[found.layer.type] || "Layer" },
              { id: "layer.name", label: "Name", type: "text", placeholder: LAYER_NAMES[found.layer.type] || "" },
              { id: "layer.visible", label: "Visible", type: "switch" },
              ...(found.layer.type === "object" || found.layer.type === "roof" ? [{ id: "addImage", type: "action", text: "Add an image", icon: "upload", hint: found.layer.type === "roof" ? "A roof hides itself when a player's token walks under it." : "Or drop an image file onto the map." }] : []),
              ...(found.layer.type === "drawing" ? [{ id: "clearLayer", type: "action", text: "Erase these drawings", icon: "trash", kind: "danger" }] : []),
            ],
          };
      }
      const image = level.image && typeof level.image === "object" ? level.image.ref || "" : level.image || "";
      return {
        values: { map: { size: { width: 2000, height: 1400 }, fogEnabled: true, movementSnap: "grid", ...map() }, ground: { ...level, art: image, grid: { color: "#ffffff40", visible: true, ...level.grid, tint: String(level.grid?.color || "#ffffff").slice(0, 7), strength: parseInt(String(level.grid?.color || "#ffffff40").slice(7, 9) || "40", 16) / 255 } } },
        fields: [
          { type: "section", label: "Background" },
          { id: "ground.art", label: "Map image", type: "image", hint: "The map takes the size of its first image." },
          { id: "map.size.width", label: "Width", type: "number", min: 200, max: 20000, step: 10 },
          { id: "map.size.height", label: "Height", type: "number", min: 200, max: 20000, step: 10 },
          { type: "section", label: "Grid" },
          { id: "ground.grid.visible", label: "Show the grid", type: "switch" },
          { id: "ground.grid.size", label: "Square size", type: "number", min: 10, max: 600, step: 1, hint: "In pixels." },
          { id: "ground.grid.offset.left", label: "Shift right", type: "number", min: -600, max: 600, step: 1 },
          { id: "ground.grid.offset.top", label: "Shift down", type: "number", min: -600, max: 600, step: 1 },
          { id: "ground.grid.tint", label: "Line colour", type: "color" },
          { id: "ground.grid.strength", label: "Line strength", type: "range", min: 0.05, max: 1, step: 0.05, percent: true },
          { id: "ground.grid.relativesize.size", label: "One square is", type: "number", min: 0.1, max: 1000, step: 0.5 },
          { id: "ground.grid.relativesize.label", label: "Unit", type: "text", placeholder: "ft" },
          { id: "map.movementSnap", label: "Tokens snap", type: "segment", options: [{ id: "grid", label: "To the grid" }, { id: "none", label: "Freely" }] },
          { type: "section", label: "Light and sight" },
          { id: "map.fogEnabled", label: "Fog of war", type: "switch", hint: "Players see only what their tokens can see." },
          { id: "ground.ambient", label: "Daylight", type: "range", min: 0, max: 1, step: 0.05, percent: true, hint: "Lower it for a dark scene lit by lights." },
          { id: "ground.gmBrightness", label: "Your view", type: "range", min: 0.2, max: 1, step: 0.05, percent: true, hint: "How bright dark areas look to you." },
        ],
      };
    },
    change(id, value) {
      const selection = ctrl.selection;
      commit(() => {
        if (id.startsWith("item.")) {
          const found = findItem(selection.id);
          if (!found) return;
          const key = id.slice(5);
          if (key === "cells") found.item.radius = Math.max(0, Number(value) || 0) * (Number(ground().grid?.size) || 100);
          else if (key === "type") {
            if (value === "door") Object.assign(found.item, { door: true, kind: "door", open: !!found.item.open });
            else {
              delete found.item.door;
              delete found.item.open;
              delete found.item.locked;
              delete found.item.secret;
              found.item.kind = "wall";
            }
          } else setPath(found.item, key, value);
        } else if (id.startsWith("layer.")) {
          const found = findLayer(selection.id);
          if (found) setPath(found.layer, id.slice(6), value);
        } else if (id.startsWith("map.")) setPath(map(), id.slice(4), value);
        else if (id === "ground.art") {
          const level = ground();
          if (!value) level.image = null;
          else {
            const first = !level.image;
            level.image = { ref: value, position: { x: 0, y: 0 }, size: null };
            const picture = new Image();
            picture.onload = () => {
              const next = clone(ctrl.draft);
              const target = (next.layers || []).find((entry) => entry.id === level.id);
              if (!target || !target.image) return;
              target.image.size = { width: picture.naturalWidth, height: picture.naturalHeight };
              if (first || grounds().length === 1) next.size = { width: picture.naturalWidth, height: picture.naturalHeight };
              ctrl.draft = next;
              ctrl.changeDraft(next);
            };
            picture.src = value;
          }
        } else if (id === "ground.grid.tint" || id === "ground.grid.strength") {
          const grid = ground().grid;
          const tint = id.endsWith("tint") ? value : String(grid.color || "#ffffff").slice(0, 7);
          const strength = id.endsWith("strength") ? Number(value) : parseInt(String(grid.color || "#ffffff40").slice(7, 9) || "40", 16) / 255;
          grid.color = tint + Math.round(Math.min(1, Math.max(0, strength)) * 255).toString(16).padStart(2, "0");
        } else if (id.startsWith("ground.")) setPath(ground(), id.slice(7), value);
      });
    },
    action(id) {
      if (id === "deleteItem") {
        const target = ctrl.selection.id;
        ctrl.selection = { kind: "", id: "" };
        commit(() => {
          const found = findItem(target);
          if (found) found.layer.items.splice(found.index, 1);
        });
      } else if (id === "clearLayer") commit(() => (findLayer(ctrl.selection.id).layer.items = []));
      else if (id === "addImage") {
        const picker = document.createElement("input");
        picker.type = "file";
        picker.accept = "image/png,image/jpeg,image/webp,image/gif,image/svg+xml";
        picker.onchange = () => {
          if (!picker.files[0]) return;
          ctrl.layerId = ctrl.selection.id;
          const size = map().size || { width: 2000, height: 1400 };
          ctrl.upload(picker.files[0]).then((stored) => stored && api.addImage(stored.url, size.width / 2, size.height / 2));
        };
        picker.click();
      }
    },
  };
  return api;
}

export function stageInspector(ctrl) {
  const box = () => ctrl.draft;
  const find = (id, elements = box().elements, parent = null) => {
    for (let index = 0; index < (elements || []).length; index++) {
      const element = elements[index];
      if (element.id === id) return { element, siblings: elements, index, parent };
      if (element.kind === "group") {
        const nested = find(id, element.children, element);
        if (nested) return nested;
      }
    }
    return null;
  };
  const commit = (mutate) => {
    ctrl.draft = clone(box());
    mutate();
    ctrl.changeDraft(ctrl.draft);
  };
  const toggleOf = (id) => (box().toggles || []).find((toggle) => (toggle.targets || []).length === 1 && toggle.targets[0] === id);
  const insert = (element) => {
    commit(() => {
      const selected = ctrl.selection.id ? find(ctrl.selection.id) : null;
      if (selected?.element.kind === "group") selected.element.children.unshift(element);
      else if (selected) selected.siblings.splice(selected.index, 0, element);
      else box().elements.unshift(element);
    });
    ctrl.selection = { kind: "element", id: element.id };
    ctrl.render();
  };
  const api = {
    nodes() {
      const build = (elements) => (elements || []).map((element) => ({ id: element.id, kind: element.kind, name: element.name || (element.kind === "dialogue" ? "Dialogue" : element.kind === "group" ? "Group" : "Image"), visible: element.visible !== false, ...(element.kind === "group" ? { children: build(element.children) } : {}) }));
      return build(box().elements);
    },
    treeActions() {
      return [
        { id: "front", label: "Bring forward", icon: "chevronUp" },
        { id: "back", label: "Send back", icon: "chevronDown" },
        { id: "duplicate", label: "Duplicate", icon: "copy" },
        { separator: true },
        { id: "delete", label: "Delete", icon: "trash", danger: true },
      ];
    },
    treeAction(id, action) {
      if (action === "delete") {
        commit(() => {
          const found = find(id);
          if (!found) return;
          found.siblings.splice(found.index, 1);
          box().toggles = (box().toggles || []).map((toggle) => ({ ...toggle, targets: (toggle.targets || []).filter((target) => target !== id) })).filter((toggle) => toggle.targets.length);
        });
        ctrl.selection = { kind: "", id: "" };
        ctrl.render();
      } else if (action === "front" || action === "back") {
        commit(() => {
          const found = find(id);
          const next = found ? found.index + (action === "front" ? -1 : 1) : -1;
          if (!found || next < 0 || next >= found.siblings.length) return;
          [found.siblings[found.index], found.siblings[next]] = [found.siblings[next], found.siblings[found.index]];
        });
      } else if (action === "duplicate") {
        const found = find(id);
        if (!found || found.element.kind === "group") return;
        insert({ ...clone(found.element), id: newId(found.element.kind), name: (found.element.name || "Copy") + " copy", x: (Number(found.element.x) || 0) + 30, y: (Number(found.element.y) || 0) + 30 });
      }
    },
    setVisible(id, visible) {
      commit(() => {
        const found = find(id);
        if (!found) return;
        found.element.visible = visible;
        for (const toggle of box().toggles || []) if ((toggle.targets || []).includes(id) && toggle.targets.length === 1) toggle.on = visible;
      });
    },
    addImage(url, name, x, y) {
      const picture = new Image();
      const place = (width, height) => insert({ id: newId("image"), name: String(name || "Image").replace(/\.[^.]+$/, "").slice(0, 60), kind: "image", visible: true, key: url, x: Math.round(x - width / 2), y: Math.round(y - height / 2), width, height, rotation: 0, alpha: 1, tint: "#ffffff", saturation: 1, contrast: 1, luminance: 0, flipH: false, flipV: false, transparency: [] });
      picture.onload = () => {
        const stage = Number(box().width) || 1600;
        const scale = Math.min(1, (stage * 0.6) / Math.max(picture.naturalWidth, picture.naturalHeight));
        place(Math.round(picture.naturalWidth * scale), Math.round(picture.naturalHeight * scale));
      };
      picture.onerror = () => place(300, 300);
      picture.src = url;
    },
    form() {
      const found = ctrl.selection.id ? find(ctrl.selection.id) : null;
      const add = [
        { type: "section", label: "Add to the stage" },
        { id: "addImage", type: "action", text: "Image", icon: "image", caption: "Picture" },
        { id: "addDialogue", type: "action", text: "Dialogue box", icon: "speech", caption: "Speech" },
        { id: "addGroup", type: "action", text: "Group", icon: "group", caption: "Folder" },
      ];
      if (!found) {
        const ratio = box().ratio || { width: 16, height: 9 };
        return {
          values: { box: { width: 1600, ...box(), shape: ratio.width + ":" + ratio.height } },
          fields: [
            { type: "section", label: "Stage" },
            { id: "box.width", label: "Width", type: "number", min: 320, max: 8000, step: 10, hint: "In pixels. Everything is placed against this size." },
            { id: "box.shape", label: "Shape", type: "segment", options: ["16:9", "4:3", "21:9", "1:1"] },
            ...add,
          ],
        };
      }
      const element = found.element;
      const common = [
        { type: "section", label: element.kind === "dialogue" ? "Dialogue box" : element.kind === "group" ? "Group" : "Image" },
        { id: "el.name", label: "Name", type: "text" },
        { id: "el.visible", label: "Showing", type: "switch" },
        { id: "el.toggle", label: "Toggle button", type: "switch", hint: "Adds a button to show or hide this during play." },
      ];
      const values = { el: { visible: true, rotation: 0, ...element, visible2: element.visible !== false, toggle: !!toggleOf(element.id) } };
      values.el.visible = element.visible !== false;
      if (element.kind === "group") return { values, fields: [...common, ...add, { id: "delete", type: "action", text: "Delete group", icon: "trash", kind: "danger" }] };
      const place = [
        { type: "section", label: "Placement" },
        { id: "el.x", label: "Left", type: "number", step: 1 },
        { id: "el.y", label: "Top", type: "number", step: 1 },
        { id: "el.width", label: "Width", type: "number", min: 1, step: 1 },
        { id: "el.height", label: "Height", type: "number", min: 1, step: 1 },
        { id: "el.rotation", label: "Rotation", type: "range", min: -180, max: 180, step: 1, unit: "°" },
      ];
      if (element.kind === "dialogue") {
        values.el = { fontSize: 36, color: "#ffffff", speaker: "", text: "", ...values.el, background: { color: "#0a0c14", opacity: 0.72, ...(element.background || {}) } };
        return {
          values,
          fields: [
            ...common,
            { id: "el.speaker", label: "Speaker", type: "text", placeholder: "Who is talking" },
            { id: "el.text", label: "Line", type: "textarea", rows: 3 },
            { id: "el.fontSize", label: "Text size", type: "number", min: 8, max: 200, step: 1 },
            { id: "el.color", label: "Text colour", type: "color" },
            { id: "el.background.color", label: "Panel colour", type: "color" },
            { id: "el.background.opacity", label: "Panel opacity", type: "range", min: 0, max: 1, step: 0.05, percent: true },
            ...place,
            { id: "delete", type: "action", text: "Delete dialogue box", icon: "trash", kind: "danger" },
          ],
        };
      }
      values.el = { alpha: 1, tint: "#ffffff", saturation: 1, contrast: 1, luminance: 0, flipH: false, flipV: false, ...values.el, keyOn: (element.transparency || []).length > 0, keyColor: element.transparency?.[0]?.color || "#00ff00", keyTolerance: element.transparency?.[0]?.tolerance ?? 0.2 };
      return {
        values,
        fields: [
          ...common,
          { id: "el.key", label: "Picture", type: "image" },
          ...place,
          { id: "el.flipH", label: "Mirror", type: "switch" },
          { type: "section", label: "Look" },
          { id: "el.alpha", label: "Opacity", type: "range", min: 0, max: 1, step: 0.05, percent: true },
          { id: "el.tint", label: "Tint", type: "color" },
          { id: "el.saturation", label: "Saturation", type: "range", min: 0, max: 2, step: 0.05, percent: true },
          { id: "el.contrast", label: "Contrast", type: "range", min: 0.2, max: 2, step: 0.05, percent: true },
          { id: "el.luminance", label: "Glow", type: "range", min: 0, max: 2, step: 0.05, percent: true, hint: "Lights this element and everything behind it in its tint." },
          { id: "el.keyOn", label: "Remove a colour", type: "switch", hint: "Makes one colour see-through, such as a green background." },
          { id: "el.keyColor", label: "Colour to remove", type: "color", when: "el.keyOn" },
          { id: "el.keyTolerance", label: "How close", type: "range", min: 0.02, max: 0.6, step: 0.02, percent: true, when: "el.keyOn" },
          { id: "delete", type: "action", text: "Delete image", icon: "trash", kind: "danger" },
        ],
      };
    },
    change(id, value) {
      if (id === "box.shape") {
        const [width, height] = String(value).split(":").map(Number);
        return commit(() => (box().ratio = { width, height }));
      }
      if (id.startsWith("box.")) return commit(() => setPath(box(), id.slice(4), value));
      const target = ctrl.selection.id;
      commit(() => {
        const found = find(target);
        if (!found) return;
        const key = id.slice(3);
        const element = found.element;
        if (key === "toggle") {
          box().toggles = (box().toggles || []).filter((toggle) => !((toggle.targets || []).length === 1 && toggle.targets[0] === target));
          if (value) box().toggles.push({ id: newId("toggle"), name: element.name || "Toggle", on: element.visible !== false, targets: [target] });
        } else if (key === "keyOn") element.transparency = value ? [{ color: "#00ff00", tolerance: 0.2 }] : [];
        else if (key === "keyColor") element.transparency = [{ color: value, tolerance: element.transparency?.[0]?.tolerance ?? 0.2 }];
        else if (key === "keyTolerance") element.transparency = [{ color: element.transparency?.[0]?.color || "#00ff00", tolerance: Number(value) }];
        else if (key === "visible") {
          element.visible = !!value;
          const toggle = toggleOf(target);
          if (toggle) toggle.on = !!value;
        } else {
          setPath(element, key, value);
          if (key === "name") {
            const toggle = toggleOf(target);
            if (toggle) toggle.name = value || "Toggle";
          }
        }
      });
    },
    action(id) {
      if (id === "delete") return api.treeAction(ctrl.selection.id, "delete");
      const width = Number(box().width) || 1600;
      const ratio = box().ratio || { width: 16, height: 9 };
      const height = (width * ratio.height) / ratio.width;
      if (id === "addDialogue") insert({ id: newId("dialogue"), name: "Dialogue", kind: "dialogue", visible: true, x: Math.round(width * 0.15), y: Math.round(height * 0.7), width: Math.round(width * 0.7), height: Math.round(height * 0.24), rotation: 0, fontSize: Math.round(width / 46), color: "#f4f0e6", speaker: "", text: "", background: { color: "#0a0c14", opacity: 0.78 } });
      else if (id === "addGroup") insert({ id: newId("group"), name: "Group", kind: "group", visible: true, children: [] });
      else if (id === "addImage") {
        const picker = document.createElement("input");
        picker.type = "file";
        picker.accept = "image/png,image/jpeg,image/webp,image/gif,image/svg+xml";
        picker.onchange = () => picker.files[0] && ctrl.upload(picker.files[0]).then((stored) => stored && api.addImage(stored.url, picker.files[0].name, width / 2, height / 2));
        picker.click();
      }
    },
  };
  return api;
}
