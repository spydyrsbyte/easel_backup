import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const out = fileURLToPath(new URL("../server/easel/modules/vtt/client/samples/", import.meta.url));
fs.mkdirSync(out, { recursive: true });
const write = (name, text) => fs.writeFileSync(path.join(out, name), text.replace(/\n\s+/g, "\n").trim() + "\n");
let seed = 20261112;
const random = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};
const between = (low, high) => low + random() * (high - low);

const CELL = 100;
const rooms = [
  { id: "common", name: "Common room", box: [2, 2, 10, 8], floor: "planks" },
  { id: "kitchen", name: "Kitchen", box: [10, 2, 14, 5], floor: "tiles" },
  { id: "hall", name: "Back hall", box: [10, 5, 16, 7], floor: "flags" },
  { id: "vault", name: "Cellar vault", box: [14, 7, 18, 12], floor: "flags" },
  { id: "store", name: "Storeroom", box: [2, 8, 6, 12], floor: "planks" },
  { id: "yard", name: "Yard", box: [6, 8, 14, 12], floor: "cobbles" },
];
const doors = [
  { id: "door-entrance", a: [2, 4], b: [2, 5] },
  { id: "door-kitchen", a: [10, 3], b: [10, 4] },
  { id: "door-hall", a: [10, 6], b: [10, 7] },
  { id: "door-pantry", a: [12, 5], b: [13, 5] },
  { id: "door-vault", a: [15, 7], b: [16, 7], locked: true },
  { id: "door-store", a: [3, 8], b: [4, 8] },
  { id: "door-yard", a: [7, 8], b: [8, 8] },
  { id: "door-cellar", a: [14, 9], b: [14, 10] },
];

const edges = new Set();
const edgeKey = (x1, y1, x2, y2) => (x1 < x2 || (x1 === x2 && y1 < y2) ? [x1, y1, x2, y2] : [x2, y2, x1, y1]).join(",");
for (const room of rooms) {
  const [x0, y0, x1, y1] = room.box;
  for (let x = x0; x < x1; x++) {
    edges.add(edgeKey(x, y0, x + 1, y0));
    edges.add(edgeKey(x, y1, x + 1, y1));
  }
  for (let y = y0; y < y1; y++) {
    edges.add(edgeKey(x0, y, x0, y + 1));
    edges.add(edgeKey(x1, y, x1, y + 1));
  }
}
for (const door of doors) edges.delete(edgeKey(...door.a, ...door.b));
const horizontal = new Map();
const vertical = new Map();
for (const key of edges) {
  const [x1, y1, x2, y2] = key.split(",").map(Number);
  if (y1 === y2) horizontal.set(y1, [...(horizontal.get(y1) || []), x1]);
  else vertical.set(x1, [...(vertical.get(x1) || []), y1]);
}
const walls = [];
const merge = (lines, make) => {
  for (const [fixed, starts] of lines) {
    starts.sort((a, b) => a - b);
    let begin = starts[0];
    let previous = starts[0];
    for (const start of [...starts.slice(1), Infinity]) {
      if (start !== previous + 1) {
        walls.push(make(fixed, begin, previous + 1));
        begin = start;
      }
      previous = start;
    }
  }
};
merge(horizontal, (y, from, to) => ({ a: { x: from * CELL, y: y * CELL }, b: { x: to * CELL, y: y * CELL } }));
merge(vertical, (x, from, to) => ({ a: { x: x * CELL, y: from * CELL }, b: { x: x * CELL, y: to * CELL } }));

const lights = [
  { id: "light-hearth", x: 600, y: 250, radius: 620, color: "#ffb066", intensity: 1 },
  { id: "light-bar", x: 900, y: 660, radius: 380, color: "#ffd9a0", intensity: 0.8 },
  { id: "light-kitchen", x: 1200, y: 260, radius: 420, color: "#ffc27a", intensity: 0.9 },
  { id: "light-hall", x: 1320, y: 600, radius: 330, color: "#ffd9a0", intensity: 0.75 },
  { id: "light-vault", x: 1600, y: 950, radius: 430, color: "#7fd6ff", intensity: 0.85 },
  { id: "light-yard", x: 1000, y: 1010, radius: 520, color: "#b9c8ff", intensity: 0.55 },
  { id: "light-store", x: 400, y: 1000, radius: 300, color: "#ffd9a0", intensity: 0.6 },
];

const scene = {
  name: "The Gilded Tankard",
  size: { width: 2000, height: 1400 },
  grid: { type: "square", size: CELL, offset: { left: 0, top: 0 }, relativesize: { size: 5, label: "ft" }, color: "#ffffff26", visible: true },
  ambient: 0.22,
  image: "tavern.svg",
  walls: walls.map((wall, index) => ({ id: "wall-" + (index + 1), kind: "wall", ...wall })),
  doors: doors.map((door) => ({ id: door.id, kind: "door", door: true, open: false, locked: !!door.locked, a: { x: door.a[0] * CELL, y: door.a[1] * CELL }, b: { x: door.b[0] * CELL, y: door.b[1] * CELL } })),
  columns: [
    { id: "column-1", kind: "column", column: true, center: { x: 1500, y: 850 }, radius: 28 },
    { id: "column-2", kind: "column", column: true, center: { x: 1700, y: 850 }, radius: 28 },
  ],
  lights,
  tokens: [
    { name: "Aldric", image: "token-knight.svg", x: 350, y: 450, disposition: "friendly", player: true, light: 0 },
    { name: "Mira", image: "token-mage.svg", x: 450, y: 550, disposition: "friendly", player: true, light: 260 },
    { name: "Pip", image: "token-rogue.svg", x: 350, y: 650, disposition: "friendly", player: true, light: 0 },
    { name: "Innkeeper Bram", image: "token-keeper.svg", x: 850, y: 750, disposition: "neutral" },
    { name: "Cellar Rat", image: "token-beast.svg", x: 1550, y: 1050, disposition: "hostile" },
    { name: "Cellar Rat", image: "token-beast.svg", x: 1650, y: 1150, disposition: "hostile" },
    { name: "The Collector", image: "token-skull.svg", x: 1650, y: 950, disposition: "hostile", hidden: true },
  ],
};
fs.writeFileSync(path.join(out, "tavern.json"), JSON.stringify(scene, null, 2) + "\n");

const patterns = `
  <pattern id="planks" width="200" height="50" patternUnits="userSpaceOnUse">
    <rect width="200" height="50" fill="#6a4a2f"/>
    <rect width="200" height="24" fill="#73512f"/>
    <path d="M0 0h200M0 25h200M70 0v25M150 25v25" stroke="#3d2a19" stroke-width="2.5"/>
    <path d="M10 8h40M100 14h50M20 36h70M130 40h50" stroke="#8a6540" stroke-width="1" opacity=".45"/>
  </pattern>
  <pattern id="tiles" width="50" height="50" patternUnits="userSpaceOnUse">
    <rect width="50" height="50" fill="#8d8474"/>
    <rect x="2" y="2" width="46" height="46" rx="3" fill="#9c9382"/>
    <path d="M6 10l12 4M30 34l10 6" stroke="#7a7263" stroke-width="1.2" opacity=".6"/>
  </pattern>
  <pattern id="flags" width="100" height="100" patternUnits="userSpaceOnUse">
    <rect width="100" height="100" fill="#4f545c"/>
    <rect x="2" y="2" width="58" height="46" rx="4" fill="#626872"/>
    <rect x="64" y="2" width="34" height="46" rx="4" fill="#5b6069"/>
    <rect x="2" y="52" width="34" height="46" rx="4" fill="#5f646e"/>
    <rect x="40" y="52" width="58" height="46" rx="4" fill="#676d78"/>
  </pattern>
  <pattern id="cobbles" width="60" height="52" patternUnits="userSpaceOnUse">
    <rect width="60" height="52" fill="#3a4038"/>
    <ellipse cx="15" cy="13" rx="13" ry="11" fill="#58604f"/>
    <ellipse cx="45" cy="13" rx="13" ry="11" fill="#515948"/>
    <ellipse cx="0" cy="39" rx="13" ry="11" fill="#555d4c"/>
    <ellipse cx="30" cy="39" rx="13" ry="11" fill="#5d6553"/>
    <ellipse cx="60" cy="39" rx="13" ry="11" fill="#555d4c"/>
  </pattern>
  <radialGradient id="shade" cx="50%" cy="50%" r="72%">
    <stop offset="55%" stop-color="#000" stop-opacity="0"/>
    <stop offset="100%" stop-color="#000" stop-opacity=".5"/>
  </radialGradient>
  <radialGradient id="ember" cx="50%" cy="50%" r="50%">
    <stop offset="0%" stop-color="#ffd27a"/>
    <stop offset="60%" stop-color="#ff7b2e"/>
    <stop offset="100%" stop-color="#7a2a10"/>
  </radialGradient>
  <filter id="rough"><feTurbulence type="fractalNoise" baseFrequency=".02" numOctaves="3" seed="7"/><feColorMatrix values="0 0 0 0 .08  0 0 0 0 .09  0 0 0 0 .11  0 0 0 .9 0"/></filter>
  <filter id="soft"><feGaussianBlur stdDeviation="6"/></filter>`;

const px = (cells) => cells * CELL;
const table = (cx, cy, r = 46) => `<circle cx="${cx}" cy="${cy + 6}" r="${r}" fill="#000" opacity=".35" filter="url(#soft)"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="#8a5a33" stroke="#4a2f1a" stroke-width="5"/><circle cx="${cx}" cy="${cy}" r="${r - 12}" fill="none" stroke="#a06b3d" stroke-width="2" opacity=".6"/>`;
const stool = (cx, cy) => `<circle cx="${cx}" cy="${cy}" r="15" fill="#5e3d22" stroke="#33200f" stroke-width="3"/>`;
const barrel = (cx, cy, r = 30) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#6b4425" stroke="#2f1d0e" stroke-width="5"/><circle cx="${cx}" cy="${cy}" r="${r - 10}" fill="none" stroke="#8b8c8f" stroke-width="3"/><path d="M${cx - r + 8} ${cy}h${2 * r - 16}" stroke="#3a2412" stroke-width="2"/>`;
const crate = (x, y, s = 60) => `<rect x="${x}" y="${y}" width="${s}" height="${s}" rx="4" fill="#7b5a34" stroke="#3a2714" stroke-width="5"/><path d="M${x} ${y}l${s} ${s}M${x + s} ${y}l${-s} ${s}" stroke="#4d351d" stroke-width="4"/>`;
let furniture = "";
for (const [cx, cy] of [[420, 420], [420, 640], [700, 520]]) {
  furniture += table(cx, cy);
  for (let index = 0; index < 4; index++) furniture += stool(cx + Math.cos((index * Math.PI) / 2 + 0.6) * 72, cy + Math.sin((index * Math.PI) / 2 + 0.6) * 72);
}
furniture += `<rect x="520" y="204" width="160" height="56" rx="6" fill="#3b3f47" stroke="#22252b" stroke-width="6"/><ellipse cx="600" cy="236" rx="56" ry="18" fill="url(#ember)"/>`;
furniture += `<rect x="760" y="640" width="210" height="60" rx="8" fill="#7a4f2a" stroke="#3d2713" stroke-width="6"/><rect x="772" y="652" width="186" height="14" rx="4" fill="#94663a"/>`;
for (const x of [800, 860, 920]) furniture += stool(x, 610);
furniture += barrel(950, 250) + barrel(940, 330, 26);
furniture += `<rect x="1040" y="214" width="320" height="50" rx="6" fill="#5c5f66" stroke="#2c2e33" stroke-width="5"/><ellipse cx="1200" cy="240" rx="50" ry="15" fill="url(#ember)"/><rect x="1060" y="380" width="150" height="70" rx="6" fill="#8a6a45" stroke="#42301b" stroke-width="5"/>`;
furniture += crate(240, 1040) + crate(310, 1060, 70) + crate(240, 1120, 50) + barrel(520, 870) + barrel(530, 950, 26) + barrel(460, 890, 24);
furniture += `<rect x="1560" y="1090" width="150" height="80" rx="8" fill="#3d3324" stroke="#b08a3c" stroke-width="5"/><path d="M1560 1126h150" stroke="#b08a3c" stroke-width="4"/><circle cx="1635" cy="1126" r="9" fill="#e2c16a"/>`;
furniture += `<circle cx="1600" cy="950" r="24" fill="#2b2f36" stroke="#60656f" stroke-width="5"/><circle cx="1600" cy="950" r="12" fill="#8fe0ff"/>`;
for (const [cx, cy] of [[1500, 850], [1700, 850]]) furniture += `<circle cx="${cx}" cy="${cy + 5}" r="34" fill="#000" opacity=".4" filter="url(#soft)"/><circle cx="${cx}" cy="${cy}" r="28" fill="#878d98" stroke="#3b3f47" stroke-width="5"/>`;
furniture += `<circle cx="1000" cy="1010" r="52" fill="#3b4047" stroke="#22262c" stroke-width="8"/><circle cx="1000" cy="1010" r="36" fill="#27425a"/><circle cx="990" cy="1000" r="12" fill="#3e6a8c" opacity=".7"/>`;
for (let index = 0; index < 14; index++) furniture += `<circle cx="${between(650, 1350)}" cy="${between(830, 1170)}" r="${between(3, 7)}" fill="#6f7a5c" opacity=".7"/>`;

let floors = "";
let shades = "";
let outline = "";
for (const room of rooms) {
  const [x0, y0, x1, y1] = room.box;
  floors += `<rect x="${px(x0)}" y="${px(y0)}" width="${px(x1 - x0)}" height="${px(y1 - y0)}" fill="url(#${room.floor})"/>`;
  shades += `<rect x="${px(x0)}" y="${px(y0)}" width="${px(x1 - x0)}" height="${px(y1 - y0)}" fill="url(#shade)"/>`;
}
for (const wall of walls) outline += `M${wall.a.x} ${wall.a.y}L${wall.b.x} ${wall.b.y}`;
let doorArt = "";
for (const door of scene.doors) doorArt += `<path d="M${door.a.x} ${door.a.y}L${door.b.x} ${door.b.y}" stroke="#8a5a2c" stroke-width="12" stroke-linecap="butt"/><path d="M${door.a.x} ${door.a.y}L${door.b.x} ${door.b.y}" stroke="#c08a4a" stroke-width="4"/>`;

write(
  "tavern.svg",
  `<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="1400" viewBox="0 0 2000 1400">
  <defs>${patterns}</defs>
  <rect width="2000" height="1400" fill="#14171d"/>
  <rect width="2000" height="1400" filter="url(#rough)" opacity=".9"/>
  ${floors}
  ${shades}
  ${furniture}
  ${doorArt}
  <path d="${outline}" stroke="#0c0d10" stroke-width="26" stroke-linecap="square" fill="none"/>
  <path d="${outline}" stroke="#3c3f47" stroke-width="16" stroke-linecap="square" fill="none"/>
  <path d="${outline}" stroke="#6a6f7a" stroke-width="4" stroke-linecap="square" fill="none" opacity=".55"/>
  </svg>`,
);

const tokens = {
  knight: ["#3b6fd9", "#a9c3ff", "M32 12l14 6v12c0 10-6 17-14 22-8-5-14-12-14-22V18z"],
  mage: ["#7a3fd1", "#e2c9ff", "M32 9l5.500 12.500L51 23l-10 9.500L43.500 46 32 39.500 20.500 46 23 32.500 13 23l13.500-1.500z"],
  rogue: ["#1f8f6f", "#b8f5df", "M32 10l5 26-5 6-5-6zM22 40h20l-3 5H25zM30 46h4v9h-4z"],
  keeper: ["#b0782c", "#ffe2b0", "M20 24h20v20a10 10 0 01-20 0zM40 28h5a5 5 0 010 10h-5M22 18c3-4 5-1 8-4s5 1 8-2"],
  beast: ["#a23a3a", "#ffc9c9", "M16 22l8 4c2-3 5-4 8-4s6 1 8 4l8-4-3 12c1 3 1 6-1 9-3 5-8 7-12 7s-9-2-12-7c-2-3-2-6-1-9zM26 33v.010M38 33v.010M29 42h6"],
  skull: ["#4a4458", "#e6e1f2", "M32 11c-10 0-17 7-17 16 0 6 3 10 7 13v7h20v-7c4-3 7-7 7-13 0-9-7-16-17-16zM25 27a4 4 0 100 8 4 4 0 000-8zM39 27a4 4 0 100 8 4 4 0 000-8zM29 47v-5M35 47v-5"],
};
for (const [name, [base, ink, glyph]] of Object.entries(tokens)) {
  write(
    "token-" + name + ".svg",
    `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 64 64">
    <defs><radialGradient id="g" cx="35%" cy="28%" r="80%"><stop offset="0%" stop-color="${ink}" stop-opacity=".55"/><stop offset="45%" stop-color="${base}"/><stop offset="100%" stop-color="#0b0d12"/></radialGradient></defs>
    <rect width="64" height="64" fill="url(#g)"/>
    <path d="${glyph}" fill="none" stroke="#0b0d12" stroke-width="5" stroke-linejoin="round" stroke-linecap="round" opacity=".55" transform="translate(0 1.500)"/>
    <path d="${glyph}" fill="${ink}" fill-opacity=".16" stroke="${ink}" stroke-width="2.600" stroke-linejoin="round" stroke-linecap="round"/>
    </svg>`,
  );
}

let stars = "";
for (let index = 0; index < 150; index++) stars += `<circle cx="${between(0, 1600).toFixed(0)}" cy="${between(0, 560).toFixed(0)}" r="${between(0.6, 2.2).toFixed(1)}" fill="#fff" opacity="${between(0.3, 0.95).toFixed(2)}"/>`;
write(
  "stage-sky.svg",
  `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">
  <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#070b1f"/><stop offset="55%" stop-color="#1b2550"/><stop offset="100%" stop-color="#4a3a63"/></linearGradient>
  <radialGradient id="halo" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#fff6d8" stop-opacity=".55"/><stop offset="100%" stop-color="#fff6d8" stop-opacity="0"/></radialGradient></defs>
  <rect width="1600" height="900" fill="url(#sky)"/>${stars}
  <circle cx="1220" cy="210" r="230" fill="url(#halo)"/><circle cx="1220" cy="210" r="86" fill="#fff4cf"/><circle cx="1196" cy="190" r="16" fill="#e9dcae" opacity=".7"/><circle cx="1246" cy="238" r="10" fill="#e9dcae" opacity=".6"/>
  </svg>`,
);
const ridge = (base, height, step, tone) => {
  let d = `M0 900L0 ${base}`;
  for (let x = 0; x <= 1600; x += step) d += `L${x} ${(base - Math.abs(Math.sin(x / 190 + height)) * height - between(0, 22)).toFixed(0)}`;
  return `<path d="${d}L1600 900z" fill="${tone}"/>`;
};
write("stage-hills.svg", `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">${ridge(640, 150, 40, "#232a52")}${ridge(720, 110, 32, "#191e3d")}</svg>`);
let windows = "";
for (const [x, y] of [[742, 420], [800, 470], [858, 420], [770, 560], [830, 560], [640, 520], [960, 540]]) windows += `<rect x="${x}" y="${y}" width="14" height="24" rx="6" fill="#ffcf73"/>`;
write(
  "stage-castle.svg",
  `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">
  <path d="M560 900V560h40v-40h20v40h40v-90h-14v-30h18v-22h16v22h20v-22h16v22h18v30h-14v40h60V330h-16v-34h20v-24h18v24h22v-24h18v24h22v-24h18v24h20v34h-16v180h60v-70h-14v-30h18v-22h16v22h20v-22h16v22h18v30h-14v90h40v-40h20v40h40v340z" fill="#0d1026"/>
  <path d="M790 272l28-92 28 92z" fill="#0d1026"/><path d="M818 180v-40l26 12-26 12" fill="#a33a4a"/>${windows}
  </svg>`,
);
let trees = "";
for (const [x, s] of [[70, 1.25], [230, 0.95], [1380, 1.1], [1520, 1.35], [1250, 0.8]]) trees += `<g transform="translate(${x} 900) scale(${s})"><rect x="-10" y="-150" width="20" height="150" fill="#05060d"/><path d="M0-430l-95 170h50l-75 130h240l-75-130h50z" fill="#05060d"/></g>`;
write("stage-trees.svg", `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">${trees}<path d="M0 900V820c200-30 420-34 640-14s520 26 960-10v104z" fill="#05060d"/></svg>`);
write(
  "stage-mist.svg",
  `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="300" viewBox="0 0 1600 300"><defs><filter id="b"><feGaussianBlur stdDeviation="26"/></filter></defs>
  <g filter="url(#b)" fill="#c9d4ff" opacity=".5"><ellipse cx="260" cy="170" rx="330" ry="56"/><ellipse cx="820" cy="140" rx="420" ry="50"/><ellipse cx="1350" cy="180" rx="330" ry="60"/></g></svg>`,
);
const figure = (tone, rim, extra) => `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="640" viewBox="0 0 360 640">
  <path d="M180 60c34 0 58 28 58 62 0 24-10 42-26 54 56 22 92 84 98 196l14 248H36l14-248c6-112 42-174 98-196-16-12-26-30-26-54 0-34 24-62 58-62z" fill="${tone}"/>
  <path d="M238 122c0 24-10 42-26 54 56 22 92 84 98 196l14 248h-22l-12-246c-6-104-40-162-98-186 22-12 30-36 30-66z" fill="${rim}" opacity=".7"/>${extra}</svg>`;
write("stage-hero.svg", figure("#101a33", "#7fb2ff", `<path d="M300 250l18-200 12 2-8 204z" fill="#c9d6f0"/><path d="M296 250h34l-4 22h-26z" fill="#8a6a3c"/>`));
write("stage-stranger.svg", figure("#1c0f22", "#ff9a6b", `<path d="M124 118c10-44 102-44 112 0-20-12-92-12-112 0z" fill="#05030a"/><circle cx="160" cy="128" r="5" fill="#ffd27a"/><circle cx="200" cy="128" r="5" fill="#ffd27a"/>`));

console.log("wrote samples to " + out);

const stage = {
  width: 1600,
  ratio: { width: 16, height: 9 },
  elements: [
    { id: "line", name: "Narration", kind: "dialogue", visible: true, x: 250, y: 640, width: 1100, height: 210, rotation: 0, fontSize: 34, speaker: "The Stranger", text: "You are late. The Collector does not like to be kept waiting, and neither do I.", color: "#f4f0e6", background: { color: "#0a0c14", opacity: 0.78 } },
    { id: "trees", name: "Foreground trees", kind: "image", visible: true, key: "stage-trees.svg", x: 0, y: 0, width: 1600, height: 900 },
    {
      id: "cast",
      name: "Cast",
      kind: "group",
      visible: true,
      children: [
        { id: "stranger", name: "Stranger", kind: "image", visible: true, key: "stage-stranger.svg", x: 980, y: 330, width: 300, height: 533, tint: "#ffd9c2", luminance: 0.5 },
        { id: "hero", name: "Hero", kind: "image", visible: true, key: "stage-hero.svg", x: 330, y: 360, width: 290, height: 516 },
      ],
    },
    { id: "mist", name: "Mist", kind: "image", visible: true, key: "stage-mist.svg", x: 0, y: 560, width: 1600, height: 300, alpha: 0.8 },
    { id: "castle", name: "Castle", kind: "image", visible: true, key: "stage-castle.svg", x: 0, y: 0, width: 1600, height: 900 },
    { id: "hills", name: "Hills", kind: "image", visible: true, key: "stage-hills.svg", x: 0, y: 0, width: 1600, height: 900 },
    { id: "sky", name: "Night sky", kind: "image", visible: true, key: "stage-sky.svg", x: 0, y: 0, width: 1600, height: 900 },
  ],
  toggles: [
    { id: "t-stranger", name: "Stranger", on: true, targets: ["stranger"] },
    { id: "t-mist", name: "Mist", on: true, targets: ["mist"] },
    { id: "t-line", name: "Dialogue", on: true, targets: ["line"] },
  ],
};
fs.writeFileSync(path.join(out, "stage.json"), JSON.stringify(stage, null, 2) + "\n");
const demo = fileURLToPath(new URL("../server/easel/applications/tabletop/server/demo.mjs", import.meta.url));
fs.writeFileSync(demo, "export const tavern = " + JSON.stringify(scene) + ";\nexport const stage = " + JSON.stringify(stage) + ";\n");
console.log("wrote " + demo);
