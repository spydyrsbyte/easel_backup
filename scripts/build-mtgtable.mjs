import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const save = path.resolve(
  process.argv[2] ||
    path.join(root, "..", "Mods", "Workshop", "2293586471.json"),
);
const mods = path.resolve(process.argv[3] || path.join(root, "..", "Mods"));
const target = path.join(root, "server/easel/applications/mtgtable");
const assets = path.join(target, "client/assets");
fs.mkdirSync(assets, { recursive: true });

const data = JSON.parse(fs.readFileSync(save, "utf8"));
const cache = {};
for (const folder of ["Images"])
  for (const file of fs.readdirSync(path.join(mods, folder)))
    cache[file.replace(/\.[^.]+$/, "").toLowerCase()] = path.join(
      mods,
      folder,
      file,
    );
const cached = (url) =>
  url ? cache[url.replace(/[^A-Za-z0-9]/g, "").toLowerCase()] : undefined;
const scryfall = (url) =>
  url?.startsWith("https://img.klrmngr.com/")
    ? url.replace("https://img.klrmngr.com/", "https://cards.scryfall.io/")
    : undefined;

const objects = [];
const walk = (object, parent) => {
  objects.push({ object, parent });
  for (const child of object.ContainedObjects || []) walk(child, object);
};
for (const object of data.ObjectStates) walk(object, null);
const byGuid = (guid) =>
  objects.find(({ object }) => object.GUID === guid)?.object;
const top = data.ObjectStates;
const clean = (text = "") =>
  text
    .replace(/\[\/?[a-z]+\]/gi, "")
    .replace(/\[[0-9A-Fa-f]{6}\]|\[-\]/g, "")
    .trim();
const round = (value) => Math.round(value * 1000) / 1000;
const transform = (object) => ({
  x: round(object.Transform.posX),
  z: round(object.Transform.posZ),
  rot: Math.round(((object.Transform.rotY % 360) + 360) % 360),
});

const crops = [];
const asset = (source, name, options = {}) => {
  if (!source) return undefined;
  crops.push({ source, target: path.join(assets, name), ...options });
  return name;
};

const colors = ["White", "Red", "Yellow", "Green", "Blue", "Purple"];
const rgb = Object.fromEntries(
  Object.values(data.TabStates)
    .filter((tab) => colors.includes(tab.color))
    .map((tab) => [
      tab.color,
      [tab.visibleColor.r, tab.visibleColor.g, tab.visibleColor.b].map(
        (value) => round(value),
      ),
    ]),
);
rgb.White = [1, 1, 1];

const global = data.LuaScript;
const guid = (key, color) =>
  global.match(
    new RegExp(`data\\["${color}"\\]\\["${key}"\\]\\s*=\\s*getObjectFromGUID\\("(\\w+)"\\)`),
  )[1];
const spawns = {
  White: { main: [25, -5, 180], part: [28, -5, 180] },
  Red: { main: [-5, -5, 180], part: [-2, -5, 180] },
  Yellow: { main: [-35, -5, 180], part: [-32, -5, 180] },
  Green: { main: [-25, 5, 0], part: [-28, 5, 0] },
  Blue: { main: [5, 5, 0], part: [2, 5, 0] },
  Purple: { main: [35, 5, 0], part: [32, 5, 0] },
};
const described = (name, color) =>
  top
    .filter(
      (object) =>
        clean(object.Nickname) === name && object.Description === color,
    )
    .map(transform);
const seats = {};
for (const color of colors) {
  const library = byGuid(guid("libraryZone", color));
  const playmat = byGuid(guid("playmat", color));
  const lib = transform(library);
  const forward = lib.rot === 0 ? [0, 1] : [0, -1];
  const right = lib.rot === 0 ? [1, 0] : [-1, 0];
  const hands = top
    .filter((object) => object.Name === "HandTrigger" && object.FogColor === color)
    .sort((a, b) => b.Transform.scaleX - a.Transform.scaleX)
    .map((object) => ({
      ...transform(object),
      w: round(object.Transform.scaleX),
      h: round(object.Transform.scaleZ),
    }));
  const button = (key) => {
    const object = byGuid(guid(key, color));
    return { ...transform(object) };
  };
  const mulligan = byGuid(guid("mulliganButton", color));
  seats[color] = {
    rgb: rgb[color],
    base: transform(playmat).rot,
    forward,
    right,
    library: lib,
    graveyard: transform(byGuid(guid("graveyard", color))),
    exile: {
      x: round(lib.x + forward[0] * 3.17),
      z: round(lib.z + forward[1] * 3.17),
      rot: (lib.rot + 270) % 360,
    },
    playmat: {
      ...transform(playmat),
      w: round(playmat.Transform.scaleX),
      h: round(playmat.Transform.scaleZ),
    },
    hands,
    buttons: {
      draw: button("drawButton"),
      scry: button("scryButton"),
      mill: button("millButton"),
      untap: button("untapButton"),
      reveal: button("revealButton"),
    },
    mulligan: {
      ...transform(mulligan),
      w: round(mulligan.Transform.scaleX * 2.5 * 2),
      h: round(mulligan.Transform.scaleZ * 2.5 * 2 * (369 / 1024)),
    },
    commander: described("Commander Zone", color).sort((a, b) => a.z - b.z),
    life: described("Life Tracker", color)[0],
    timer: described("Timer", color)[0],
    highlight: described("Highlight Mat", color)[0],
    spawn: {
      main: { x: spawns[color].main[0], z: spawns[color].main[1], rot: spawns[color].main[2] },
      part: { x: spawns[color].part[0], z: spawns[color].part[1], rot: spawns[color].part[2] },
    },
  };
}

const source = (object) =>
  object.CustomImage?.ImageURL || object.CustomMesh?.DiffuseURL;
const icon = (object, name, crop) =>
  asset(cached(source(object)), name, crop);
const upper = { crop: [0, 0, 512, 512], size: [256, 256], circle: true };

const images = {
  table: asset(cached(data.TableURL), "table.png", { size: [4096, 2415] }),
  back: asset(
    cached(
      "https://steamusercontent-a.akamaihd.net/ugc/1647720103762682461/35EF6E87970E2A5D6581E7D96A99F8A575B7A15F/",
    ),
    "back.jpg",
    { size: [488, 680] },
  ),
};
const first = (name) =>
  top.find(
    (object) => clean(object.Nickname) === name && !object.Name.includes("Bag"),
  );
const contained = (name) =>
  objects.find(
    ({ object, parent }) => parent && clean(object.Nickname) === name,
  )?.object;
for (const [key, name] of [
  ["draw", "Draw"],
  ["scry", "Scry"],
  ["mill", "Mill"],
  ["untap", "Untap"],
  ["reveal", "Reveal"],
])
  images[key] = icon(first(name), key + ".png", upper);
images.mulligan = icon(first("Mulligan"), "mulligan.png", { size: [512, 185] });
images.life = icon(first("Life Tracker"), "life.png", { size: [256, 256] });
images.commanderDamage = icon(
  contained("Red Commander Damage"),
  "commander-damage.png",
  { size: [200, 216] },
);
for (const color of ["White", "Blue", "Black", "Red", "Green", "Colorless"])
  images["mana" + color] = icon(
    contained(color + " Mana Counter"),
    "mana-" + color.toLowerCase() + ".png",
    upper,
  );
for (const name of ["Renowned", "Monstrous", "Suspend Counter", "Frozen", "Haste"])
  images[name] = icon(
    contained(name),
    name.split(" ")[0].toLowerCase() + ".png",
    upper,
  );
images.loyalty = icon(first("Loyality Counter"), "loyalty.png", { size: [340, 208] });
images.rhystic = icon(contained("Rhystic Block 1"), "rhystic.png", { size: [316, 315] });
images.plusxy = icon(first("+X/+Y Counter"), "plusxy.png", { size: [388, 196] });
images.counter = icon(first("Counter"), "counter.png", { size: [200, 200] });
images.notecard = icon(first("Notecard"), "notecard.png", { size: [504, 336] });
images.dropCounter = icon(first("Drop-On-Card Counter"), "drop-counter.png", { size: [368, 513] });
images.energy = icon(first("Energy Counter"), "energy.jpg", { size: [336, 468] });
images.experience = icon(first("Experience Counter"), "experience.jpg", { size: [336, 468] });
images.poison = icon(first("Poison Counter"), "poison.jpg", { size: [336, 468] });
images.krark = icon(contained("Krark's Coin Flipper"), "krark.jpg", { size: [488, 680] });
images.instructions = icon(first("Table Instructions"), "instructions.png", { size: [1600, 1358] });
images.commands = icon(first("Chat Commands"), "chat-commands.png", { size: [1600, 1316] });
for (const [color, name] of [
  ["white", "whiteMana"],
  ["blue", "blueMana"],
  ["black", "blackMana"],
  ["red", "redMana"],
  ["green", "greenMana"],
  ["colorless", "colorlessMana"],
])
  images["ui-" + color] = asset(
    cached(data.CustomUIAssets.find((item) => item.Name === name).URL),
    "ui-" + color + ".png",
    { size: [64, 64] },
  );

const parseLuaArray = (script, name) => {
  const start = script.indexOf(name + " = {");
  if (start < 0) return [];
  let depth = 0,
    end = start + name.length + 3;
  for (let index = end; index < script.length; index++) {
    if (script[index] === "{") depth++;
    if (script[index] === "}" && --depth === 0) {
      end = index;
      break;
    }
  }
  return script.slice(start + name.length + 3, end + 1);
};
const tracker = (object) => {
  const script = object.LuaScript;
  const positions = [
    ...parseLuaArray(script, "positions").matchAll(
      /\{\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\}/g,
    ),
  ].map((match) => [Number(match[1]), Number(match[3])]);
  const sizes = [
    ...parseLuaArray(script, "width_height").matchAll(
      /\{\s*(\d+)\s*,\s*(\d+)\s*\}/g,
    ),
  ].map((match) => [Number(match[1]), Number(match[2])]);
  const labels = [
    ...parseLuaArray(script, "labs").matchAll(/"((?:[^"\\]|\\.)*)"/g),
  ].map((match) => clean(match[1].replace(/\\n/g, "\n")));
  let tokens = [];
  try {
    const state = JSON.parse(object.LuaScriptState);
    tokens = (state.data || []).map((card) => ({
      name: card.name,
      type: card.type_line,
      oracle: card.oracle_text || "",
      face: (card.image_uris?.large || card.card_faces?.[0]?.image_uris?.large || "").replace(/\?.*/, ""),
    }));
  } catch {}
  const spawnsByRoom = {};
  for (const match of script.matchAll(
    /function press(\d+)\(([\s\S]*?)(?=\nfunction |$)/g,
  )) {
    const spawned = match[2].match(/spawnTokens\(\{([\d,\s]+)\}\)/);
    if (spawned)
      spawnsByRoom[match[1]] = spawned[1]
        .split(",")
        .map((value) => Number(value.trim()) - 1);
  }
  return {
    mode: script.includes("pressedButton <= i-1") ? "level" : "room",
    rooms: positions.map(([x, z], index) => ({
      x,
      z,
      w: round((sizes[index]?.[0] || 500) / 1000),
      h: round((sizes[index]?.[1] || 300) / 1000),
      label: labels[index] || "",
      tokens: spawnsByRoom[index + 1] || [],
    })),
    tokens,
  };
};

const cardFace = (object) => {
  const deck = object.CustomDeck && Object.values(object.CustomDeck)[0];
  return deck?.FaceURL;
};
const cardSpec = (object, file) => {
  const lines = (object.Nickname || "").split("\n");
  const name = clean(lines[0]);
  const typeMatch = (lines[1] || "").match(/^(.*?)\s*(-?\d+)CMC/);
  const face = cardFace(object);
  return {
    name,
    type: typeMatch ? typeMatch[1].trim() : clean(lines[1] || ""),
    cmc: typeMatch ? Number(typeMatch[2]) : 0,
    oracle: clean(object.Description || ""),
    face: cached(face) && file
      ? asset(cached(face), file, { size: [488, 680] })
      : scryfall(face) || "",
  };
};

const initial = [];
let serial = 0;
const add = (entry) => initial.push({ id: "t" + ++serial, ...entry });
const bag = (object, template, extra = {}) =>
  add({ kind: "bag", template, ...transform(object), ...extra });

for (const object of top) {
  const name = clean(object.Nickname);
  const place = transform(object);
  const commander = name.match(/^(\w+) Commander Damage$/);
  if (commander && object.Name.includes("Bag"))
    bag(object, "commander-damage", { color: commander[1] });
  else if (object.Name === "Infinite_Bag" && /^d(\d+)$/.test(name))
    bag(object, "die", { sides: Number(name.slice(1)) });
  else if (
    object.Name === "Custom_Assetbundle_Infinite_Bag" &&
    name !== "Turn Skipper Puck"
  )
    bag(object, "keyword", { keyword: name });
  else if (/^(Renowned|Monstrous|Frozen|Haste)$/.test(name) && object.Name.includes("Bag"))
    bag(object, "status", { status: name });
  else if (name === "Suspend Counter" && object.Name.includes("Bag"))
    bag(object, "suspend");
  else if (/Mana Counter$/.test(name) && object.Name.includes("Bag"))
    bag(object, "mana", { mana: name.split(" ")[0] });
  else if (name === "Loyalty Counter") bag(object, "loyalty");
  else if (name === "+X/+Y Counter" && object.Name.includes("Bag"))
    bag(object, "plusxy");
  else if (name === "Counter" && object.Name.includes("Bag"))
    bag(object, "counter");
  else if (name === "Text + Counter" && object.Name.includes("Bag"))
    bag(object, "text");
  else if (name === "Notecard" && object.Name.includes("Bag"))
    bag(object, "notecard");
  else if (name === "Drop-On-Card Counter" && object.Name.includes("Bag"))
    bag(object, "drop-counter");
  else if (/^(Energy|Experience|Poison) Counter$/.test(name) && object.Name.includes("Bag"))
    bag(object, "player-counter", { counter: name.split(" ")[0] });
  else if (name === "Rhystic Block Bag") bag(object, "rhystic");
  else if (name === "Turn Skipper Puck") bag(object, "skipper");
  else if (name === "Krark's Coin Flipper") bag(object, "krark");
  else if (name === "Who goes first?")
    add({ kind: "die", template: "first", x: -53.5, z: 9.5, rot: 0, value: "?" });
  else if (name === "Turn Order")
    add({
      kind: "card",
      ...place,
      locked: false,
      card: {
        name: "Turn Order",
        type: "Reference",
        cmc: 0,
        oracle: "Turn order in Magic: The Gathering.",
        face: asset(cached(cardFace(object)), "turn-order.jpg", { size: [446, 768] }),
      },
      scale: 2.42,
    });
  else if (name === "Planechase") {
    const decks = (object.ContainedObjects || [])
      .filter((child) => child.Name === "Deck")
      .map((deck) => ({
        name: clean(deck.Nickname),
        cards: deck.ContainedObjects.map((card) => cardSpec(card)),
      }));
    add({
      kind: "bag",
      template: "planechase",
      ...place,
      decks
    });
  } else if (object.Name === "Card" || object.Name === "CardCustom") {
    const file =
      name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") +
      ".jpg";
    const card = cardSpec(object, file);
    if (object.States) {
      const other = Object.values(object.States)[0];
      card.dfc = cardSpec(other, "night.jpg");
    }
    const entry = { kind: "card", ...place, card };
    if (/positions\s*=/.test(object.LuaScript || ""))
      entry.tracker = tracker(object);
    if (/Token Creature/.test(object.Nickname)) entry.card.token = true;
    add(entry);
  } else if (name === "Monarch")
    add({ kind: "token", template: "monarch", ...place });
}

const layout = {
  source: data.SaveName,
  world: { x0: -62, x1: 62, z0: -40, z1: 40 },
  table: { image: images.table, x0: -43.95, x1: 43.95, z0: -25.9, z1: 25.9 },
  card: { w: 2.2, h: 3.05 },
  colors,
  order: colors,
  seats,
  images,
  initial,
};

const text = JSON.stringify(layout, null, 1);
fs.writeFileSync(path.join(target, "client/layout.json"), text);
fs.writeFileSync(
  path.join(target, "server/layout.mjs"),
  "export const layout = " + text + ";\n",
);

const script = path.join(target, "crop.tmp.ps1");
fs.writeFileSync(
  script,
  `param($list)
Add-Type -AssemblyName System.Drawing
foreach ($line in Get-Content $list) {
  $item = $line | ConvertFrom-Json
  $image = [System.Drawing.Image]::FromFile($item.source)
  $crop = if ($item.crop) { $item.crop } else { @(0, 0, $image.Width, $image.Height) }
  $size = if ($item.size) { $item.size } else { @($crop[2], $crop[3]) }
  $bitmap = New-Object System.Drawing.Bitmap $size[0], $size[1]
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $destination = New-Object System.Drawing.Rectangle 0, 0, $size[0], $size[1]
  if ($item.circle) {
    $clip = New-Object System.Drawing.Drawing2D.GraphicsPath
    $clip.AddEllipse(0, 0, $size[0], $size[1])
    $graphics.SetClip($clip)
  }
  $graphics.DrawImage($image, $destination, $crop[0], $crop[1], $crop[2], $crop[3], [System.Drawing.GraphicsUnit]::Pixel)
  $format = if ($item.target.EndsWith(".jpg")) { [System.Drawing.Imaging.ImageFormat]::Jpeg } else { [System.Drawing.Imaging.ImageFormat]::Png }
  $bitmap.Save($item.target, $format)
  $graphics.Dispose(); $bitmap.Dispose(); $image.Dispose()
}
`,
);
const list = path.join(target, "crop.tmp.jsonl");
fs.writeFileSync(list, crops.map((item) => JSON.stringify(item)).join("\n"));
try {
  execFileSync(
    "powershell",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, list],
    { stdio: "inherit" },
  );
} finally {
  fs.rmSync(script, { force: true });
  fs.rmSync(list, { force: true });
}
const keywords = path.join(root, "server/easel/applications/mtg/client/battlemaps/classic");
const iconTarget = path.join(assets, "icons");
fs.mkdirSync(iconTarget, { recursive: true });
for (const file of fs.readdirSync(path.join(keywords, "counters")))
  fs.copyFileSync(path.join(keywords, "counters", file), path.join(iconTarget, file));
fs.copyFileSync(
  path.join(keywords, "LICENSE-mana-OFL.txt"),
  path.join(iconTarget, "LICENSE-OFL.txt"),
);
console.log(
  `${Object.keys(seats).length} seats, ${initial.length} objects, ${crops.length} images`,
);
