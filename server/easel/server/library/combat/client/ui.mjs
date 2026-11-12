const ICONS = {
  pointer: "M5 3l14 7-6 2.2L10.8 18z",
  hand: "M8 11V5.5a1.5 1.5 0 013 0V10m0-4.5v-1a1.5 1.5 0 013 0V10m0-4a1.5 1.5 0 013 0v7.5c0 4-2.5 6.5-6 6.5-2.6 0-4.2-1.2-5.6-3.6L4.2 14a1.5 1.5 0 012.5-1.6L8 14",
  ruler: "M3.5 16.5l13-13 4 4-13 13zM7 13l1.5 1.5M10 10l1.5 1.5M13 7l1.5 1.5",
  pen: "M4 20l1-4.5L16.5 4a2.1 2.1 0 013 3L8 18.5zM14.5 6l3.5 3.5",
  wall: "M3 6h18v12H3zM3 12h18M9 6v6M15 12v6",
  door: "M6 21V4.5A1.5 1.5 0 017.5 3h9A1.5 1.5 0 0118 4.5V21M4 21h16M14.5 12.5v.01",
  light: "M9 18h6M10 21h4M12 3a6 6 0 00-3.6 10.8c.6.5 1 1.2 1 2h5.2c0-.8.4-1.5 1-2A6 6 0 0012 3z",
  sun: "M12 8a4 4 0 100 8 4 4 0 000-8zM12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8",
  moon: "M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z",
  eye: "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7zM12 9a3 3 0 100 6 3 3 0 000-6z",
  eyeOff: "M3 3l18 18M10.6 5.2A9.8 9.8 0 0112 5c6.4 0 10 7 10 7a17 17 0 01-3.3 4.2M6.2 6.3A17 17 0 002 12s3.6 7 10 7c1.6 0 3-.4 4.200-1M9.900 9.900a3 3 0 004.2 4.2",
  fog: "M4 9h13a3 3 0 10-3-3M3 13h17M5 17h11a2.5 2.5 0 11-2.500 2.500",
  ping: "M12 21s-6.500-5.600-6.500-11a6.500 6.500 0 0113 0c0 5.400-6.500 11-6.500 11zM12 7.500a2.500 2.500 0 100 5 2.500 2.500 0 000-5z",
  token: "M12 3a9 9 0 100 18 9 9 0 000-18zM12 8a2.700 2.700 0 100 5.400A2.700 2.700 0 0012 8zM6.700 18c.900-2 2.900-3 5.300-3s4.400 1 5.300 3",
  users: "M9 11a3.500 3.500 0 100-7 3.500 3.500 0 000 7zM2.500 20c.500-3.500 3-5.500 6.500-5.500s6 2 6.500 5.500M16 4.300a3.500 3.500 0 010 6.500M18 14.700c2 .700 3.200 2.500 3.500 5.300",
  user: "M12 12a4 4 0 100-8 4 4 0 000 8zM4.500 20.500c.700-4 3.500-6 7.500-6s6.800 2 7.500 6",
  chat: "M4 5.500A1.500 1.500 0 015.500 4h13A1.500 1.500 0 0120 5.500v9a1.500 1.500 0 01-1.500 1.500H10l-4.500 4v-4h0A1.500 1.500 0 014 14.500z",
  swords: "M14.500 3H21v6.500L9.500 21 3 14.500zM7 13.500l3.500 3.500M3 21l3.200-3.200M16 3l-2 2",
  book: "M5 4.500A1.500 1.500 0 016.500 3H19v15H6.500A1.500 1.500 0 005 19.500zM5 19.500A1.500 1.500 0 006.500 21H19v-3M9 7.500h6M9 11h4",
  map: "M9 4L3 6.500v13.500L9 17.500l6 2.500 6-2.500V4l-6 2.500zM9 4v13.500M15 6.500V20",
  layers: "M12 3l9 5-9 5-9-5zM3 12.500l9 5 9-5M3 17l9 5 9-5",
  image: "M4 5.500A1.500 1.500 0 015.500 4h13A1.500 1.500 0 0120 5.500v13a1.500 1.500 0 01-1.500 1.500h-13A1.500 1.500 0 014 18.500zM8.500 8a1.500 1.500 0 100 3 1.500 1.500 0 000-3zM20 15l-4.500-4.500L6 20",
  theater: "M3 4h18v6.500a9 9 0 01-18 0zM8 9.500v.01M16 9.500v.01M8.500 14c1 1.200 2.200 1.800 3.500 1.800s2.500-.600 3.500-1.800",
  dice: "M4.500 3h15A1.500 1.500 0 0121 4.500v15a1.500 1.500 0 01-1.500 1.500h-15A1.500 1.500 0 013 19.500v-15A1.500 1.500 0 014.500 3zM8 8v.01M16 8v.01M12 12v.01M8 16v.01M16 16v.01",
  d20: "M12 2.500l8.500 4.900v9.200L12 21.500l-8.500-4.900V7.400zM12 2.500L7 10h10zM7 10l5 11.500L17 10M3.500 7.400L7 10M20.500 7.400L17 10M3.500 16.600L7 10M20.500 16.600L17 10",
  settings: "M12 9a3 3 0 100 6 3 3 0 000-6zM19.400 13.500a7.800 7.800 0 000-3l2-1.500-2-3.500-2.400 1a7.800 7.800 0 00-2.600-1.500L14 2.500h-4l-.400 2.500A7.800 7.800 0 007 6.500l-2.400-1-2 3.500 2 1.500a7.800 7.800 0 000 3l-2 1.500 2 3.500 2.400-1a7.800 7.800 0 002.600 1.500l.400 2.500h4l.400-2.500a7.800 7.800 0 002.600-1.500l2.400 1 2-3.500z",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  close: "M6 6l12 12M18 6L6 18",
  check: "M4.500 12.500l5 5 10-11",
  chevronDown: "M6 9l6 6 6-6",
  chevronUp: "M6 15l6-6 6 6",
  chevronRight: "M9 6l6 6-6 6",
  chevronLeft: "M15 6l-6 6 6 6",
  more: "M5 12v.01M12 12v.01M19 12v.01",
  search: "M10.500 4a6.500 6.500 0 100 13 6.500 6.500 0 000-13zM15.500 15.500L20 20",
  trash: "M4 7h16M9 7V4.500h6V7M6.500 7l.800 12.500h9.400L17.500 7M10 11v5M14 11v5",
  edit: "M4 20h4L19 9l-4-4L4 16zM13.500 6.500l4 4",
  copy: "M9 9h10.500v10.500H9zM5 15H4.500V4.500H15V5",
  lock: "M6.500 11h11a1.500 1.500 0 011.500 1.500V19a1.500 1.500 0 01-1.500 1.500h-11A1.500 1.500 0 015 19v-6.500A1.500 1.500 0 016.500 11zM8 11V8a4 4 0 018 0v3",
  unlock: "M6.500 11h11a1.500 1.500 0 011.500 1.500V19a1.500 1.500 0 01-1.500 1.500h-11A1.500 1.500 0 015 19v-6.500A1.500 1.500 0 016.500 11zM8 11V8a4 4 0 017.500-2",
  play: "M7 4.500v15l12-7.500z",
  pause: "M8 5v14M16 5v14",
  skip: "M6 5v14l10-7zM18 5v14",
  back: "M18 5v14L8 12zM6 5v14",
  flag: "M5 21V4M5 4h11l-2 4 2 4H5",
  skull: "M12 3a8 8 0 00-5 14.200V20h10v-2.800A8 8 0 0012 3zM9 11.500a1.500 1.500 0 100 3 1.500 1.500 0 000-3zM15 11.500a1.500 1.500 0 100 3 1.500 1.500 0 000-3zM10.500 20v-2M13.500 20v-2",
  heart: "M12 20.500s-8-4.800-8-10.800A4.500 4.500 0 0112 7a4.500 4.500 0 018 2.700c0 6-8 10.800-8 10.800z",
  shield: "M12 3l8 3v6c0 4.500-3.200 7.800-8 9-4.800-1.200-8-4.500-8-9V6z",
  bolt: "M13 2.500L4.500 13.500H11l-1 8L18.500 10H12z",
  star: "M12 3l2.700 5.800 6.300.800-4.600 4.400 1.200 6.300L12 17.300 6.400 20.300l1.200-6.300L3 9.600l6.300-.800z",
  folder: "M3.500 6.500A1.500 1.500 0 015 5h4.500l2 2.500H19a1.500 1.500 0 011.500 1.500v9a1.500 1.500 0 01-1.500 1.500H5a1.500 1.500 0 01-1.500-1.500z",
  file: "M6.500 3H14l4.500 4.500V19.500A1.500 1.500 0 0117 21H6.500A1.500 1.500 0 015 19.500v-15A1.500 1.500 0 016.500 3zM14 3v4.500h4.500",
  upload: "M12 16V4M7 8.500L12 4l5 4.500M4.500 16v3A1.500 1.500 0 006 20.500h12a1.500 1.500 0 001.500-1.500v-3",
  download: "M12 4v12M7 11.500L12 16l5-4.500M4.500 16v3A1.500 1.500 0 006 20.500h12a1.500 1.500 0 001.500-1.500v-3",
  send: "M3.500 11.500L20.500 4l-6 17-3.200-7zM11.300 14l4.200-4.500",
  grid: "M4 4h16v16H4zM4 9.300h16M4 14.700h16M9.300 4v16M14.700 4v16",
  target: "M12 4a8 8 0 100 16 8 8 0 000-16zM12 9a3 3 0 100 6 3 3 0 000-6zM12 2v3M12 19v3M2 12h3M19 12h3",
  zoomIn: "M10.500 4a6.500 6.500 0 100 13 6.500 6.500 0 000-13zM15.500 15.500L20 20M10.500 7.500v6M7.500 10.500h6",
  zoomOut: "M10.500 4a6.500 6.500 0 100 13 6.500 6.500 0 000-13zM15.500 15.500L20 20M7.500 10.500h6",
  fit: "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5",
  rotate: "M19.500 12a7.500 7.500 0 11-2.300-5.400M19.500 4v4.500H15",
  undo: "M8 5L3.500 9.500 8 14M3.500 9.500H14a6 6 0 010 12h-3",
  redo: "M16 5l4.500 4.500L16 14M20.500 9.500H10a6 6 0 000 12h3",
  save: "M5 4h11.500L20 7.500V20H5zM8 4v5h7V4M8 20v-6.500h8V20",
  circle: "M12 4a8 8 0 100 16 8 8 0 000-16z",
  square: "M5 5h14v14H5z",
  cone: "M4 19.500L12 4l8 15.500zM4 19.500c2 1.300 5 2 8 2s6-.700 8-2",
  line: "M5 19L19 5",
  polygon: "M12 3.500l8 6-3 9.500H7l-3-9.500z",
  roof: "M3 12l9-8 9 8M5.500 10.500V20h13v-9.500",
  crown: "M4 18h16l1.200-10-5 4L12 5l-4.200 7-5-4zM4 21h16",
  clock: "M12 3.500a8.500 8.500 0 100 17 8.500 8.500 0 000-17zM12 7.500V12l3 2",
  info: "M12 3.500a8.500 8.500 0 100 17 8.500 8.500 0 000-17zM12 11v5.500M12 7.500v.01",
  warning: "M12 3.500L2.500 20h19zM12 10v4.500M12 17.500v.01",
  menu: "M4 6.500h16M4 12h16M4 17.500h16",
  sidebar: "M4 5h16v14H4zM14.500 5v14",
  expand: "M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7",
  minimize: "M5 18h14",
  pin: "M9 3.500h6l-1 6 3.500 3.500H6.500L10 9.500zM12 13v7.500",
  link: "M10 14a4 4 0 005.700 0l3-3a4 4 0 00-5.700-5.700l-1 1M14 10a4 4 0 00-5.700 0l-3 3a4 4 0 005.700 5.700l1-1",
  bag: "M5.500 8h13l1 12.500h-15zM8.500 8V6.500a3.500 3.500 0 017 0V8",
  scroll: "M7 4h11a2 2 0 012 2v1.500h-4M7 4a2 2 0 00-2 2v11.500a2.500 2.500 0 002.500 2.500H16a2 2 0 002-2V7.500M7 4a2 2 0 012 2v12a2 2 0 01-2 2M11.500 9h3.500M11.500 12.500h3.500",
  sparkle: "M12 3l1.700 5.300L19 10l-5.300 1.700L12 17l-1.700-5.300L5 10l5.300-1.700zM18.500 15.500l.800 2.200 2.200.800-2.200.800-.800 2.200-.800-2.200-2.200-.800 2.200-.800z",
  move: "M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3",
  speech: "M5 5h14a1.500 1.500 0 011.500 1.500v8A1.500 1.500 0 0119 16h-6l-4 4v-4H5a1.500 1.500 0 01-1.500-1.500v-8A1.500 1.500 0 015 5zM8 9.500h8M8 12.500h5",
  toggle: "M8 7h8a5 5 0 010 10H8A5 5 0 018 7zM16 9.500a2.500 2.500 0 100 5 2.500 2.500 0 000-5z",
  group: "M4 4h7v7H4zM13 13h7v7h-7zM13 4h7v7h-7zM4 13h7v7H4z",
  flip: "M12 3v18M8 7l-4.500 5L8 17zM16 7l4.500 5L16 17z",
  contrast: "M12 3.500a8.500 8.500 0 100 17 8.500 8.500 0 000-17zM12 3.500v17M12 7l5 2M12 12l7 .500M12 17l5-2",
  king: "M12 3v4M10 5h4M7.500 20.500h9l1.500-8a4 4 0 00-6-3.500 4 4 0 00-6 3.500zM6.500 20.500h11",
  resign: "M5 21V4l12 4-12 4",
  trophy: "M8 4h8v5a4 4 0 01-8 0zM8 5.500H5v1.500a3 3 0 003 3M16 5.500h3v1.500a3 3 0 01-3 3M12 13v4M8.500 20.500h7M10 17h4v3.500h-4z",
};

let stylesReady = false;

export function ensureStyles() {
  if (stylesReady || document.querySelector("link[data-easel-kits]")) {
    stylesReady = true;
    return;
  }
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = new URL("./kit.css", import.meta.url).href;
  link.dataset.easelKits = "true";
  document.head.append(link);
  stylesReady = true;
}

export function h(tag, attributes, ...children) {
  const node = document.createElement(tag);
  if (attributes) {
    for (const [key, value] of Object.entries(attributes)) {
      if (value === undefined || value === null || value === false) continue;
      if (key === "class") node.className = value;
      else if (key === "text") node.textContent = String(value);
      else if (key === "style" && typeof value === "object") Object.assign(node.style, value);
      else if (key === "dataset") Object.assign(node.dataset, value);
      else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2).toLowerCase(), value);
      else if (key in node && key !== "list" && key !== "form") node[key] = value;
      else node.setAttribute(key, value === true ? "" : String(value));
    }
  }
  append(node, children);
  return node;
}

function append(node, children) {
  for (const child of children) {
    if (child === undefined || child === null || child === false) continue;
    if (Array.isArray(child)) append(node, child);
    else node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

export function icon(name, size = 18) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.6");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("ez-icon");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", ICONS[name] || ICONS.circle);
  svg.append(path);
  return svg;
}

export function hasIcon(name) {
  return Object.hasOwn(ICONS, name);
}

export function iconButton(name, label, onClick, extra = "") {
  const node = h("button", { type: "button", class: "ez-iconbtn " + extra, title: label, "aria-label": label }, icon(name));
  if (onClick) node.addEventListener("click", onClick);
  return node;
}

export function button(label, { kind = "", iconName = "", onClick, title = "" } = {}) {
  const node = h("button", { type: "button", class: "ez-btn " + (kind ? "ez-btn-" + kind : ""), title: title || undefined }, iconName ? icon(iconName, 16) : null, label ? h("span", { text: label }) : null);
  if (onClick) node.addEventListener("click", onClick);
  return node;
}

export function safeUrl(source) {
  if (typeof source !== "string" || !source) return "";
  try {
    const url = new URL(source, document.baseURI);
    if (["https:", "http:", "blob:"].includes(url.protocol)) return url.href;
    if (url.protocol === "data:" && /^data:image\/(png|jpeg|webp|gif|avif);/i.test(source)) return url.href;
  } catch {}
  return "";
}

const PALETTE = ["#8b9dff", "#43d9c0", "#f2b45a", "#ff8a7a", "#c792ea", "#5fd38d", "#6cc6ff", "#f78fb3", "#d9b872", "#9ad36a"];

export function colorFor(value) {
  let hash = 0;
  for (const character of String(value ?? "")) hash = (hash * 31 + character.codePointAt(0)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

export function initials(name) {
  const words = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  return (words[0][0] + (words.length > 1 ? words[words.length - 1][0] : words[0][1] || "")).toUpperCase();
}

export function avatar(name, image, size = 32, color) {
  const node = h("span", { class: "ez-avatar", style: { width: size + "px", height: size + "px", fontSize: Math.round(size * 0.38) + "px", background: color || colorFor(name) } });
  const url = safeUrl(image);
  if (url) {
    const picture = h("img", { alt: "", src: url, draggable: false });
    picture.onerror = () => {
      picture.remove();
      node.textContent = initials(name);
    };
    node.append(picture);
  } else node.textContent = initials(name);
  return node;
}

export function timeLabel(timestamp) {
  const date = new Date(Number(timestamp) || 0);
  if (!Number.isFinite(date.getTime()) || !timestamp) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function clamp(value, low, high) {
  return Math.min(high, Math.max(low, value));
}

export function keyed(parent, items, keyOf, create, update) {
  const existing = new Map();
  for (const child of [...parent.children]) {
    if (child.dataset.key !== undefined) existing.set(child.dataset.key, child);
  }
  const used = new Set();
  const wanted = items.map((item, index) => {
    const key = String(keyOf(item, index));
    let node = existing.get(key);
    if (!node || used.has(key)) {
      node = create(item, index);
      node.dataset.key = key;
    }
    used.add(key);
    update?.(node, item, index);
    return node;
  });
  for (const [key, node] of existing) if (!used.has(key)) node.remove();
  let cursor = parent.firstElementChild;
  for (const node of wanted) {
    if (node === cursor) cursor = cursor.nextElementSibling;
    else parent.insertBefore(node, cursor);
  }
}

export function drag(node, { start, move, end, threshold = 0, button: wanted = 0 } = {}, signal) {
  const down = (event) => {
    if (event.button !== wanted && event.pointerType === "mouse") return;
    const origin = { x: event.clientX, y: event.clientY };
    let active = threshold === 0;
    let context = active ? start?.(event, origin) : undefined;
    if (active && context === false) return;
    if (active) node.setPointerCapture?.(event.pointerId);
    const onMove = (next) => {
      const delta = { x: next.clientX - origin.x, y: next.clientY - origin.y };
      if (!active) {
        if (Math.hypot(delta.x, delta.y) < threshold) return;
        active = true;
        context = start?.(event, origin);
        if (context === false) {
          finish(next, true);
          return;
        }
        try {
          node.setPointerCapture?.(event.pointerId);
        } catch {}
      }
      move?.(next, delta, context);
    };
    const finish = (next, cancelled = false) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      try {
        node.releasePointerCapture?.(event.pointerId);
      } catch {}
      if (active && context !== false) end?.(next, { x: next.clientX - origin.x, y: next.clientY - origin.y }, context, cancelled);
    };
    const onUp = (next) => finish(next, false);
    const onCancel = (next) => finish(next, true);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
  };
  node.addEventListener("pointerdown", down, { signal });
}

let openMenu = null;

export function closeMenu() {
  openMenu?.();
  openMenu = null;
}

export function menu(items, position, onChoose) {
  closeMenu();
  ensureStyles();
  const list = h("div", { class: "ez-menu", role: "menu" });
  for (const item of items) {
    if (!item) continue;
    if (item.separator) {
      list.append(h("div", { class: "ez-menu-sep" }));
      continue;
    }
    if (item.heading) {
      list.append(h("div", { class: "ez-menu-heading", text: item.heading }));
      continue;
    }
    const row = h(
      "button",
      { type: "button", class: "ez-menu-item" + (item.danger ? " ez-danger" : ""), role: "menuitem", disabled: !!item.disabled },
      item.icon ? icon(item.icon, 16) : h("span", { class: "ez-menu-gap" }),
      h("span", { class: "ez-menu-label", text: item.label }),
      item.checked ? icon("check", 14) : null,
      item.hint ? h("kbd", { text: item.hint }) : null,
    );
    row.addEventListener("click", () => {
      closeMenu();
      onChoose?.(item.id, item);
    });
    list.append(row);
  }
  document.body.append(list);
  const bounds = list.getBoundingClientRect();
  const left = clamp(position.x, 8, innerWidth - bounds.width - 8);
  const top = position.y + bounds.height + 8 > innerHeight ? Math.max(8, (position.anchorTop ?? position.y) - bounds.height) : position.y;
  list.style.left = left + "px";
  list.style.top = top + "px";
  const dismiss = (event) => {
    if (event.type === "keydown" && event.key !== "Escape") return;
    if (event.type === "pointerdown" && list.contains(event.target)) return;
    closeMenu();
  };
  const timer = setTimeout(() => {
    window.addEventListener("pointerdown", dismiss, true);
    window.addEventListener("keydown", dismiss, true);
    window.addEventListener("blur", dismiss);
    window.addEventListener("resize", dismiss);
  }, 0);
  openMenu = () => {
    clearTimeout(timer);
    window.removeEventListener("pointerdown", dismiss, true);
    window.removeEventListener("keydown", dismiss, true);
    window.removeEventListener("blur", dismiss);
    window.removeEventListener("resize", dismiss);
    list.remove();
  };
  list.querySelector("button:not(:disabled)")?.focus({ preventScroll: true });
  return closeMenu;
}

export function contextMenu(node, build, onChoose, signal) {
  node.addEventListener(
    "contextmenu",
    (event) => {
      const items = build(event);
      if (!items || !items.length) return;
      event.preventDefault();
      event.stopPropagation();
      menu(items, { x: event.clientX, y: event.clientY }, (id, item) => onChoose(id, item, event));
    },
    { signal },
  );
}

export function typing(event) {
  const target = event.target;
  return target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
}

export function sameJSON(a, b) {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

export class Component {
  constructor(name, tag = "section") {
    ensureStyles();
    this.name = name;
    this.props = {};
    this.life = new AbortController();
    this.element = h(tag, { class: "ez ez-" + name.split(".").pop() });
    this.element.dataset.kit = name;
    this.slots = {};
  }
  get signal() {
    return this.life.signal;
  }
  slot(name, node) {
    node.dataset.slot = name;
    this.slots[name] = node;
    return node;
  }
  emit(name, payload = {}) {
    if (this.props.disabled) return;
    this.onEvent?.(name, payload);
  }
  on(target, type, handler, options) {
    target.addEventListener(type, handler, { ...(typeof options === "object" ? options : { capture: !!options }), signal: this.life.signal });
  }
  changed(props, ...keys) {
    const previous = this.previous || {};
    return keys.some((key) => !sameJSON(previous[key], props[key]));
  }
  update(props) {
    this.render(props, this.previous || {});
    this.props = props;
    this.previous = props;
  }
  render() {}
  destroy() {
    this.life.abort();
    this.element.remove();
  }
}
