import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { randomInt } from "node:crypto";
const root = path.resolve("server/easel/server/library");
const libraries = JSON.parse(
  fs.readFileSync(path.join(root, "catalog.json"), "utf8"),
).libraries;
const FormulaService = (await import('../server/easel/server/library/rules/server/formula.mjs')).default;
const StackingService = (await import('../server/easel/server/library/effects/server/stacking.mjs')).default;
globalThis.Easel = {
  Random: { integer: (min, max) => randomInt(min, max) },
  Interfaces: { create: (name) => name === "easel.rules.formula@1" ? new FormulaService() : name === "easel.effects.stacking@1" ? new StackingService() : null }
};
const frozen = (value) => {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value)) frozen(child);
  }
  return value;
};
for (const library of libraries) {
  const kit = JSON.parse(
    fs.readFileSync(path.join(root, library.host, "catalog.json"), "utf8"),
  );
  test(library.host + " exposes independent lazy files", () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(root, library.host, "manifest.json"), "utf8"),
    );
    assert.equal(manifest.type, "kit");
    assert.equal(manifest.owner, "easel");
    assert.equal(manifest.host, library.host);
    assert.equal(manifest.server?.library, undefined);
    assert.equal(manifest.server?.application, undefined);
    assert.equal(manifest.server?.security, undefined);
    assert.equal(manifest.server?.data, undefined);
    assert.equal(manifest.client?.library, undefined);
    for (const m of kit.members) {
      assert.ok(fs.existsSync(path.join(root, library.host, m.entry)));
      assert.ok(fs.existsSync(path.join(root, library.host, m.contract)));
      if (m.side === "client") {
        const c = JSON.parse(
          fs.readFileSync(path.join(root, library.host, m.contract), "utf8"),
        );
        assert.equal(c.kind, "component");
        assert.ok(c.properties && c.events && c.slots);
      }
    }
  });
  for (const member of kit.members.filter((m) => m.side === "server"))
    test(
      "easel." + library.host + "." + member.name + " contract and failures",
      async () => {
        const Class = (
          await import(
            pathToFileURL(path.join(root, library.host, member.entry))
          )
        ).default;
        assert.equal(typeof Class, "function");
        const tool = new Class();
        assert.ok(member.examples.length);
        for (const example of member.examples) {
          const args = frozen(structuredClone(example.args)),
            before = JSON.stringify(args);
          assert.equal(typeof tool[example.method], "function");
          if (example.throws)
            assert.throws(() => tool[example.method](...args));
          else
            assert.deepEqual(tool[example.method](...args), example.expected);
          assert.equal(
            JSON.stringify(args),
            before,
            "tool must preserve input",
          );
        }
        assert.equal(
          Object.keys(tool).length,
          0,
          "tool instances do not hold game state",
        );
      },
    );
}
test("shuffles preserve membership and caller order", async () => {
  const Shuffle = (
    await import(pathToFileURL(path.join(root, "cards/server/shuffle.mjs")))
  ).default;
  const values = Array.from({ length: 1000 }, (_, i) => "card-" + i),
    before = values.slice();
  const shuffled = new Shuffle().shuffle(values);
  assert.deepEqual(values, before);
  assert.deepEqual([...shuffled].sort(), [...values].sort());
  assert.notDeepEqual(shuffled, values);
});
test("dice notation and weighted choices use only the supplied random service", async () => {
  const Notation = (
    await import(pathToFileURL(path.join(root, "dice/server/notation.mjs")))
  ).default;
  const Weighted = (
    await import(pathToFileURL(path.join(root, "tables/server/weighted.mjs")))
  ).default;
  const requests = [],
    source = {
      integer(min, max) {
        requests.push([min, max]);
        return max - 1;
      },
    };
  assert.deepEqual(new Notation().roll("2d6+3", source).rolls, [6, 6]);
  assert.equal(
    new Weighted().choose(
      [
        { weight: 0, value: "never" },
        { weight: 3, value: "yes" },
      ],
      source,
    ),
    "yes",
  );
  assert.deepEqual(requests, [
    [1, 7],
    [1, 7],
    [0, 3],
  ]);
});
test("camera transforms round trip at rotated angles", async () => {
  const Geometry = (
    await import(pathToFileURL(path.join(root, "surfaces/server/geometry.mjs")))
  ).default;
  const g = new Geometry();
  for (let angle = 0; angle < 360; angle += 45) {
    const camera = { x: 32, y: -17, zoom: 2.3, rotation: angle },
      p = { x: 14, y: -9 },
      back = g.toWorld(g.toScreen(p, camera), camera);
    assert.ok(Math.hypot(back.x - p.x, back.y - p.y) < 1e-10);
  }
});

function sampleBattleMap(geo) {
  const lower = geo.createGround("cellar", {
    children: [
      {
        ...geo.createLayer("cellar-art", "object"),
        items: [{ id: "barrel", image: "a", x: 0, y: 0, width: 1, height: 1 }],
      },
      {
        ...geo.createLayer("cellar-tokens", "token"),
        items: [{ id: "rat", x: 1, y: 1 }],
      },
    ],
  });
  const upper = geo.createGround("hall", {
    children: [
      { ...geo.createLayer("hall-art", "object"), items: [] },
      {
        ...geo.createLayer("hall-walls", "wall"),
        items: [{ id: "wall", a: { x: 5, y: 0 }, b: { x: 5, y: 10 } }],
      },
      {
        ...geo.createLayer("hall-tokens", "token"),
        items: [{ id: "hero", x: 2, y: 2 }],
      },
      {
        ...geo.createLayer("hall-hidden", "token"),
        visible: false,
        items: [{ id: "ghost", x: 3, y: 3 }],
      },
      {
        ...geo.createLayer("hall-lights", "light"),
        items: [{ id: "torch", x: 4, y: 4 }],
      },
    ],
  });
  upper.alphaMask = "/assets/hole.png";
  return { width: 10, height: 10, layers: [lower, upper] };
}

test("a new battle map has one ground layer with object, wall, token and light layers", async () => {
  const Geometry = (
    await import(pathToFileURL(path.join(root, "maps/server/geometry.mjs")))
  ).default;
  const geo = new Geometry();
  const definition = geo.emptyBattleMap();
  assert.deepEqual(
    definition.layers.map((layer) => layer.type),
    ["ground"],
  );
  assert.deepEqual(
    definition.layers[0].children.map((layer) => layer.type),
    ["object", "wall", "token", "light"],
  );
  assert.equal(geo.layerFeatures("ground").shape, false);
  assert.equal(
    geo.layerFeatures("object").lightMask && geo.layerFeatures("object").alphaMask,
    true,
  );
  assert.equal(geo.layerFeatures("light").alphaMask, false);
  assert.equal(geo.layerFeatures("roof").lightMask, false);
  assert.throws(() => geo.createLayer("x", "ground"));
  assert.deepEqual(definition.size, { width: 2000, height: 1400 });
  assert.deepEqual(geo.mapSize(definition), { width: 2000, height: 1400 });
  const grid = definition.layers[0].grid;
  assert.equal(grid.size, 100);
  assert.deepEqual(grid.offset, { left: 0, top: 0 });
  assert.deepEqual(grid.relativesize, { size: 5, label: "ft" });
  assert.equal(geo.unitsPerPixel(definition.layers[0]), 0.05);
  const vehicle = geo.createGround("road", {
    grid: { size: 50, relativesize: { size: 30, label: "ft" } },
  });
  assert.equal(geo.unitsPerPixel(vehicle), 0.6);
});

test("a ground layer covers everything below it unless its alpha mask shows the ground beneath", async () => {
  const Geometry = (
    await import(pathToFileURL(path.join(root, "maps/server/geometry.mjs")))
  ).default;
  const geo = new Geometry();
  const definition = sampleBattleMap(geo);
  assert.deepEqual(
    geo.groundStack(definition, "hall").map((ground) => ground.id),
    ["cellar", "hall"],
  );
  assert.deepEqual(
    geo.groundStack(definition, "cellar").map((ground) => ground.id),
    ["cellar"],
  );
  definition.layers[1].alphaMask = null;
  assert.deepEqual(
    geo.groundStack(definition, "hall").map((ground) => ground.id),
    ["hall"],
  );
  definition.layers[1].alphaMask = "/assets/hole.png";
  const stack = geo.visibleStack(definition, "hall", [
    { id: "hero", layer: "hall-tokens", seen: true },
  ]);
  assert.deepEqual(
    stack[0].children.map((layer) => layer.id),
    ["cellar-art"],
  );
  assert.deepEqual(
    stack[1].children.map((layer) => layer.id),
    ["hall-art", "hall-walls", "hall-tokens", "hall-lights"],
  );
  assert.deepEqual(stack[1].children[2].items, [
    { id: "hero", layer: "hall-tokens", seen: true },
  ]);
});

test("the active ground supplies tokens, walls and lights tagged with their layer", async () => {
  const Geometry = (
    await import(pathToFileURL(path.join(root, "maps/server/geometry.mjs")))
  ).default;
  const geo = new Geometry();
  const definition = sampleBattleMap(geo);
  const view = geo.battleView(definition, "hall");
  assert.equal(view.levelId, "hall");
  assert.deepEqual(
    view.tokens.map((token) => [token.id, token.layer]),
    [["hero", "hall-tokens"]],
  );
  assert.deepEqual(
    geo
      .battleView(definition, "hall", { includeHidden: true })
      .tokens.map((token) => token.id),
    ["hero", "ghost"],
  );
  assert.deepEqual(
    view.walls.map((wall) => wall.id),
    ["wall"],
  );
  assert.deepEqual(
    view.lights.map((light) => light.id),
    ["torch"],
  );
  assert.equal(geo.battleView(definition, "missing").levelId, "cellar");
  assert.equal(geo.activeGround(definition, "hall").id, "hall");
  assert.deepEqual(
    geo.grounds(definition).map((ground) => ground.id),
    ["cellar", "hall"],
  );
});

test("items and layers are found by id, and new items go to a layer of the right type", async () => {
  const Geometry = (
    await import(pathToFileURL(path.join(root, "maps/server/geometry.mjs")))
  ).default;
  const geo = new Geometry();
  const definition = sampleBattleMap(geo);
  const found = geo.findItem(definition, "torch");
  assert.equal(found.layer.id, "hall-lights");
  assert.equal(found.ground.id, "hall");
  assert.equal(found.kind, "light");
  assert.equal(geo.findItem(definition, "missing"), null);
  assert.equal(geo.findLayer(definition, "hall").layer.type, "ground");
  assert.equal(geo.findLayer(definition, "hall-walls").ground.id, "hall");
  assert.equal(geo.itemKind({ type: "wall" }, { door: true }), "door");
  assert.equal(geo.itemKind({ type: "wall" }, { column: true }), "column");
  assert.equal(geo.itemKind({ type: "roof" }, {}), "image");
  const hall = geo.activeGround(definition, "hall");
  assert.equal(geo.targetLayer(hall, "token").id, "hall-hidden");
  assert.equal(geo.targetLayer(hall, "token", "hall-tokens").id, "hall-tokens");
  assert.equal(geo.targetLayer(hall, "light", "hall-tokens").id, "hall-lights");
  assert.equal(geo.targetLayer(hall, "drawing"), null);
  assert.equal(geo.moveLayer(hall.children, "hall-art", -1), false);
  assert.equal(geo.moveLayer(hall.children, "hall-art", 1), true);
  assert.deepEqual(
    hall.children.slice(0, 2).map((layer) => layer.id),
    ["hall-walls", "hall-art"],
  );
});

test("closed walls, closed doors and columns block movement; open doors do not", async () => {
  const Geometry = (
    await import(pathToFileURL(path.join(root, "maps/server/geometry.mjs")))
  ).default;
  const geo = new Geometry();
  const walls = [
    { a: { x: 5, y: 0 }, b: { x: 5, y: 10 } },
    { door: true, open: true, a: { x: 15, y: 0 }, b: { x: 15, y: 10 } },
    {
      column: true,
      center: { x: 25, y: 5 },
      radius: 1,
      a: { x: 24, y: 5 },
      b: { x: 26, y: 5 },
    },
  ];
  assert.equal(geo.movementBlocked(walls, { x: 2, y: 5 }, { x: 4, y: 5 }), false);
  assert.equal(geo.movementBlocked(walls, { x: 2, y: 5 }, { x: 8, y: 5 }), true);
  assert.equal(geo.movementBlocked(walls, { x: 12, y: 5 }, { x: 18, y: 5 }), false);
  assert.equal(
    geo.movementBlocked(
      [{ ...walls[1], open: false }],
      { x: 12, y: 5 },
      { x: 18, y: 5 },
    ),
    true,
  );
  assert.equal(geo.movementBlocked(walls, { x: 22, y: 5 }, { x: 28, y: 5 }), true);
  assert.equal(geo.movementBlocked(walls, { x: 22, y: 8 }, { x: 28, y: 8 }), false);
});

test("the token body, not just its centre, is stopped by walls, with an 80% doorway allowance", async () => {
  const Geometry = (
    await import(pathToFileURL(path.join(root, "maps/server/geometry.mjs")))
  ).default;
  const geo = new Geometry();
  const wall = [{ a: { x: 100, y: 0 }, b: { x: 100, y: 300 } }];
  const body = { width: 100, height: 100 };
  assert.equal(geo.bodyRadius(body), 40);
  assert.equal(
    geo.movementBlocked(wall, { x: 40, y: 50 }, { x: 50, y: 50 }, body),
    false,
  );
  assert.equal(
    geo.movementBlocked(wall, { x: 40, y: 50 }, { x: 60, y: 50 }, body),
    true,
  );
  assert.equal(
    geo.movementBlocked(wall, { x: 40, y: 50 }, { x: 100, y: 50 }),
    true,
  );
  const doorway = [
    { a: { x: 150, y: 0 }, b: { x: 150, y: 100 } },
    { a: { x: 150, y: 200 }, b: { x: 150, y: 300 } },
  ];
  assert.equal(
    geo.movementBlocked(doorway, { x: 100, y: 150 }, { x: 200, y: 150 }, body),
    false,
  );
  assert.equal(
    geo.movementBlocked(
      doorway,
      { x: 100, y: 150 },
      { x: 200, y: 150 },
      { width: 130, height: 130 },
    ),
    true,
  );
  const stuck = { x: 90, y: 50 };
  assert.equal(geo.movementBlocked(wall, stuck, { x: 40, y: 50 }, body), false);
  assert.equal(geo.movementBlocked(wall, stuck, { x: 160, y: 50 }, body), true);
});

test("shapes are polygons, and plain scenes become one ground with image, drawing and token layers", async () => {
  const Geometry = (
    await import(pathToFileURL(path.join(root, "maps/server/geometry.mjs")))
  ).default;
  const geo = new Geometry();
  const square = [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 4, y: 4 },
    { x: 0, y: 4 },
  ];
  assert.equal(geo.insidePolygon({ x: 2, y: 2 }, square), true);
  assert.equal(geo.insidePolygon({ x: 6, y: 2 }, square), false);
  const [plain] = geo.plainStack({
    images: [{ id: "tile" }],
    tokens: [{ id: "pin" }],
  });
  assert.equal(plain.type, "ground");
  assert.equal(plain.grid.type, "none");
  assert.equal(plain.fill, true);
  assert.deepEqual(
    plain.children.map((layer) => [layer.type, layer.items.length]),
    [
      ["object", 1],
      ["drawing", 0],
      ["token", 1],
    ],
  );
});

test("roof layers auto-hide when an observer token is beneath the roof", async () => {
  const Geometry = (
    await import(pathToFileURL(path.join(root, "maps/server/geometry.mjs")))
  ).default;
  const geo = new Geometry();
  const ground = geo.createGround("floor", {
    children: [
      {
        ...geo.createLayer("roof-1", "roof"),
        items: [{ id: "shingles", x: 0, y: 0, width: 100, height: 100 }],
      },
      {
        ...geo.createLayer("tokens", "token"),
        items: [{ id: "hero", x: 50, y: 50, observer: true }],
      },
    ],
  });
  const map = { width: 200, height: 200, layers: [ground] };
  const inside = geo.visibleStack(map, "floor", [
    { id: "hero", layer: "tokens", x: 50, y: 50, observer: true },
  ]);
  assert.deepEqual(
    inside[0].children.map((layer) => layer.id),
    ["tokens"],
  );
  const outside = geo.visibleStack(map, "floor", [
    { id: "hero", layer: "tokens", x: 150, y: 150, observer: true },
  ]);
  assert.deepEqual(
    outside[0].children.map((layer) => layer.id),
    ["roof-1", "tokens"],
  );
});

test("easel.maps.vision@1 ships a removable built-in sight sense and the wall material", async () => {
  const { default: Vision, SIGHT } = await import(
    pathToFileURL(path.join(root, "maps/server/vision.mjs"))
  );
  const builtin = new Vision();
  assert.deepEqual(builtin.catalog().presets.sight, SIGHT);
  assert.ok(builtin.catalog().hindrances.includes("wall"));
  const removed = new Vision();
  removed.register({ builtin: false });
  assert.equal(removed.has("sight"), false);
  assert.ok(removed.catalog().hindrances.includes("wall"));
  const replaced = new Vision();
  replaced.register({
    presets: { sight: { ...SIGHT, range: { depth: 5, maximum: 10 } } },
  });
  assert.equal(replaced.vision("sight").range.maximum, 10);
});

test("the default sense is stopped by walls, not by open doors, and keeps to the field of view", async () => {
  const { default: Vision } = await import(
    pathToFileURL(path.join(root, "maps/server/vision.mjs"))
  );
  const v = new Vision();
  const observer = {
    id: "eye",
    x: 5,
    y: 10,
    width: 1,
    height: 1,
    observer: true,
  };
  const scene = (walls, token = observer) => ({
    width: 40,
    height: 20,
    ambient: 1,
    walls,
    tokens: [token],
  });
  const at = (field, x) => field.sample({ x, y: 10 }).detail;
  const open = v.createVisionField(scene([]), { fallback: "sight" });
  assert.equal(at(open, 30), 1);
  const walled = v.createVisionField(
    scene([{ id: "w", a: { x: 20, y: 0 }, b: { x: 20, y: 20 } }]),
    { fallback: "sight" },
  );
  assert.equal(at(walled, 15), 1);
  assert.equal(at(walled, 30), 0);
  const doorway = v.createVisionField(
    scene([
      {
        id: "d",
        door: true,
        open: true,
        a: { x: 20, y: 0 },
        b: { x: 20, y: 20 },
      },
    ]),
    { fallback: "sight" },
  );
  assert.equal(at(doorway, 30), 1);
  assert.equal(
    v.createVisionField(scene([])).sample({ x: 30, y: 10 }).detail,
    0,
  );
  const north = { ...observer, fov: 90, facing: 0 };
  assert.equal(v.inFieldOfView(north, { x: 5, y: 2 }), true);
  assert.equal(v.inFieldOfView(north, { x: 5, y: 18 }), false);
  assert.equal(v.inFieldOfView({ ...north, facing: 90 }, { x: 15, y: 10 }), true);
  const narrow = v.createVisionField(scene([], north), { fallback: "sight" });
  assert.equal(at(narrow, 30), 0);
  assert.equal(
    v
      .createVisionField(scene([], { ...observer, blind: true }), {
        fallback: "sight",
      })
      .sample({ x: 30, y: 10 }).detail,
    0,
  );
});

const xrayDefinition = {
  enabled: true,
  range: { depth: 60, maximum: 75 },
  luminance: { minimum: 0, maximum: 0.3 },
  transformation: null,
  hindered: { wall: 1, brick: 0.25, glass: 0 },
};

async function createXrayVision() {
  const { default: Vision } = await import(
    pathToFileURL(path.join(root, "maps/server/vision.mjs"))
  );
  const v = new Vision();
  v.register({
    hindrances: ["wall", "brick", "glass"],
    presets: { xray: xrayDefinition },
  });
  return v;
}

test("vision fades detail and gates the sense by observer luminance", async () => {
  const v = await createXrayVision();
  const vision = v.vision("xray");
  assert.equal(v.detailAt(vision, 60, 0.2), 1);
  assert.equal(v.detailAt(vision, 67.5, 0.2), 0.5);
  assert.equal(v.detailAt(vision, 75, 0.2), 0);
  assert.equal(v.detailAt(vision, 10, 0.4), 0);
  assert.equal(v.detailAt(vision, 10, 0.3), 1);
});

test("most permissive material wins per object; successive objects compound", async () => {
  const v = await createXrayVision();
  const vision = v.vision("xray");
  assert.equal(
    v.hindrance(
      vision,
      v.visibility({ calculate: true, types: ["wall", "brick"] }),
      0,
    ),
    0.25,
  );
  assert.equal(v.combineHindrances([0.5, 0.5]), 0.75);
  assert.equal(
    v.effectiveDistance(30, [
      { distance: 10, hindrance: 0.5 },
      { distance: 20, hindrance: 0.5 },
    ]),
    70,
  );
  assert.equal(
    v.effectiveDistance(30, [{ distance: 10, hindrance: 1 }]),
    Infinity,
  );
});

test("angular visibility uses map axes, wraparound and exclusive upper bounds", async () => {
  const v = await createXrayVision();
  assert.equal(v.angleMatches(0, { minimum: 270, maximum: 90 }), true);
  assert.equal(v.angleMatches(90, { minimum: 270, maximum: 90 }), false);
  const vision = v.vision("xray");
  const directional = v.visibility([
    { angle: { minimum: 0, maximum: 180 }, calculate: true, types: ["wall"] },
    {
      angle: { minimum: 180, maximum: 360 },
      calculate: true,
      types: ["glass"],
    },
  ]);
  assert.equal(v.hindrance(vision, directional, 0), 1);
  assert.equal(v.hindrance(vision, directional, 180), 0);
});

test("registrations reject unknown material names and roll back failed presets", async () => {
  const v = await createXrayVision();
  assert.throws(() =>
    v.visibility({ calculate: true, types: ["invented"] }),
  );
  assert.throws(() =>
    v.register({ hindrances: ["new-material"], presets: { bad: {} } }),
  );
  assert.throws(() => v.types(["new-material"]));
  assert.throws(() => v.presentation({ types: ["invented"] }));
  assert.throws(() => v.presentation({ opacity: 2 }));
  assert.throws(() =>
    v.vision({ ...xrayDefinition, range: { depth: 80, maximum: 60 } }),
  );
});

test("a viewer-specific illusion wall affects visibility before token filtering", async () => {
  const v = await createXrayVision();
  const observer = {
    id: "observer",
    x: 0,
    y: 5,
    width: 1,
    height: 1,
    observer: true,
    vision: { ...xrayDefinition, hindered: { wall: 1 } },
  };
  const illusion = {
    id: "illusion",
    x: 10,
    y: 5,
    width: 1,
    height: 20,
    visibility: { calculate: true, types: ["wall"] },
    presentation: { opacity: 1 },
  };
  const target = { id: "target", x: 20, y: 5, width: 1, height: 1 };
  const scene = {
    width: 30,
    height: 20,
    ambient: 0.2,
    tokens: [observer, illusion, target],
    walls: [],
  };
  assert.equal(v.createVisionField(scene).visible(target), false);
  const disbelieved = structuredClone(scene);
  disbelieved.tokens[1].presentation = { opacity: 0.25, types: [] };
  assert.equal(v.createVisionField(disbelieved).visible(target), true);
  assert.equal(illusion.presentation.opacity, 1);
});

test("viewer-only presentation cannot become shared data through sanitizeMap, and projectBattlemap isolates viewers and caches", async () => {
  const Projection = (
    await import(
      pathToFileURL(path.join(root, "visibility/server/projection.mjs"))
    )
  ).default;
  const proj = new Projection();
  const sanitized = proj.sanitizeMap({
    visionMask: { rgba: "x".repeat(100) },
    layers: [
      {
        id: "floor",
        type: "ground",
        children: [
          {
            id: "tokens",
            type: "token",
            items: [
              {
                id: "token",
                x: 5,
                y: 5,
                presentation: { opacity: 0.25, types: [] },
              },
            ],
          },
        ],
      },
    ],
  });
  assert.equal(Object.hasOwn(sanitized, "visionMask"), false);
  assert.equal(
    Object.hasOwn(sanitized.layers[0].children[0].items[0], "presentation"),
    false,
  );

  let calls = 0;
  let disbelieved = false;
  const map = {
    id: "m1",
    revision: 1,
    width: 30,
    height: 20,
    fogEnabled: false,
    tokens: [{ id: "token", x: 5, y: 5 }],
  };
  const onTokenDraw = ({ viewer }) => {
    calls++;
    if (disbelieved && viewer.id === 2) return { opacity: 0.25, types: [] };
    return null;
  };
  proj.projectBattlemap(map, { id: 1 }, { onTokenDraw });
  proj.projectBattlemap(map, { id: 1 }, { onTokenDraw });
  assert.equal(calls, 1);
  const p2 = proj.projectBattlemap(map, { id: 2 }, { onTokenDraw });
  assert.equal(p2.tokens[0].presentation.opacity, 1);
  assert.equal(calls, 2);
  disbelieved = true;
  proj.invalidate({ id: 2 }, { mapId: "m1" });
  const p2Next = proj.projectBattlemap(map, { id: 2 }, { onTokenDraw });
  assert.equal(p2Next.tokens[0].presentation.opacity, 0.25);
  assert.equal(calls, 3);
  const diff = proj.diffProjection(p2, p2Next);
  assert.equal(diff.changed, true);
  assert.equal(diff.tokens.length, 1);
  assert.equal(diff.tokens[0].id, "token");
  assert.equal(Object.hasOwn(diff, "scene"), false);

  const Geometry = (
    await import(pathToFileURL(path.join(root, "maps/server/geometry.mjs")))
  ).default;
  const geo = new Geometry();
  const multiMap = sampleBattleMap(geo);
  multiMap.layers[1].children[2].items = [
    {
      id: "hero",
      x: 2,
      y: 2,
      owner: 7,
      observer: true,
      luminance: { strength: 2, hue: "#ffeeaa" },
      presentation: { opacity: 0.1 },
    },
    { id: "goblin", x: 3, y: 2 },
    { id: "behind-wall", x: 8, y: 2 },
  ];
  const projectedMulti = proj.projectBattlemap(
    multiMap,
    7,
    {
      levelId: "hall",
      useCache: false,
      onTokenDraw: (tok, viewerArg) => {
        assert.ok(tok.id);
        assert.equal(viewerArg.id, 7);
        return null;
      },
    },
  );
  assert.deepEqual(projectedMulti.groundStack, ["cellar", "hall"]);
  assert.deepEqual(
    projectedMulti.tokens.map((t) => t.id),
    ["hero", "goblin"],
  );
  assert.equal(projectedMulti.tokens[0].presentation.opacity, 1);
  assert.equal(projectedMulti.visionPolygons.length, 1);
  assert.equal(projectedMulti.visionPolygons[0].observerId, "hero");
  assert.ok(projectedMulti.visionPolygons[0].polygon.length >= 3);
  assert.equal(projectedMulti.lightSources.length, 2);
  assert.ok(projectedMulti.scene);
});

test("AoE templates compute circle, cone, ray and rect polygons, grid cells and covered tokens", async () => {
  const Template = (
    await import(pathToFileURL(path.join(root, "maps/server/template.mjs")))
  ).default;
  const tpl = new Template();
  const grid = { size: 100, relativesize: { size: 5, label: "ft" } };
  const tokens = [
    { id: "near", x: 150, y: 150 },
    { id: "far", x: 600, y: 600 },
  ];
  const circle = tpl.evaluate(
    { shape: "circle", origin: { x: 100, y: 100 }, range: 15 },
    { grid, tokens },
  );
  assert.deepEqual(circle.tokenIds, ["near"]);
  assert.ok(circle.cells.length > 0);
  const cone60 = tpl.evaluate(
    { shape: "cone", origin: { x: 0, y: 0 }, range: 15, direction: 0, angle: 60 },
    { grid, tokens: [{ id: "east", x: 200, y: 0 }, { id: "west", x: -200, y: 0 }] },
  );
  assert.deepEqual(cone60.tokenIds, ["east"]);
  const ray = tpl.evaluate(
    { shape: "ray", origin: { x: 0, y: 0 }, range: 20, direction: 0, width: 5 },
    { grid, tokens: [{ id: "in-line", x: 250, y: 0 }, { id: "off-line", x: 250, y: 200 }] },
  );
  assert.deepEqual(ray.tokenIds, ["in-line"]);
  const rect = tpl.evaluate(
    { shape: "rect", origin: { x: 0, y: 0 }, width: 10, height: 10 },
    { grid, tokens: [{ id: "inside", x: 100, y: 100 }, { id: "outside", x: 300, y: 300 }] },
  );
  assert.deepEqual(rect.tokenIds, ["inside"]);
});

test("archive packs and unpacks .map and .box zip payloads with asset rebinding", async () => {
  const { packMap, unpackMap, packBox, unpackBox } = await import(
    pathToFileURL(path.join(root, "maps/client/archive.mjs"))
  );
  const pixel = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const mapZip = packMap(
    {
      width: 500,
      height: 500,
      layers: [
        {
          id: "ground-1",
          type: "ground",
          children: [
            {
              id: "object-1",
              type: "object",
              items: [{ id: "img-1", image: "assets/0-tile.png", x: 0, y: 0, width: 100, height: 100 }],
            },
          ],
        },
      ],
    },
    [{ path: "assets/0-tile.png", name: "tile.png", data: pixel }],
  );
  const unpackedMap = unpackMap(mapZip);
  assert.equal(unpackedMap.map.width, 500);
  assert.equal(unpackedMap.assets.length, 1);
  assert.ok(
    unpackedMap.map.layers[0].children[0].items[0].image.startsWith("data:image/png;base64,"),
  );

  const boxZip = packBox(
    {
      title: "Tavern",
      elements: [{ id: "bg", image: "assets/0-bg.png", visible: true }],
    },
    [{ path: "assets/0-bg.png", name: "bg.png", data: pixel }],
  );
  const unpackedBox = unpackBox(boxZip);
  assert.equal(unpackedBox.scene.title, "Tavern");
  assert.equal(unpackedBox.assets.length, 1);
  assert.ok(unpackedBox.scene.elements[0].image.startsWith("data:image/png;base64,"));
});

test("easel.graphics.pixi@1 exposes all required PixiJS v8 classes and matches its interface contract", async () => {
  const pixiDir = path.resolve("server/easel/modules/pixi");
  const contract = JSON.parse(
    fs.readFileSync(path.join(pixiDir, "interfaces/pixi.json"), "utf8"),
  );
  const pixiMod = await import(
    pathToFileURL(path.join(pixiDir, "client/pixi.mjs"))
  );
  const expectedSymbols = [
    "Application",
    "Container",
    "Graphics",
    "Text",
    "Sprite",
    "Assets",
    "RenderTexture",
    "ColorMatrixFilter",
    "BlurFilter",
    "AlphaFilter",
    "Mesh",
    "Geometry",
    "MeshGeometry",
    "Shader",
    "TilingSprite",
    "Rectangle",
    "Texture",
    "Matrix",
    "Point",
    "Polygon",
  ];
  for (const sym of expectedSymbols) {
    assert.ok(contract.members.includes(sym), `missing ${sym} in pixi.json`);
    assert.ok(pixiMod[sym] !== undefined, `missing ${sym} export in pixi.mjs`);
  }
});

test("PixiJS client components map@1, fog@1, template@1, shadowbox@1, and worldmap@1 mount and validate events through runtime.mjs", async () => {
  const { createInterfaces, createComponents } = await import(
    pathToFileURL(path.resolve("server/easel/modules/runtime.mjs"))
  );
  class TestElement {
    constructor(tag = "div") {
      this.tagName = String(tag).toUpperCase();
      this.children = [];
      this.parent = null;
      this.style = {};
      this.dataset = {};
      this.attributes = {};
      this.className = "";
      this.textContent = "";
    }
    setAttribute(k, v) {
      this.attributes[k] = String(v);
      if (k.startsWith("data-")) {
        const camel = k
          .slice(5)
          .replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        this.dataset[camel] = String(v);
      }
    }
    getAttribute(k) {
      return this.attributes[k] ?? null;
    }
    append(...nodes) {
      for (const n of nodes) {
        if (!n) continue;
        if (typeof n === "string") {
          this.textContent += n;
          continue;
        }
        n.remove?.();
        this.children.push(n);
        n.parent = this;
      }
    }
    remove() {
      if (this.parent) {
        const idx = this.parent.children.indexOf(this);
        if (idx >= 0) this.parent.children.splice(idx, 1);
        this.parent = null;
      }
    }
    contains(node) {
      return this.children.some((c) => c === node || c.contains?.(node));
    }
    replaceChildren(...nodes) {
      for (const c of [...this.children]) c.remove?.();
      this.append(...nodes);
    }
    getBoundingClientRect() {
      return { left: 0, top: 0, width: 800, height: 600 };
    }
    addEventListener() {}
    removeEventListener() {}
    querySelectorAll(pred) {
      const out = [];
      const visit = (el) => {
        if (pred(el)) out.push(el);
        for (const c of el.children || []) visit(c);
      };
      visit(this);
      return out;
    }
  }
  const prevResizeObserver = globalThis.ResizeObserver;
  globalThis.ResizeObserver = class {
    constructor(callback) { this.callback = callback; }
    observe() {}
    disconnect() {}
  };
  const prevElement = globalThis.Element;
  const prevDocument = globalThis.document;
  const prevRAF = globalThis.requestAnimationFrame;
  const prevCAF = globalThis.cancelAnimationFrame;
  globalThis.Element = TestElement;
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => {};
  globalThis.document = {
    head: new TestElement("head"),
    querySelector: () => null,
    createElement: (tag) => {
      if (tag === "canvas") {
        const el = new TestElement("canvas");
        el.width = 16;
        el.height = 16;
        el.getContext = () => ({
          createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
          getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
          putImageData: () => {},
        });
        return el;
      }
      return new TestElement(tag);
    },
    createElementNS: (_ns, tag) => new TestElement(tag),
  };

  try {
    const registry = createInterfaces();
    const pixiDir = path.resolve("server/easel/modules/pixi");
    const pixiDef = JSON.parse(
      fs.readFileSync(path.join(pixiDir, "interfaces/pixi.json"), "utf8"),
    );
    const PixiClass = (
      await import(pathToFileURL(path.join(pixiDir, "client/pixi.mjs")))
    ).default;
    class HeadlessPixi extends PixiClass {
      constructor() {
        super();
        const ContainerClass = this.Container;
        this.Application = class MockApplication {
          constructor() {
            this.stage = new ContainerClass();
          }
          init() {
            return Promise.resolve();
          }
          destroy() {}
        };
      }
    }
    registry.define("easel.graphics.pixi@1", pixiDef);
    registry.enter({
      host: "easel.graphics",
      implements: ["easel.graphics.pixi@1"],
    });
    registry.api.register("easel.graphics", "easel.graphics.pixi@1", HeadlessPixi);
    registry.leave();

    const mapsDir = path.join(root, "maps");
    let mapView;
    for (const name of ["map", "fog", "template", "shadowbox", "worldmap"]) {
      const id = `easel.maps.${name}@1`;
      const def = JSON.parse(
        fs.readFileSync(path.join(mapsDir, `interfaces/${name}.json`), "utf8"),
      );
      const mod = await import(
        pathToFileURL(path.join(mapsDir, `client/${name}.mjs`))
      );
      mod.initialize?.({ Easel: { Interfaces: registry.api } });
      registry.define(id, def);
      registry.enter({ host: "easel.maps", implements: [id] });
      const Implementation = name === "map" ? class extends mod.default {
        constructor() { super(); mapView = this; }
      } : mod.default;
      registry.api.register("easel.maps", id, Implementation);
      registry.leave();
    }

    const domRoot = new TestElement("main");
    const manager = createComponents(registry, domRoot);

    const mapEvents = [];
    const mapHandle = manager.api.create("easel.maps.map@1", {
      props: {
        title: "Crypt",
        width: 800,
        height: 600,
        gm: true,
        grid: { type: "hex-pointy", size: 80, offset: { left: 10, top: 10 }, scale: 5, visible: true },
        tokens: [
          {
            id: "hero",
            name: "Valeros",
            x: 100,
            y: 100,
            width: 80,
            height: 80,
            observer: true,
            hp: { current: 24, max: 30 },
            conditions: ["blessed"],
          },
        ],
        walls: [
          { id: "wall-1", a: { x: 200, y: 0 }, b: { x: 200, y: 300 } },
          { id: "door-1", door: true, open: false, a: { x: 300, y: 0 }, b: { x: 300, y: 100 } },
        ],
        roofs: [
          {
            id: "roof-1",
            points: [
              { x: 50, y: 50 },
              { x: 150, y: 50 },
              { x: 150, y: 150 },
              { x: 50, y: 150 },
            ],
          },
        ],
        visionMask: { width: 2, height: 2, rgba: "////AAAA////////AAAACw==" },
      },
    });
    const gridBounds = () => {
      const bounds = mapView.gridGraphics.getLocalBounds();
      return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
    };
    const originalGridBounds = gridBounds();
    const originalCamera = structuredClone(mapView.camera);
    for (const [width, height] of [[1600, 1000], [400, 300], [800, 600]]) {
      mapView.resizeObserver.callback([{ contentRect: { width, height } }]);
      assert.deepEqual(gridBounds(), originalGridBounds, "viewport resizing must preserve scene grid bounds");
      assert.deepEqual(mapView.camera, originalCamera, "viewport resizing must preserve the camera");
    }
    for (const evt of [
      "cameraChanged",
      "tokenSelect",
      "tokenMoveRequest",
      "doorToggleRequest",
      "gridCalibrated",
      "exportMap",
      "importMap",
      "mapEditChange",
    ]) {
      mapHandle.on(evt, (payload) => mapEvents.push({ evt, payload }));
    }

    const fogHandle = manager.api.create("easel.maps.fog@1", {
      props: {
        width: 800,
        height: 600,
        visionMask: { width: 2, height: 2, rgba: "////AAAA////////AAAACw==" },
        visionPolygons: [
          {
            observerId: "hero",
            saturation: 0,
            polygon: [
              { x: 0, y: 0 },
              { x: 200, y: 0 },
              { x: 200, y: 200 },
            ],
          },
        ],
      },
    });
    const tplHandle = manager.api.create("easel.maps.template@1", {
      props: {
        width: 800,
        height: 600,
        templates: [{ id: "cone-1", kind: "cone", origin: { x: 100, y: 100 }, length: 120, angle: 60 }],
      },
    });
    fogHandle.attach(mapHandle, "overlay");
    tplHandle.attach(mapHandle, "overlay");
    manager.api.mountRoot(mapHandle);

    const doorBtns = domRoot.querySelectorAll((el) => el.dataset?.doorId === "door-1");
    assert.equal(doorBtns.length, 1);
    doorBtns[0].onclick();
    assert.ok(
      mapEvents.some(
        (e) =>
          e.evt === "doorToggleRequest" &&
          e.payload.wallId === "door-1" &&
          e.payload.open === true,
      ),
    );

    const tokenBtns = domRoot.querySelectorAll((el) => el.dataset?.tokenId === "hero");
    assert.equal(tokenBtns.length, 1);
    tokenBtns[0].onclick();
    assert.ok(
      mapEvents.some(
        (e) => e.evt === "tokenSelect" && e.payload.tokenId === "hero",
      ),
    );

    tokenBtns[0].onpointerdown({
      pointerId: 1,
      clientX: 100,
      clientY: 100,
      stopPropagation: () => {},
    });
    tokenBtns[0].onpointermove({ clientX: 250, clientY: 100 });
    tokenBtns[0].onpointerup({ clientX: 250, clientY: 100 });
    const moveEvt = mapEvents.find((e) => e.evt === "tokenMoveRequest");
    assert.ok(moveEvt);
    assert.equal(moveEvt.payload.tokenId, "hero");
    assert.equal(moveEvt.payload.blocked, true);

    mapHandle.setProps({ tool: "calibrate" });
    const surfaceEl = domRoot.querySelectorAll((el) =>
      String(el.className).includes("kit-surface"),
    )[0];
    surfaceEl.onpointerdown({ target: {}, clientX: 10, clientY: 20 });
    surfaceEl.onpointerdown({ target: {}, clientX: 110, clientY: 120 });
    const calEvt = mapEvents.find((e) => e.evt === "gridCalibrated");
    assert.ok(calEvt);
    assert.equal(calEvt.payload.size, 100);
    assert.deepEqual(calEvt.payload.offset, { left: 10, top: 20 });

    const exportBtns = domRoot.querySelectorAll(
      (el) => el.dataset?.action === "export-map",
    );
    assert.equal(exportBtns.length, 1);
    exportBtns[0].onclick();
    assert.ok(mapEvents.some((e) => e.evt === "exportMap" && e.payload.archive));

    manager.destroy();

    const boxManager = createComponents(registry, domRoot);
    const boxEvents = [];
    const boxHandle = boxManager.api.create("easel.maps.shadowbox@1", {
      props: {
        title: "Throne Room",
        gm: true,
        elements: [
          {
            id: "grp-1",
            type: "group",
            visible: true,
            children: [
              {
                id: "npc-1",
                name: "King",
                visible: false,
                tint: "#ffd700",
                saturation: 0.8,
                contrast: 0.2,
                luminance: 1.2,
                transparentColors: ["#00ff00"],
              },
            ],
          },
        ],
        toggles: [{ id: "reveal-king", name: "Reveal King", on: false, targets: ["npc-1"] }],
        dialogue: { speaker: "King", text: "Welcome!" },
      },
    });
    for (const evt of ["toggleElements", "exportBox", "speakDismiss", "speak"]) {
      boxHandle.on(evt, (payload) => boxEvents.push({ evt, payload }));
    }
    boxManager.api.mountRoot(boxHandle);
    const toggleBtns = domRoot.querySelectorAll(
      (el) => el.dataset?.elementToggle === "npc-1",
    );
    assert.equal(toggleBtns.length, 1);
    toggleBtns[0].onclick();
    assert.ok(
      boxEvents.some(
        (e) =>
          e.evt === "toggleElements" &&
          e.payload.ids.includes("npc-1") &&
          e.payload.visible === true,
      ),
    );
    boxManager.destroy();

    const wmManager = createComponents(registry, domRoot);
    const wmEvents = [];
    const wmHandle = wmManager.api.create("easel.maps.worldmap@1", {
      props: {
        title: "Inner Sea",
        gm: true,
        tiles: [{ id: "tile-1", x: 0, y: 0, width: 256, height: 256 }],
        locations: [{ id: "loc-1", label: "Absalom", x: 200, y: 300, linkedMapId: "map-absalom" }],
      },
    });
    wmHandle.on("pinSelect", (payload) => wmEvents.push({ evt: "pinSelect", payload }));
    wmHandle.on("tileMove", (payload) => wmEvents.push({ evt: "tileMove", payload }));
    wmManager.api.mountRoot(wmHandle);
    const pinBtns = domRoot.querySelectorAll((el) => el.dataset?.pinId === "loc-1");
    assert.equal(pinBtns.length, 1);
    pinBtns[0].onclick();
    assert.ok(
      wmEvents.some(
        (e) =>
          e.evt === "pinSelect" &&
          e.payload.id === "loc-1" &&
          e.payload.linkedMapId === "map-absalom",
      ),
    );
    const tileEls = domRoot.querySelectorAll((el) => el.dataset?.tileId === "tile-1");
    assert.equal(tileEls.length, 1);
    tileEls[0].onpointerdown({ pointerId: 1, clientX: 0, clientY: 0, stopPropagation: () => {} });
    tileEls[0].onpointerup({ clientX: 64, clientY: 32 });
    assert.ok(
      wmEvents.some(
        (e) => e.evt === "tileMove" && e.payload.id === "tile-1" && e.payload.x === 64,
      ),
    );
    wmManager.destroy();
  } finally {
    globalThis.ResizeObserver = prevResizeObserver;
    globalThis.Element = prevElement;
    globalThis.document = prevDocument;
    globalThis.requestAnimationFrame = prevRAF;
    globalThis.cancelAnimationFrame = prevCAF;
  }
});

test("Section 03 components vttworkspace, toolstrip, dicebox, dicesettings, rollcard, chatlog, richtext, directory, compendium mount and validate events", async () => {
  const { createInterfaces, createComponents } = await import(
    pathToFileURL(path.resolve("server/easel/modules/runtime.mjs"))
  );
  class TestElement {
    constructor(tag, text = "") {
      this.tagName = tag.toUpperCase();
      this.tag = tag;
      this.children = [];
      this.parent = null;
      this.style = {};
      this.dataset = {};
      this.attributes = {};
      this.textContent = String(text);
      this.hidden = false;
      this.value = "";
    }
    setAttribute(k, v) {
      this.attributes[k] = String(v);
    }
    getAttribute(k) {
      return this.attributes[k] ?? null;
    }
    append(...nodes) {
      for (const n of nodes) {
        if (!n) continue;
        if (typeof n === "string") {
          this.textContent += n;
          continue;
        }
        if (n.tag === "fragment") {
          for (const c of [...n.children]) this.append(c);
          continue;
        }
        n.remove?.();
        this.children.push(n);
        n.parent = this;
      }
    }
    remove() {
      if (this.parent) {
        const idx = this.parent.children.indexOf(this);
        if (idx >= 0) this.parent.children.splice(idx, 1);
        this.parent = null;
      }
    }
    contains(node) {
      return this.children.some((c) => c === node || c.contains?.(node));
    }
    replaceChildren(...nodes) {
      for (const c of [...this.children]) c.remove?.();
      this.append(...nodes);
    }
    getBoundingClientRect() {
      return { left: 0, top: 0, width: 800, height: 600 };
    }
    addEventListener() {}
    removeEventListener() {}
    querySelectorAll(pred) {
      const out = [];
      const visit = (el) => {
        if (pred(el)) out.push(el);
        for (const c of el.children || []) visit(c);
      };
      visit(this);
      return out;
    }
  }

  const prevElement = globalThis.Element;
  const prevDocument = globalThis.document;
  const prevRAF = globalThis.requestAnimationFrame;
  const prevCAF = globalThis.cancelAnimationFrame;
  globalThis.Element = TestElement;
  globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 0);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
  globalThis.document = {
    head: new TestElement("head"),
    querySelector: () => null,
    createDocumentFragment: () => new TestElement("fragment"),
    createTextNode: (text) => new TestElement("text", text),
    createElement: (tag) => {
      if (tag === "canvas") {
        const el = new TestElement("canvas");
        el.width = 400;
        el.height = 300;
        el.clientWidth = 400;
        el.clientHeight = 300;
        el.getContext = () => ({
          clearRect: () => {},
          beginPath: () => {},
          moveTo: () => {},
          lineTo: () => {},
          closePath: () => {},
          fill: () => {},
          stroke: () => {},
          fillText: () => {},
        });
        return el;
      }
      return new TestElement(tag);
    },
    createElementNS: (_ns, tag) => new TestElement(tag),
  };

  try {
    const registry = createInterfaces();
    const components = [
      { host: "layout", name: "vttworkspace" },
      { host: "layout", name: "toolstrip" },
      { host: "dice", name: "dicebox" },
      { host: "dice", name: "dicesettings" },
      { host: "dice", name: "rollcard" },
      { host: "narrative", name: "chatlog" },
      { host: "narrative", name: "richtext" },
      { host: "collections", name: "directory" },
      { host: "collections", name: "compendium" },
    ];

    for (const { host, name } of components) {
      const dir = path.join(root, host);
      const def = JSON.parse(fs.readFileSync(path.join(dir, `interfaces/${name}.json`), "utf8"));
      const mod = await import(pathToFileURL(path.join(dir, `client/${name}.mjs`)));
      const id = `easel.${host}.${name}@1`;
      registry.define(id, def);
      registry.enter({ host: `easel.${host}`, implements: [id] });
      registry.api.register(`easel.${host}`, id, mod.default);
      registry.leave();
    }
    registry.close([]);

    const domRoot = new TestElement("div");

    const wsManager = createComponents(registry, domRoot);
    const wsEvents = [];
    const wsHandle = wsManager.api.create("easel.layout.vttworkspace@1", {
      props: { sidebarOpen: true, sidebarWidth: 320, activeTool: "select", gmMode: true },
    });
    wsHandle.on("toggleSidebar", (p) => wsEvents.push(p));
    wsManager.api.mountRoot(wsHandle);
    const childTools = wsManager.api.create("easel.layout.toolstrip@1", { props: { activeTool: "select" } });
    childTools.attach(wsHandle, "tools");
    assert.equal(childTools.parent, wsHandle);
    assert.equal(childTools.slot, "tools");
    const sidebarToggle = domRoot.querySelectorAll((el) => String(el.className).includes("kit-sidebar-toggle"))[0];
    assert.ok(sidebarToggle);
    sidebarToggle.onclick();
    assert.deepEqual(wsEvents, [{ open: false }]);
    wsManager.destroy();

    const tsManager = createComponents(registry, domRoot);
    const tsEvents = [];
    const tsHandle = tsManager.api.create("easel.layout.toolstrip@1", {
      props: { activeTool: "select", gmMode: false },
    });
    tsHandle.on("select", (p) => tsEvents.push(p));
    tsManager.api.mountRoot(tsHandle);
    let wallBtn = domRoot.querySelectorAll((el) => el.dataset?.tool === "wall")[0];
    assert.equal(wallBtn, undefined);
    tsHandle.setProps({ activeTool: "select", gmMode: true });
    wallBtn = domRoot.querySelectorAll((el) => el.dataset?.tool === "wall")[0];
    assert.ok(wallBtn);
    wallBtn.onclick();
    assert.deepEqual(tsEvents, [{ tool: "wall" }]);
    tsManager.destroy();

    const dbManager = createComponents(registry, domRoot);
    const dbEvents = [];
    const dbHandle = dbManager.api.create("easel.dice.dicebox@1", {
      props: {
        rolls: [{ id: "roll-1", dice: [{ sides: 20, value: 19, label: "19" }] }],
        speed: 10,
      },
    });
    dbHandle.on("settled", (p) => dbEvents.push({ evt: "settled", payload: p }));
    dbHandle.on("clear", (p) => dbEvents.push({ evt: "clear", payload: p }));
    dbManager.api.mountRoot(dbHandle);
    const clearBtn = domRoot.querySelectorAll((el) => String(el.className).includes("kit-dice-clear"))[0];
    assert.ok(clearBtn);
    clearBtn.onclick();
    assert.ok(dbEvents.some((e) => e.evt === "clear"));
    dbManager.destroy();

    const dsManager = createComponents(registry, domRoot);
    const dsEvents = [];
    const dsHandle = dsManager.api.create("easel.dice.dicesettings@1", {
      props: { theme: "metallic", material: "metal" },
    });
    dsHandle.on("change", (p) => dsEvents.push({ evt: "change", payload: p }));
    dsHandle.on("testRoll", (p) => dsEvents.push({ evt: "testRoll", payload: p }));
    dsManager.api.mountRoot(dsHandle);
    const testRollBtn = domRoot.querySelectorAll((el) => el.textContent === "Test Roll")[0];
    assert.ok(testRollBtn);
    testRollBtn.onclick();
    assert.ok(dsEvents.some((e) => e.evt === "testRoll" && e.payload.notation === "1d20"));
    dsManager.destroy();

    const rcManager = createComponents(registry, domRoot);
    const rcEvents = [];
    const rcHandle = rcManager.api.create("easel.dice.rollcard@1", {
      props: {
        title: "Attack: Scimitar",
        formula: "1d20 + 8",
        total: 26,
        isCrit: true,
        rolls: [{ sides: 20, value: 18, crit: true }],
        breakdown: [{ label: "Base Attack", value: 5 }, { label: "DEX", value: 3 }],
        collapsed: false,
        actions: [{ id: "applyDamage", label: "Apply Damage" }],
      },
    });
    rcHandle.on("toggle", (p) => rcEvents.push({ evt: "toggle", payload: p }));
    rcHandle.on("action", (p) => rcEvents.push({ evt: "action", payload: p }));
    rcManager.api.mountRoot(rcHandle);
    const toggleBtn = domRoot.querySelectorAll((el) => String(el.className).includes("kit-rollcard-toggle"))[0];
    assert.ok(toggleBtn);
    toggleBtn.onclick();
    assert.ok(rcEvents.some((e) => e.evt === "toggle" && e.payload.collapsed === true));
    const actBtn = domRoot.querySelectorAll((el) => el.textContent === "Apply Damage")[0];
    assert.ok(actBtn);
    actBtn.onclick();
    assert.ok(rcEvents.some((e) => e.evt === "action" && e.payload.id === "applyDamage"));
    rcManager.destroy();

    const clManager = createComponents(registry, domRoot);
    const clEvents = [];
    const clHandle = clManager.api.create("easel.narrative.chatlog@1", {
      props: {
        messages: [
          {
            id: "msg-1",
            speaker: { name: "Valeros" },
            text: "Ready arms!",
            whisper: ["GM"],
            blind: true,
            rollMode: "gmroll",
            card: { title: "Strike", formula: "1d20+5", total: 22, isCrit: true, actions: [{ id: "confirm", label: "Confirm" }] },
          },
        ],
        canClear: true,
      },
    });
    clHandle.on("sendMessage", (p) => clEvents.push({ evt: "sendMessage", payload: p }));
    clHandle.on("rollModeChanged", (p) => clEvents.push({ evt: "rollModeChanged", payload: p }));
    clHandle.on("cardAction", (p) => clEvents.push({ evt: "cardAction", payload: p }));
    clHandle.on("clear", (p) => clEvents.push({ evt: "clear", payload: p }));
    clManager.api.mountRoot(clHandle);

    const clClearBtn = domRoot.querySelectorAll((el) => String(el.className).includes("kit-chatlog-clear"))[0];
    assert.ok(clClearBtn);
    clClearBtn.onclick();
    assert.ok(clEvents.some((e) => e.evt === "clear"));

    const cardActBtn = domRoot.querySelectorAll((el) => el.textContent === "Confirm")[0];
    assert.ok(cardActBtn);
    cardActBtn.onclick();
    assert.ok(clEvents.some((e) => e.evt === "cardAction" && e.payload.actionId === "confirm"));
    clManager.destroy();

    const rtManager = createComponents(registry, domRoot);
    const rtEvents = [];
    const rtClicks = [];
    const rtHandle = rtManager.api.create("easel.narrative.richtext@1", {
      props: {
        text: "Make a roll [[/r 1d20+5 # Attack]] or [[2d6+3]] or suffer @Condition[shaken]{Shaken}!\n> Watch out!",
        editable: true,
      },
    });
    rtHandle.on("enricherActivate", (p) => rtEvents.push(p));
    rtHandle.on("enricherClick", (p) => rtClicks.push(p));
    rtManager.api.mountRoot(rtHandle);
    const rollEnrichers = domRoot.querySelectorAll((el) => String(el.className).includes("kit-enricher-roll"));
    assert.equal(rollEnrichers.length, 2);
    rollEnrichers[0].onclick();
    assert.ok(rtEvents.some((e) => e.kind === "roll" && e.formula === "1d20+5"));
    assert.ok(rtClicks.some((e) => e.kind === "roll" && e.formula === "1d20+5"));
    rollEnrichers[1].onclick();
    assert.ok(rtEvents.some((e) => e.kind === "roll" && e.formula === "2d6+3"));

    const condEnricher = domRoot.querySelectorAll((el) => String(el.className).includes("kit-enricher-condition"))[0];
    assert.ok(condEnricher);
    condEnricher.onclick();
    assert.ok(rtEvents.some((e) => e.kind === "condition" && e.target === "shaken"));
    const bq = domRoot.querySelectorAll((el) => el.tagName?.toLowerCase() === "blockquote")[0];
    assert.ok(bq);
    rtManager.destroy();

    const dirManager = createComponents(registry, domRoot);
    const dirEvents = [];
    const dirHandle = dirManager.api.create("easel.collections.directory@1", {
      props: {
        folders: [{ id: "f-1", name: "Monsters", collapsed: false }],
        entries: [{ id: "e-1", name: "Goblin", folderId: "f-1", type: "npc" }],
        canCreate: true,
      },
    });
    dirHandle.on("toggleFolder", (p) => dirEvents.push({ evt: "toggleFolder", payload: p }));
    dirHandle.on("select", (p) => dirEvents.push({ evt: "select", payload: p }));
    dirHandle.on("duplicate", (p) => dirEvents.push({ evt: "duplicate", payload: p }));
    dirHandle.on("delete", (p) => dirEvents.push({ evt: "delete", payload: p }));
    dirHandle.on("create", (p) => dirEvents.push({ evt: "create", payload: p }));
    dirManager.api.mountRoot(dirHandle);

    const folderHeader = domRoot.querySelectorAll((el) => String(el.className).includes("kit-directory-folder-header"))[0];
    assert.ok(folderHeader);
    folderHeader.onclick();
    assert.ok(dirEvents.some((e) => e.evt === "toggleFolder" && e.payload.folderId === "f-1"));

    const addInFolderBtn = domRoot.querySelectorAll((el) => el.title === "Add entry here")[0];
    assert.ok(addInFolderBtn);
    addInFolderBtn.onclick({ stopPropagation: () => {} });
    assert.ok(dirEvents.some((e) => e.evt === "create" && e.payload.folderId === "f-1"));

    const dupBtn = domRoot.querySelectorAll((el) => el.textContent === "Duplicate")[0];
    assert.ok(dupBtn);
    dupBtn.onclick({ stopPropagation: () => {} });
    assert.ok(dirEvents.some((e) => e.evt === "duplicate" && e.payload.id === "e-1"));

    const delBtn = domRoot.querySelectorAll((el) => el.textContent === "Delete")[0];
    assert.ok(delBtn);
    delBtn.onclick({ stopPropagation: () => {} });
    assert.ok(dirEvents.some((e) => e.evt === "delete" && e.payload.id === "e-1"));

    const createBtn = domRoot.querySelectorAll((el) => String(el.className).includes("kit-directory-create"))[0];
    assert.ok(createBtn);
    createBtn.onclick();
    assert.ok(dirEvents.some((e) => e.evt === "create"));
    dirManager.destroy();

    const compManager = createComponents(registry, domRoot);
    const compEvents = [];
    const compHandle = compManager.api.create("easel.collections.compendium@1", {
      props: {
        packId: "bestiary",
        entries: [
          { id: "goblin", name: "Goblin", category: "humanoid", cr: 0.33 },
          { id: "dragon", name: "Red Dragon", category: "dragon", cr: 14 },
        ],
      },
    });
    compHandle.on("select", (p) => compEvents.push({ evt: "select", payload: p }));
    compHandle.on("inspect", (p) => compEvents.push({ evt: "inspect", payload: p }));
    compManager.api.mountRoot(compHandle);

    const inspectBtn = domRoot.querySelectorAll((el) => el.textContent === "Inspect")[0];
    assert.ok(inspectBtn);
    inspectBtn.onclick({ stopPropagation: () => {} });
    assert.ok(compEvents.some((e) => e.evt === "inspect" && e.payload.entryId === "goblin"));

    const selectBtn = domRoot.querySelectorAll((el) => el.textContent === "Select")[0];
    assert.ok(selectBtn);
    selectBtn.onclick({ stopPropagation: () => {} });
    assert.ok(compEvents.some((e) => e.evt === "select" && e.payload.entryId === "goblin"));
    compManager.destroy();
  } finally {
    globalThis.Element = prevElement;
    globalThis.document = prevDocument;
    globalThis.requestAnimationFrame = prevRAF;
    globalThis.cancelAnimationFrame = prevCAF;
  }
});

test("Section 04: easel.d20 server calculation bricks deep verification", async () => {
  const Abilities = (await import(pathToFileURL(path.join(root, "d20/server/abilities.mjs")))).default;
  const Check = (await import(pathToFileURL(path.join(root, "d20/server/check.mjs")))).default;
  const Defense = (await import(pathToFileURL(path.join(root, "d20/server/defense.mjs")))).default;
  const Health = (await import(pathToFileURL(path.join(root, "d20/server/health.mjs")))).default;
  const Spellbook = (await import(pathToFileURL(path.join(root, "d20/server/spellbook.mjs")))).default;
  const Size = (await import(pathToFileURL(path.join(root, "d20/server/size.mjs")))).default;
  const DamageTypes = (await import(pathToFileURL(path.join(root, "d20/server/damagetypes.mjs")))).default;
  const Grid = (await import(pathToFileURL(path.join(root, "d20/server/grid.mjs")))).default;
  const Currency = (await import(pathToFileURL(path.join(root, "d20/server/currency.mjs")))).default;

  const ab = new Abilities();
  assert.equal(ab.abilityModifier(10), 0);
  assert.equal(ab.abilityModifier(11), 0);
  assert.equal(ab.abilityModifier(12), 1);
  assert.equal(ab.abilityModifier(14), 2);
  assert.equal(ab.abilityModifier(9), -1);
  assert.equal(ab.abilityModifier(8), -1);
  assert.equal(ab.abilityModifier(7), -2);
  assert.equal(ab.abilityModifier(null), 0);
  assert.equal(ab.abilityModifier(undefined), 0);

  const resNormal = ab.resolveAbility({ base: 14 });
  assert.equal(resNormal.total, 14);
  assert.equal(resNormal.modifier, 2);

  const resDmg = ab.resolveAbility({ base: 14, damage: 4 });
  assert.equal(resDmg.total, 14);
  assert.equal(resDmg.modifier, 0);

  const resDmgOdd = ab.resolveAbility({ base: 14, damage: 5 });
  assert.equal(resDmgOdd.total, 14);
  assert.equal(resDmgOdd.modifier, 0);

  const resDrain = ab.resolveAbility({ base: 16, drain: 4 });
  assert.equal(resDrain.total, 12);
  assert.equal(resDrain.modifier, 1);

  const resCapped = ab.resolveAbility({ base: 18, maxCap: 2 });
  assert.equal(resCapped.total, 18);
  assert.equal(resCapped.modifier, 2);

  const pbCost = ab.pointBuyCost({ str: 18, dex: 14, con: 12, int: 10, wis: 8, cha: 8 });
  assert.equal(pbCost, 17 + 5 + 2 + 0 - 2 - 2);

  const chk = new Check();
  const nat1 = chk.rollCheck({ take: 1, dc: 5 });
  assert.equal(nat1.isNatural1, true);
  assert.equal(nat1.success, false);

  const nat20 = chk.rollCheck({ take: 20, dc: 35 });
  assert.equal(nat20.isNatural20, true);
  assert.equal(nat20.success, true);

  const takeZero = chk.rollCheck({ take: 0, modifiers: [3], source: { integer: () => 12 } });
  assert.equal(takeZero.naturalRoll, 12);
  assert.equal(takeZero.total, 15);

  const nat1Miss = chk.rollAttack({
    attackModifiers: [30],
    targetAC: 10,
    source: { integer: () => 1 }
  });
  assert.equal(nat1Miss.attack.isNatural1, true);
  assert.equal(nat1Miss.hits, false);
  assert.equal(nat1Miss.threatensCritical, false);

  const nat20Hit = chk.rollAttack({
    attackModifiers: [0],
    targetAC: 50,
    source: { integer: () => 20 }
  });
  assert.equal(nat20Hit.attack.isNatural20, true);
  assert.equal(nat20Hit.hits, true);
  assert.equal(nat20Hit.threatensCritical, true);

  const atkWitCrit = chk.rollAttack({
    attackModifiers: [5],
    critRange: 19,
    targetAC: 15,
    source: { integer: () => 19 }
  });
  assert.equal(atkWitCrit.threatensCritical, true);
  assert.equal(atkWitCrit.isCriticalHit, true);

  const atkCritNoAC = chk.rollAttack({
    attackModifiers: [5],
    critRange: 19,
    source: { integer: () => 19 }
  });
  assert.equal(atkCritNoAC.threatensCritical, true);
  assert.equal(atkCritNoAC.isCriticalHit, false);
  assert.ok(atkCritNoAC.confirmation !== null);

  const def = new Defense();
  const acRes = def.resolveArmorClass({
    base: 10,
    modifiers: [
      { type: "armor", value: 6 },
      { type: "shield", value: 2 },
      { type: "natural", value: 1 },
      { type: "dex", value: 3 },
      { type: "dodge", value: 1 }
    ],
    maxDex: 2
  });
  assert.equal(acRes.normal, 22);
  assert.equal(acRes.touch, 13);
  assert.equal(acRes.flatFooted, 19);

  const acLostDex = def.resolveArmorClass({
    base: 10,
    modifiers: [
      { type: "armor", value: 6 },
      { type: "dex", value: 3 },
      { type: "dodge", value: 1 }
    ],
    loseDexToAC: true
  });
  assert.equal(acLostDex.normal, 16);
  assert.equal(acLostDex.touch, 10);
  assert.equal(acLostDex.flatFooted, 16);

  const acNegDex = def.resolveArmorClass({
    base: 10,
    modifiers: [
      { type: "armor", value: 4 },
      { type: "dex", value: -2 }
    ]
  });
  assert.equal(acNegDex.normal, 12);
  assert.equal(acNegDex.touch, 8);
  assert.equal(acNegDex.flatFooted, 12);

  const acNatArmor = def.resolveArmorClass({
    base: 10,
    modifiers: [{ type: "naturalArmor", value: 3 }]
  });
  assert.equal(acNatArmor.normal, 13);
  assert.equal(acNatArmor.touch, 10);

  const hl = new Health();
  const healthy = hl.resolveHealthState({ hp: 20, maxHp: 20 });
  assert.equal(healthy.status, "healthy");
  const staggered = hl.resolveHealthState({ hp: 10, maxHp: 20, nonlethal: 10 });
  assert.equal(staggered.status, "staggered");
  const disabled = hl.resolveHealthState({ hp: 0, maxHp: 20 });
  assert.equal(disabled.status, "disabled");
  const staggeredZero = hl.resolveHealthState({ hp: 0, maxHp: 20, disabledAtZero: false });
  assert.equal(staggeredZero.status, "staggered");
  const dying = hl.resolveHealthState({ hp: -3, maxHp: 20, deathThreshold: -12 });
  assert.equal(dying.status, "dying");
  const dead = hl.resolveHealthState({ hp: -12, maxHp: 20, deathThreshold: -12 });
  assert.equal(dead.status, "dead");

  const poolDmg = hl.applyDamageToPools({ hp: 20, maxHp: 20, tempHp: 5, lethalDamage: 8 });
  assert.equal(poolDmg.hp, 17);
  assert.equal(poolDmg.tempHp, 0);

  const poolHeal = hl.applyDamageToPools({ hp: 15, maxHp: 20, nonlethal: 8, healing: 5 });
  assert.equal(poolHeal.hp, 20);
  assert.equal(poolHeal.nonlethal, 3);

  const sp = new Spellbook();
  const bonusSlots = sp.bonusSlotsForAbility(4);
  assert.deepEqual(bonusSlots, [0, 1, 1, 1, 1, 0, 0, 0, 0, 0]);
  const dcRes = sp.resolveSpellDC({ base: 10, spellLevel: 3, abilityModifier: 4 });
  assert.equal(dcRes.total, 17);
  const concRes = sp.rollConcentration({ casterLevel: 10, abilityModifier: 4, dc: 15, source: { integer: () => 1 } });
  assert.equal(concRes.success, true);
  const clRes = sp.rollCasterLevelCheck({ casterLevel: 15, targetSR: 16, source: { integer: () => 1 } });
  assert.equal(clRes.success, true);

  const sz = new Size();
  assert.equal(sz.stepWeaponDamageDice("1d8", 1), "2d6");
  assert.equal(sz.stepWeaponDamageDice("1d8", 2), "3d6");
  assert.equal(sz.stepWeaponDamageDice("1d8", -1), "1d6");
  assert.equal(sz.stepWeaponDamageDice("1d8", -2), "1d4");
  assert.equal(sz.stepWeaponDamageDice("2d6", 1), "3d6");
  assert.equal(sz.stepWeaponDamageDice("1d10", 1), "2d8");

  const dt = new DamageTypes();
  const resBypass = dt.resolveDamageInstances({
    instances: [{ amount: 15, types: ["slashing", "coldiron"] }],
    dr: [{ amount: 5, bypass: ["coldIron", "good"] }]
  });
  assert.equal(resBypass.totalDamage, 15);
  assert.equal(resBypass.breakdownPerInstance[0].absorbedByDR, 0);

  const resBlocked = dt.resolveDamageInstances({
    instances: [{ amount: 15, types: ["slashing"] }],
    dr: [{ amount: 5, bypass: ["coldIron", "good"] }]
  });
  assert.equal(resBlocked.totalDamage, 10);
  assert.equal(resBlocked.breakdownPerInstance[0].absorbedByDR, 5);

  const resMultiInst = dt.resolveDamageInstances({
    instances: [
      { amount: 5, types: ["slashing"] },
      { amount: 15, types: ["slashing"] }
    ],
    dr: [{ amount: 10, bypass: ["magic"] }]
  });
  assert.equal(resMultiInst.totalDamage, 10);
  assert.equal(resMultiInst.breakdownPerInstance[0].absorbedByDR, 0);
  assert.equal(resMultiInst.breakdownPerInstance[1].absorbedByDR, 10);

  const resNonStackDR = dt.resolveDamageInstances({
    instances: [{ amount: 20, types: ["slashing"] }],
    dr: [
      { amount: 10, bypass: ["magic"] },
      { amount: 5, bypass: ["coldiron"] }
    ]
  });
  assert.equal(resNonStackDR.totalDamage, 10);
  assert.equal(resNonStackDR.breakdownPerInstance[0].absorbedByDR, 10);

  const resEnergy = dt.resolveDamageInstances({
    instances: [{ amount: 20, types: ["fire"] }],
    resistances: { fire: 10 }
  });
  assert.equal(resEnergy.totalDamage, 10);

  const resImmune = dt.resolveDamageInstances({
    instances: [{ amount: 20, types: ["cold"] }],
    immunities: ["cold"]
  });
  assert.equal(resImmune.totalDamage, 0);

  const resVuln = dt.resolveDamageInstances({
    instances: [{ amount: 10, types: ["acid"] }],
    vulnerabilities: ["acid"]
  });
  assert.equal(resVuln.totalDamage, 15);

  const gr = new Grid();
  const d1 = gr.measureDistance5105([{ x: 0, y: 0 }, { x: 1, y: 1 }]);
  assert.equal(d1.feet, 5);
  const d2 = gr.measureDistance5105([{ x: 0, y: 0 }, { x: 2, y: 2 }]);
  assert.equal(d2.feet, 15);
  const d3 = gr.measureDistance5105([{ x: 0, y: 0 }, { x: 3, y: 3 }]);
  assert.equal(d3.feet, 20);
  const d4 = gr.measureDistance5105([{ x: 0, y: 0 }, { x: 4, y: 4 }]);
  assert.equal(d4.feet, 30);

  const stdThreat = gr.getThreatenedSquares({ originX: 0, originY: 0, spaceSquares: 1, reachSquares: 1, isReachWeapon: false });
  assert.equal(stdThreat.length, 8);

  const reachThreat = gr.getThreatenedSquares({ originX: 0, originY: 0, spaceSquares: 1, reachSquares: 1, isReachWeapon: true });
  assert.equal(reachThreat.length, 16);
  assert.ok(!reachThreat.some((sq) => sq.x === 1 && sq.y === 0));
  assert.ok(!reachThreat.some((sq) => sq.x === 0 && sq.y === 1));
  assert.ok(reachThreat.some((sq) => sq.x === 2 && sq.y === 0));

  const spaceFeetThreat = gr.getThreatenedSquares({ originX: 0, originY: 0, spaceFeet: 10, reachFeet: 5 });
  assert.equal(spaceFeetThreat.length, 12);

  const cap10 = ab.carryingCapacity(10);
  assert.equal(cap10.heavy, 100);
  assert.equal(cap10.light, 33);
  assert.equal(cap10.medium, 66);
  const cap11 = ab.carryingCapacity(11);
  assert.equal(cap11.heavy, 115);
  assert.equal(cap11.light, 38);
  assert.equal(cap11.medium, 76);
  const cap12 = ab.carryingCapacity(12);
  assert.equal(cap12.heavy, 130);
  const cap20 = ab.carryingCapacity(20);
  assert.equal(cap20.heavy, 400);
  const cap21 = ab.carryingCapacity(21);
  assert.equal(cap21.heavy, 460);
  const cap29 = ab.carryingCapacity(29);
  assert.equal(cap29.heavy, 1400);
  const cap30 = ab.carryingCapacity(30);
  assert.equal(cap30.heavy, 1600);

  const cur = new Currency();
  assert.equal(cur.toCopper({ pp: 1, gp: 2, sp: 3, cp: 4 }), 1234);
  assert.deepEqual(cur.fromCopper(1234), { pp: 1, gp: 2, sp: 3, cp: 4 });
  assert.equal(cur.coinWeightLbs({ pp: 25, gp: 25, sp: 25, cp: 25 }, 50), 2);
  const ded = cur.deductCurrency({ gp: 5 }, { sp: 5 }, true);
  assert.equal(ded.ok, true);
  assert.deepEqual(ded.newWallet, { pp: 0, gp: 4, sp: 5, cp: 0 });
});

test("Section 04: easel.d20 client UI components mount and validate events", async () => {
  class TestElement {
    constructor(tag, text) {
      this.tagName = tag.toUpperCase();
      this.children = [];
      this.parent = null;
      this.dataset = {};
      this.className = "";
      this.style = {};
      this.textContent = text !== undefined ? String(text) : "";
    }
    append(...nodes) {
      for (const n of nodes) {
        if (!n) continue;
        n.remove();
        this.children.push(n);
        n.parent = this;
      }
    }
    remove() {
      if (this.parent) {
        this.parent.children.splice(this.parent.children.indexOf(this), 1);
        this.parent = null;
      }
    }
    replaceChildren(...nodes) {
      for (const c of [...this.children]) c.remove();
      this.append(...nodes);
    }
    setAttribute(k, v) {
      this[k] = v;
    }
    getAttribute(k) {
      return this[k];
    }
    addEventListener() {}
    removeEventListener() {}
    querySelectorAll(pred) {
      const out = [];
      const visit = (el) => {
        if (pred(el)) out.push(el);
        for (const c of el.children || []) visit(c);
      };
      visit(this);
      return out;
    }
  }

  const prevElement = globalThis.Element;
  const prevDocument = globalThis.document;
  globalThis.Element = TestElement;
  globalThis.document = {
    head: new TestElement("head"),
    querySelector: () => null,
    createElement: (tag) => new TestElement(tag),
  };

  try {
    const { createInterfaces, createComponents } = await import(
      pathToFileURL(path.resolve("server/easel/modules/runtime.mjs"))
    );
    const registry = createInterfaces();
    const components = [
      "abilityblock",
      "defensebanner",
      "vitality",
      "spellbook",
      "attackcard",
      "rolldialog",
      "equipmentslots",
    ];

    const dir = path.join(root, "d20");
    for (const name of components) {
      const def = JSON.parse(fs.readFileSync(path.join(dir, `interfaces/${name}.json`), "utf8"));
      const mod = await import(pathToFileURL(path.join(dir, `client/${name}.mjs`)));
      const id = `easel.d20.${name}@1`;
      registry.define(id, def);
      registry.enter({ host: "easel.d20", implements: [id] });
      registry.api.register("easel.d20", id, mod.default);
      registry.leave();
    }
    registry.close([]);

    const domRoot = new TestElement("div");

    const abManager = createComponents(registry, domRoot);
    const abEvents = [];
    const abHandle = abManager.api.create("easel.d20.abilityblock@1", {
      props: {
        abilities: { str: { base: 16, total: 16, modifier: 3 } },
      },
    });
    abHandle.on("rollAbility", (p) => abEvents.push(p));
    abManager.api.mountRoot(abHandle);
    const rollStrBtn = domRoot.querySelectorAll((el) => String(el.className).includes("kit-roll-ability"))[0];
    assert.ok(rollStrBtn);
    rollStrBtn.onclick();
    assert.ok(abEvents.some((e) => e.ability === "str" && e.modifier === 3));
    abManager.destroy();

    const defManager = createComponents(registry, domRoot);
    const defEvents = [];
    const defHandle = defManager.api.create("easel.d20.defensebanner@1", {
      props: {
        ac: { normal: 18, touch: 12, flatFooted: 16 },
        saves: { fort: 5, ref: 3, will: 1 },
      },
    });
    defHandle.on("rollSave", (p) => defEvents.push(p));
    defManager.api.mountRoot(defHandle);
    const fortBtn = domRoot.querySelectorAll((el) => String(el.className).includes("kit-save-fort"))[0];
    assert.ok(fortBtn);
    fortBtn.onclick();
    assert.ok(defEvents.some((e) => e.save === "fort" && e.modifier === 5));
    defManager.destroy();

    const vitManager = createComponents(registry, domRoot);
    const vitEvents = [];
    const vitHandle = vitManager.api.create("easel.d20.vitality@1", {
      props: { hp: 20, maxHp: 25, tempHp: 5, nonlethal: 0 },
    });
    vitHandle.on("applyHealing", (p) => vitEvents.push({ evt: "heal", payload: p }));
    vitHandle.on("applyDamage", (p) => vitEvents.push({ evt: "damage", payload: p }));
    vitManager.api.mountRoot(vitHandle);
    const healBtn = domRoot.querySelectorAll((el) => String(el.className).includes("kit-btn-heal"))[0];
    assert.ok(healBtn);
    healBtn.onclick();
    assert.ok(vitEvents.some((e) => e.evt === "heal" && e.payload.amount === 5));
    vitManager.destroy();

    const spManager = createComponents(registry, domRoot);
    const spEvents = [];
    const spHandle = spManager.api.create("easel.d20.spellbook@1", {
      props: {
        activeLevel: 1,
        casterLevel: 3,
        spellbook: { 1: [{ id: "magic-missile", name: "Magic Missile" }] },
      },
    });
    spHandle.on("rollConcentration", (p) => spEvents.push({ evt: "conc", payload: p }));
    spHandle.on("castSpell", (p) => spEvents.push({ evt: "cast", payload: p }));
    spManager.api.mountRoot(spHandle);
    const concBtn = domRoot.querySelectorAll((el) => String(el.className).includes("kit-btn-conc"))[0];
    assert.ok(concBtn);
    concBtn.onclick();
    assert.ok(spEvents.some((e) => e.evt === "conc" && e.payload.casterLevel === 3));
    const castBtn = domRoot.querySelectorAll((el) => String(el.className).includes("kit-cast-btn"))[0];
    assert.ok(castBtn);
    castBtn.onclick();
    assert.ok(spEvents.some((e) => e.evt === "cast" && e.payload.spellId === "magic-missile"));
    spManager.destroy();

    const atkManager = createComponents(registry, domRoot);
    const atkEvents = [];
    const atkHandle = atkManager.api.create("easel.d20.attackcard@1", {
      props: {
        attackData: { attack: { total: 18, naturalRoll: 16 } },
        isGM: true,
      },
    });
    atkHandle.on("applyDamage", (p) => atkEvents.push(p));
    atkManager.api.mountRoot(atkHandle);
    const applyBtn = domRoot.querySelectorAll((el) => String(el.className).includes("kit-btn-apply-full"))[0];
    assert.ok(applyBtn);
    applyBtn.onclick();
    assert.ok(atkEvents.some((e) => e.multiplier === 1));
    atkManager.destroy();

    const rdManager = createComponents(registry, domRoot);
    const rdEvents = [];
    const rdHandle = rdManager.api.create("easel.d20.rolldialog@1", {
      props: { bonus: 4 },
    });
    rdHandle.on("roll", (p) => rdEvents.push(p));
    rdManager.api.mountRoot(rdHandle);
    const rollBtn = domRoot.querySelectorAll((el) => String(el.className).includes("kit-btn-roll"))[0];
    assert.ok(rollBtn);
    rollBtn.onclick();
    assert.ok(rdEvents.some((e) => e.bonus === 4));
    rdManager.destroy();

    const eqManager = createComponents(registry, domRoot);
    const eqEvents = [];
    const eqHandle = eqManager.api.create("easel.d20.equipmentslots@1", {
      props: {
        slots: { head: "Circlet of Persuasion" },
        editable: true,
      },
    });
    eqHandle.on("inspectSlot", (p) => eqEvents.push(p));
    eqManager.api.mountRoot(eqHandle);
    const headItem = domRoot.querySelectorAll((el) => el.textContent === "Circlet of Persuasion")[0];
    assert.ok(headItem);
    headItem.onclick();
    assert.ok(eqEvents.some((e) => e.slot === "head"));
    eqManager.destroy();
  } finally {
    globalThis.Element = prevElement;
    globalThis.document = prevDocument;
  }
});

test("Section 05: PF1e module manifest and first-class record schemas", () => {
  const manifestPath = path.resolve("server/easel/modules/pf1e/manifest.json");
  const schemasPath = path.resolve("server/easel/modules/pf1e/data/schemas.json");
  const securityPath = path.resolve("server/easel/modules/pf1e/server/security.mjs");

  assert.ok(fs.existsSync(manifestPath));
  assert.ok(fs.existsSync(schemasPath));
  assert.ok(fs.existsSync(securityPath));

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  assert.equal(manifest.type, "module");
  assert.equal(manifest.owner, "easel");
  assert.equal(manifest.host, "pf1e");
  assert.equal(manifest.name, "rules");
  assert.equal(manifest.server?.security?.entry, "server/security.mjs");
  assert.ok(Array.isArray(manifest.server?.data));

  const schemas = JSON.parse(fs.readFileSync(schemasPath, "utf8"));
  assert.ok(Array.isArray(schemas));

  const typeNames = new Set(schemas.map((s) => s[".name"]));
  const requiredTypes = [
    "Actor", "Character", "NPC", "Vehicle", "Trap", "Haunt",
    "Race", "Class", "ClassLevel",
    "Feature", "Feat", "ClassFeature", "Trait", "RacialTrait",
    "Spellbook", "Spell",
    "Buff",
    "Action",
    "Item", "Weapon", "Armor", "Shield", "WondrousItem", "Consumable", "Container", "Loot", "Implant"
  ];
  for (const t of requiredTypes) {
    assert.ok(typeNames.has(t), "Missing type: " + t);
  }

  const nonItemTypes = [
    "Race", "Class", "ClassLevel",
    "Feature", "Feat", "ClassFeature", "Trait", "RacialTrait",
    "Spellbook", "Spell",
    "Buff",
    "Action"
  ];
  for (const name of nonItemTypes) {
    const s = schemas.find((entry) => entry[".name"] === name);
    assert.notEqual(s[".extends"], "Item");
    assert.notEqual(s[".extends"], "easel.pf1e.Item");
  }

  const actorSchema = schemas.find((s) => s[".name"] === "Actor");
  assert.ok(actorSchema.abilities);
  assert.ok(actorSchema.health);
  assert.ok(actorSchema.speeds);
  assert.ok(actorSchema.senses);
  assert.ok(actorSchema.defenses);
  assert.ok(actorSchema.conditions);
  assert.ok(actorSchema.skills);
  assert.ok(actorSchema.currency);
  assert.ok(actorSchema.notes);

  const itemSchema = schemas.find((s) => s[".name"] === "Item");
  assert.ok(itemSchema.identified);
  assert.ok(itemSchema.unidentifiedName);
  assert.ok(itemSchema.unidentifiedDescription);
  assert.ok(itemSchema.auraSchool);
  assert.ok(itemSchema.cl);
  assert.ok(itemSchema.identifyDC);
  assert.ok(itemSchema.cursed);

  const raceSchema = schemas.find((s) => s[".name"] === "Race");
  assert.ok(raceSchema.grantedRacialTraits);

  const classLevelSchema = schemas.find((s) => s[".name"] === "ClassLevel");
  assert.ok(classLevelSchema.grantedFeatures);

  const actionSchema = schemas.find((s) => s[".name"] === "Action");
  assert.ok(actionSchema.actionCost);
  assert.ok(actionSchema.savingThrow);
});

test("Section 05: Fog-of-knowledge and security projection", async () => {
  const securityPath = path.resolve("server/easel/modules/pf1e/server/security.mjs");
  const sec = await import(pathToFileURL(securityPath));
  assert.ok(typeof sec.projectItem === "function");
  assert.ok(typeof sec.projectActor === "function");
  assert.ok(typeof sec.projectRecord === "function");

  const unidentifiedItem = {
    id: "item-sword-1",
    name: "Sun Blade +2",
    unidentifiedName: "Bastard Sword",
    unidentifiedDescription: "A well-balanced bastard sword with a golden pommel.",
    unidentifiedPriceGp: 35,
    description: "A magical bastard sword that shines as bright as daylight.",
    priceGp: 50335,
    identified: false,
    cursed: true,
    curseDescription: "Inflicts light blindness.",
    auraSchool: "evocation",
    cl: 10,
    identifyDC: 25,
    modifiers: [
      { id: "m1", target: "attack.melee", value: 2, hidden: true },
      { id: "m2", target: "damage.melee", value: 2, hidden: false }
    ]
  };

  const playerViewer = { id: "player-bob", role: "player" };
  const gmViewer = { id: "gm-alice", role: "administrator" };

  const projectedForPlayer = sec.projectItem(unidentifiedItem, playerViewer);
  assert.equal(projectedForPlayer.name, "Bastard Sword");
  assert.equal(projectedForPlayer.description, "A well-balanced bastard sword with a golden pommel.");
  assert.equal(projectedForPlayer.priceGp, 35);
  assert.equal(projectedForPlayer.cursed, undefined);
  assert.equal(projectedForPlayer.curseDescription, undefined);
  assert.equal(projectedForPlayer.auraSchool, undefined);
  assert.equal(projectedForPlayer.cl, undefined);
  assert.equal(projectedForPlayer.identifyDC, undefined);
  assert.ok(!projectedForPlayer.modifiers.some((m) => m.hidden));
  assert.equal(JSON.stringify(projectedForPlayer).includes("Sun Blade"), false);
  assert.equal(JSON.stringify(projectedForPlayer).includes("light blindness"), false);

  const projectedForGM = sec.projectItem(unidentifiedItem, gmViewer);
  assert.equal(projectedForGM.name, "Sun Blade +2");
  assert.equal(projectedForGM.priceGp, 50335);
  assert.equal(projectedForGM.cursed, true);
  assert.equal(projectedForGM.curseDescription, "Inflicts light blindness.");
  assert.equal(projectedForGM.auraSchool, "evocation");
  assert.equal(projectedForGM.cl, 10);
  assert.equal(projectedForGM.identifyDC, 25);
  assert.equal(projectedForGM.modifiers.length, 2);

  const actorWithNotes = {
    id: "actor-valeros",
    name: "Valeros",
    tokenImage: "tokens/valeros.png",
    size: "medium",
    ownerUserIds: ["player-valeros"],
    viewerUserIds: ["player-observer"],
    notes: {
      biography: "Former mercenary turned adventurer.",
      description: "Carries a shield and longsword.",
      gmNotes: "Secretly indebted to a Chelish noble family."
    },
    abilities: {
      str: { base: 16 }
    },
    health: { hp: 20, maxHp: 20 },
    conditions: { prone: false }
  };

  const ownerProj = sec.projectActor(actorWithNotes, "player-valeros");
  assert.equal(ownerProj.name, "Valeros");
  assert.ok(ownerProj.abilities);
  assert.ok(ownerProj.health);
  assert.equal(ownerProj.notes.biography, "Former mercenary turned adventurer.");
  assert.equal(ownerProj.notes.gmNotes, undefined);
  assert.equal(JSON.stringify(ownerProj).includes("Chelish noble"), false);

  const observerProj = sec.projectActor(actorWithNotes, "player-observer");
  assert.equal(observerProj.name, "Valeros");
  assert.ok(observerProj.abilities);
  assert.equal(observerProj.notes.gmNotes, undefined);
  assert.equal(JSON.stringify(observerProj).includes("Chelish noble"), false);

  const strangerProj = sec.projectActor(actorWithNotes, "player-stranger");
  assert.equal(strangerProj.name, "Valeros");
  assert.equal(strangerProj.tokenImage, "tokens/valeros.png");
  assert.equal(strangerProj.size, "medium");
  assert.ok(strangerProj.conditions);
  assert.equal(strangerProj.abilities, undefined);
  assert.equal(strangerProj.health, undefined);
  assert.equal(strangerProj.notes, undefined);

  const gmProj = sec.projectActor(actorWithNotes, gmViewer);
  assert.equal(gmProj.name, "Valeros");
  assert.equal(gmProj.notes.gmNotes, "Secretly indebted to a Chelish noble family.");

  const lootNpc = {
    id: "npc-goblin",
    name: "Goblin Raider",
    tokenImage: "tokens/goblin.png",
    size: "small",
    ownerUserIds: ["gm-alice"],
    viewerUserIds: [],
    sheetMode: "loot",
    currency: { pp: 0, gp: 12, sp: 5, cp: 0 },
    abilities: { str: { base: 10 } },
    notes: { gmNotes: "Carries stolen brooch." }
  };
  const lootProj = sec.projectActor(lootNpc, "player-stranger");
  assert.equal(lootProj.name, "Goblin Raider");
  assert.equal(lootProj.sheetMode, "loot");
  assert.deepEqual(lootProj.currency, { pp: 0, gp: 12, sp: 5, cp: 0 });
  assert.equal(lootProj.abilities, undefined);
  assert.equal(lootProj.notes, undefined);

  const recItem = sec.projectRecord(unidentifiedItem, playerViewer);
  assert.equal(recItem.name, "Bastard Sword");
  assert.equal(recItem.cursed, undefined);

  const recActor = sec.projectRecord(actorWithNotes, playerViewer);
  assert.equal(recActor.notes, undefined);

  const nestedBag = {
    id: "bag-1",
    name: "Bag of Holding",
    identified: true,
    gmNotes: "Contains illicit contraband",
    items: [
      unidentifiedItem,
      {
        id: "pouch-1",
        name: "Belt Pouch",
        identified: true,
        items: [unidentifiedItem]
      }
    ]
  };
  const projectedBag = sec.projectItem(nestedBag, playerViewer);
  assert.equal(projectedBag.gmNotes, undefined);
  assert.equal(projectedBag.items[0].name, "Bastard Sword");
  assert.equal(projectedBag.items[0].cursed, undefined);
  assert.equal(projectedBag.items[1].items[0].name, "Bastard Sword");
  assert.equal(projectedBag.items[1].items[0].cursed, undefined);

  const actorWithInventory = {
    id: "actor-seoni",
    name: "Seoni",
    ownerUserIds: ["player-seoni"],
    viewerUserIds: [],
    items: [unidentifiedItem],
    notes: { gmNotes: "Secret backstory" }
  };
  const ownerInventoryProj = sec.projectActor(actorWithInventory, "player-seoni");
  assert.equal(ownerInventoryProj.items[0].name, "Bastard Sword");
  assert.equal(ownerInventoryProj.items[0].cursed, undefined);
  assert.equal(ownerInventoryProj.notes.gmNotes, undefined);

  const anonOwnerProj = sec.projectActor(actorWithInventory, null, { isOwner: true });
  assert.equal(anonOwnerProj.name, "Seoni");
  assert.ok(anonOwnerProj.items);
  assert.equal(anonOwnerProj.items[0].name, "Bastard Sword");

  const lootNpcWithItems = {
    ...lootNpc,
    items: [unidentifiedItem]
  };
  const lootProjWithItems = sec.projectActor(lootNpcWithItems, "player-stranger");
  assert.ok(lootProjWithItems.items);
  assert.equal(lootProjWithItems.items[0].name, "Bastard Sword");
  assert.equal(lootProjWithItems.items[0].cursed, undefined);
});

test("Section 06: PF1e stacking policy with all 21 bonus types", async () => {
  const StackingTool = (
    await import(pathToFileURL(path.resolve("server/easel/server/library/effects/server/stacking.mjs")))
  ).default;
  const { PF1E_STACKING_POLICY } = await import(
    pathToFileURL(path.resolve("server/easel/modules/pf1e/server/rules-config.mjs"))
  );
  const tool = new StackingTool();

  const stackingTypes = ["dodge", "racial", "untyped", "penalty"];
  for (const t of stackingTypes) {
    const effects = [
      { key: t, value: 2 },
      { key: t, value: 3 }
    ];
    const res = tool.resolve(effects, PF1E_STACKING_POLICY);
    assert.equal(res.total, 5, `Expected ${t} to stack to 5, got ${res.total}`);
    assert.equal(res.active.length, 2);
  }

  const circDistinct = [
    { key: "circumstance", value: 2, source: "flanking" },
    { key: "circumstance", value: 3, source: "higherGround" }
  ];
  const circRes = tool.resolve(circDistinct, PF1E_STACKING_POLICY);
  assert.equal(circRes.total, 5);
  assert.equal(circRes.active.length, 2);

  const circSame = [
    { key: "circumstance", value: 2, source: "flanking" },
    { key: "circumstance", value: 4, source: "flanking" }
  ];
  const circSameRes = tool.resolve(circSame, PF1E_STACKING_POLICY);
  assert.equal(circSameRes.total, 4);
  assert.equal(circSameRes.active.length, 1);

  const nonStackingTypes = [
    "enhancement", "morale", "luck", "deflection", "sacred",
    "profane", "insight", "competence", "resistance", "size",
    "trait", "alchemical", "inherent", "armor", "shield", "natural", "bab"
  ];
  for (const t of nonStackingTypes) {
    const effects = [
      { key: t, value: 2 },
      { key: t, value: 5 },
      { key: t, value: 3 }
    ];
    const res = tool.resolve(effects, PF1E_STACKING_POLICY);
    assert.equal(res.total, 5, `Expected highest for ${t}, got ${res.total}`);
    assert.equal(res.active.length, 1);
    assert.equal(res.suppressed.length, 2);
  }
});

test("Section 06: Composite armor/shield/natural enhancement stacking and defense", async () => {
  const { preprocessCompositeArmorEnhancements, PF1E_STACKING_POLICY } = await import(
    pathToFileURL(path.resolve("server/easel/modules/pf1e/server/rules-config.mjs"))
  );
  const DefenseTool = (
    await import(pathToFileURL(path.resolve("server/easel/server/library/d20/server/defense.mjs")))
  ).default;
  const defense = new DefenseTool();

  const comp = preprocessCompositeArmorEnhancements({
    armorBonus: 4,
    armorEnhancement: 2,
    shieldBonus: 2,
    shieldEnhancement: 1,
    naturalBonus: 1,
    naturalEnhancement: 1
  });

  assert.equal(comp.armor, 6);
  assert.equal(comp.shield, 3);
  assert.equal(comp.natural, 2);

  const modifiers = [
    { target: "ac", type: "armor", key: "armor", value: comp.armor },
    { target: "ac", type: "shield", key: "shield", value: comp.shield },
    { target: "ac", type: "natural", key: "natural", value: comp.natural },
    { target: "ac", type: "deflection", key: "deflection", value: 1 },
    { target: "ac", type: "dodge", key: "dodge", value: 1 },
    { target: "ac", type: "dex", key: "dex", value: 3 }
  ];

  const acResult = defense.resolveArmorClass({
    base: 10,
    modifiers,
    policyMap: PF1E_STACKING_POLICY,
    maxDex: 4,
    loseDexToAC: false
  });

  assert.equal(acResult.normal, 10 + 6 + 3 + 2 + 1 + 1 + 3);
  assert.equal(acResult.touch, 10 + 1 + 1 + 3);
  assert.equal(acResult.flatFooted, 10 + 6 + 3 + 2 + 1);

  const flatFootedResult = defense.resolveArmorClass({
    base: 10,
    modifiers,
    policyMap: PF1E_STACKING_POLICY,
    maxDex: 4,
    loseDexToAC: true
  });
  assert.equal(flatFootedResult.normal, 10 + 6 + 3 + 2 + 1);
  assert.equal(flatFootedResult.touch, 10 + 1);
});

test("Section 06: Cascading conditions and state flags", async () => {
  const { ActorConditions } = await import(
    pathToFileURL(path.resolve("server/easel/modules/pf1e/server/layers/actor-conditions.mjs"))
  );
  const handler = new ActorConditions();

  const doubleFatigue = handler.expandConditions({ fatiguedCount: 2 });
  assert.equal(doubleFatigue.conditions.exhausted, true);
  assert.equal(doubleFatigue.conditions.fatigued, false);
  assert.equal(doubleFatigue.stateFlags.halfSpeed, true);
  assert.ok(doubleFatigue.modifiers.some((m) => m.target === "ability.str.total" && m.value === -6));
  assert.ok(doubleFatigue.modifiers.some((m) => m.target === "ability.dex.total" && m.value === -6));

  const arrayFatigue = handler.expandConditions(["fatigued", "fatigued"]);
  assert.equal(arrayFatigue.conditions.exhausted, true);
  assert.equal(arrayFatigue.conditions.fatigued, false);
  assert.equal(arrayFatigue.stateFlags.halfSpeed, true);

  const fearCascade = handler.expandConditions({ shaken: true, frightened: true });
  assert.equal(fearCascade.conditions.panicked, true);
  assert.equal(fearCascade.conditions.frightened, false);
  assert.equal(fearCascade.stateFlags.mustFlee, true);
  assert.equal(fearCascade.stateFlags.dropsItems, true);

  const arrayFear = handler.expandConditions(["shaken", "frightened"]);
  assert.equal(arrayFear.conditions.panicked, true);
  assert.equal(arrayFear.stateFlags.mustFlee, true);

  const doubleShaken = handler.expandConditions({ shakenCount: 2 });
  assert.equal(doubleShaken.conditions.frightened, true);
  assert.equal(doubleShaken.conditions.shaken, false);
  assert.equal(doubleShaken.stateFlags.mustFlee, true);

  const blinded = handler.expandConditions({ blinded: true });
  assert.equal(blinded.stateFlags.loseDexToAC, true);
  assert.ok(blinded.modifiers.some((m) => m.target === "ac.normal" && m.value === -2));
  assert.ok(blinded.modifiers.some((m) => m.target === "skills.acr" && m.value === -4));
  assert.ok(blinded.modifiers.some((m) => m.target === "skills.per" && m.value === -4));

  const paralyzed = handler.expandConditions({ paralyzed: true });
  assert.equal(paralyzed.stateFlags.loseDexToAC, true);
  assert.equal(paralyzed.stateFlags.cannotMove, true);
  assert.equal(paralyzed.stateFlags.cannotTakeActions, true);
  assert.equal(paralyzed.stateFlags.meleeAgainstBonus, 4);
});

test("Section 06: Domain mechanics: CMB/CMD, iterative attacks, TWF penalties, natural attacks", async () => {
  const {
    calculateIterativeBAB,
    calculateTWFPenalties,
    calculateNaturalAttack,
    calculateCMB,
    calculateCMD,
    calculateLoadCategory,
    calculateReducedSpeed
  } = await import(
    pathToFileURL(path.resolve("server/easel/modules/pf1e/server/rules-config.mjs"))
  );

  assert.deepEqual(calculateIterativeBAB(1), [1]);
  assert.deepEqual(calculateIterativeBAB(5), [5]);
  assert.deepEqual(calculateIterativeBAB(6), [6, 1]);
  assert.deepEqual(calculateIterativeBAB(11), [11, 6, 1]);
  assert.deepEqual(calculateIterativeBAB(16), [16, 11, 6, 1]);
  assert.deepEqual(calculateIterativeBAB(20), [20, 15, 10, 5]);

  assert.deepEqual(calculateTWFPenalties({ lightOffHand: false, hasTWFFeat: false }), { primary: -6, offhand: -10 });
  assert.deepEqual(calculateTWFPenalties({ lightOffHand: true, hasTWFFeat: false }), { primary: -4, offhand: -8 });
  assert.deepEqual(calculateTWFPenalties({ lightOffHand: false, hasTWFFeat: true }), { primary: -4, offhand: -4 });
  assert.deepEqual(calculateTWFPenalties({ lightOffHand: true, hasTWFFeat: true }), { primary: -2, offhand: -2 });

  const prim = calculateNaturalAttack({ bab: 8, isPrimary: true, strMod: 4 });
  assert.equal(prim.attackBonus, 8);
  assert.equal(prim.damageMod, 4);

  const primSingle = calculateNaturalAttack({ bab: 8, isPrimary: true, strMod: 4, singleNaturalAttack: true });
  assert.equal(primSingle.attackBonus, 8);
  assert.equal(primSingle.damageMod, 6);

  const sec = calculateNaturalAttack({ bab: 8, isPrimary: false, strMod: 4, hasMultiattack: false });
  assert.equal(sec.attackBonus, 3);
  assert.equal(sec.damageMod, 2);

  const secMulti = calculateNaturalAttack({ bab: 8, isPrimary: false, strMod: 4, hasMultiattack: true });
  assert.equal(secMulti.attackBonus, 6);
  assert.equal(secMulti.damageMod, 2);

  const cmbMed = calculateCMB({ bab: 6, strMod: 3, dexMod: 2, size: "medium" });
  assert.equal(cmbMed, 9);
  const cmbLarge = calculateCMB({ bab: 6, strMod: 3, dexMod: 2, size: "large" });
  assert.equal(cmbLarge, 10);
  const cmbTiny = calculateCMB({ bab: 6, strMod: -2, dexMod: 4, size: "tiny" });
  assert.equal(cmbTiny, 6 + 4 - 2);

  const cmdMed = calculateCMD({
    bab: 6,
    strMod: 3,
    dexMod: 2,
    size: "medium",
    deflection: 1,
    dodge: 1
  });
  assert.equal(cmdMed, 10 + 6 + 3 + 2 + 0 + 1 + 1);

  const cmdBlind = calculateCMD({
    bab: 6,
    strMod: 3,
    dexMod: 2,
    size: "medium",
    deflection: 1,
    dodge: 1,
    loseDexToAC: true
  });
  assert.equal(cmdBlind, 10 + 6 + 3 + 0 + 0 + 1 + 0);

  const capacity = { light: 100, medium: 200, heavy: 300, max: 300 };
  assert.equal(calculateLoadCategory(50, capacity), "light");
  assert.equal(calculateLoadCategory(150, capacity), "medium");
  assert.equal(calculateLoadCategory(250, capacity), "heavy");
  assert.equal(calculateLoadCategory(350, capacity), "overload");

  assert.equal(calculateReducedSpeed(30, "light"), 30);
  assert.equal(calculateReducedSpeed(30, "medium"), 20);
  assert.equal(calculateReducedSpeed(30, "heavy"), 20);
  assert.equal(calculateReducedSpeed(20, "medium"), 15);
  assert.equal(calculateReducedSpeed(40, "medium"), 30);
  assert.equal(calculateReducedSpeed(30, "overload"), 0);
});

test("Section 06: PF1e vision presets and illusion disbelief bindings", async () => {
  const {
    PF1E_HINDRANCES,
    PF1E_VISION_PRESETS,
    recordIllusionDisbelief,
    applyViewerPresentationOverrides
  } = await import(
    pathToFileURL(path.resolve("server/easel/modules/pf1e/server/vision-pf1e.mjs"))
  );
  const { VisionRegistry } = await import(
    pathToFileURL(path.resolve("server/easel/server/library/maps/server/vision.mjs"))
  );

  const registry = new VisionRegistry();
  const cat = registry.register({
    hindrances: PF1E_HINDRANCES,
    presets: PF1E_VISION_PRESETS
  });

  assert.ok(cat.hindrances.includes("stone"));
  assert.ok(cat.hindrances.includes("magicalDarkness"));
  assert.ok(cat.hindrances.includes("invisibility"));
  assert.ok(cat.hindrances.includes("illusionGlamer"));

  const dv = cat.presets.darkvision;
  assert.equal(dv.transformation.saturation, 0);
  assert.equal(dv.range.maximum, 60);

  const dv120 = cat.presets.darkvision120;
  assert.equal(dv120.transformation.saturation, 0);
  assert.equal(dv120.range.maximum, 120);

  const seeInv = cat.presets.seeInvisibility;
  assert.equal(seeInv.hindered.invisibility, 0);

  const trueSee = cat.presets.trueSeeing;
  assert.equal(trueSee.hindered.invisibility, 0);
  assert.equal(trueSee.hindered.illusionGlamer, 0);
  assert.equal(trueSee.hindered.illusionFigment, 0);
  assert.equal(trueSee.hindered.magicalDarkness, 0);

  const illusionWall = {
    id: "wall-illusion",
    isIllusion: true,
    presentation: { opacity: 1, types: ["stone"] },
    disbelievedByActorIds: []
  };

  const disguisedToken = {
    id: "token-infiltrator",
    name: "Friendly Guard",
    trueName: "Assassin",
    tokenImage: "guard.png",
    trueTokenImage: "assassin.png",
    isIllusion: true,
    presentation: { opacity: 1 },
    disbelievedByActorIds: []
  };

  const scene = {
    walls: [illusionWall],
    tokens: [disguisedToken]
  };

  const normalView = applyViewerPresentationOverrides(scene, "actor-bob", false);
  assert.equal(normalView.walls[0].presentation.opacity, 1);
  assert.equal(normalView.tokens[0].name, "Friendly Guard");
  assert.equal(normalView.tokens[0].tokenImage, "guard.png");

  recordIllusionDisbelief(illusionWall, "actor-bob");
  recordIllusionDisbelief(disguisedToken, "actor-bob");

  const disbelievedView = applyViewerPresentationOverrides(scene, "actor-bob", false);
  assert.equal(disbelievedView.walls[0].presentation.opacity, 0.25);
  assert.deepEqual(disbelievedView.walls[0].presentation.types, []);
  assert.equal(disbelievedView.tokens[0].name, "Assassin");
  assert.equal(disbelievedView.tokens[0].tokenImage, "assassin.png");

  const trueSeeingView = applyViewerPresentationOverrides(scene, "actor-alice", true);
  assert.equal(trueSeeingView.walls[0].presentation.opacity, 0.25);
  assert.equal(trueSeeingView.tokens[0].name, "Assassin");
  assert.equal(trueSeeingView.tokens[0].tokenImage, "assassin.png");
});

test("Section 06: Paizo statblock parser (easel.pf1e.statblock@1)", async () => {
  const StatblockImporter = (
    await import(pathToFileURL(path.resolve("server/easel/modules/pf1e/server/statblock.mjs")))
  ).default;
  const parser = new StatblockImporter();

  const goblinStatblock = `
GOBLIN CR 1/3
XP 135
Goblin warrior 1
NE Small humanoid (goblinoid)
Init +6; Senses darkvision 60 ft.; Perception -1
DEFENSE
AC 16, touch 13, flat-footed 14 (+2 armor, +2 Dex, +1 shield, +1 size)
hp 6 (1d10+1)
Fort +3, Ref +2, Will -1
OFFENSE
Speed 30 ft.
Melee short sword +2 (1d4/19-20)
Ranged shortbow +4 (1d4/x3)
STATISTICS
Str 11, Dex 15, Con 12, Int 10, Wis 9, Cha 6
Base Atk +1; CMB +0; CMD 12
Feats Improved Initiative
Skills Ride +10, Stealth +10, Swim +4; Racial Modifiers +4 Ride, +4 Stealth
Languages Goblin
SQ fast movement
`;

  const parsedGoblin = parser.parse(goblinStatblock);
  assert.equal(parsedGoblin.npc.name, "GOBLIN");
  assert.equal(parsedGoblin.npc.cr, 0.33);
  assert.equal(parsedGoblin.npc.xpAward, 135);
  assert.equal(parsedGoblin.npc.alignment, "ne");
  assert.equal(parsedGoblin.npc.size, "small");
  assert.equal(parsedGoblin.npc.creatureType, "humanoid");
  assert.deepEqual(parsedGoblin.npc.subtypes, ["goblinoid"]);
  assert.equal(parsedGoblin.npc.health.hp, 6);
  assert.equal(parsedGoblin.npc.health.maxHp, 6);
  assert.equal(parsedGoblin.npc.racialHDFormula, "1d10+1");
  assert.equal(parsedGoblin.npc.acTotal, 16);
  assert.equal(parsedGoblin.npc.acTouch, 13);
  assert.equal(parsedGoblin.npc.acFlatFooted, 14);
  assert.equal(parsedGoblin.npc.saveFortBase, 3);
  assert.equal(parsedGoblin.npc.saveRefBase, 2);
  assert.equal(parsedGoblin.npc.saveWillBase, -1);
  assert.equal(parsedGoblin.npc.abilities.str.base, 11);
  assert.equal(parsedGoblin.npc.abilities.dex.base, 15);
  assert.equal(parsedGoblin.npc.abilities.con.base, 12);
  assert.equal(parsedGoblin.npc.abilities.int.base, 10);
  assert.equal(parsedGoblin.npc.abilities.wis.base, 9);
  assert.equal(parsedGoblin.npc.abilities.cha.base, 6);
  assert.equal(parsedGoblin.npc.baseAtk, 1);
  assert.equal(parsedGoblin.npc.cmb, 0);
  assert.equal(parsedGoblin.npc.cmd, 12);
  assert.ok(parsedGoblin.actions.some((a) => a.name === "short sword" && a.attackBonusFormula === "2"));
  assert.ok(parsedGoblin.actions.some((a) => a.name === "shortbow" && a.attackBonusFormula === "4"));
  assert.ok(parsedGoblin.features.some((f) => f.name === "Improved Initiative"));

  const dragonStatblock = `
ADULT RED DRAGON CR 14
XP 38,400
CE Huge dragon (fire)
Init +4; Senses dragon senses, smoke vision; Perception +23
Aura frightful presence (180 ft., DC 21), fire (5 ft., 1d6 fire)
DEFENSE
AC 29, touch 8, flat-footed 29 (+21 natural, -2 size)
hp 212 (17d12+102)
Fort +16, Ref +10, Will +14
DR 5/magic; Immune fire, paralysis, sleep; SR 25
Weaknesses vulnerability to cold
OFFENSE
Speed 40 ft., fly 200 ft. (poor)
Melee bite +25 (2d8+15), 2 claws +25 (2d6+10)
Space 15 ft.; Reach 10 ft. (15 ft. with bite)
Special Attacks breath weapon (50-ft. cone, DC 24, 12d10 fire)
Spell-Like Abilities (CL 17th; concentration +21)
At will—detect magic, pyrotechnics (DC 16)
Spells Known (CL 7th; concentration +11)
3rd (5/day)—haste
2nd (7/day)—invisibility
STATISTICS
Str 31, Dex 10, Con 23, Int 18, Wis 19, Cha 18
Base Atk +17; CMB +29; CMD 39
Feats Alertness, Cleave, Improved Initiative, Multiattack, Power Attack
Skills Appraise +24, Bluff +24, Fly +14, Intimidate +24, Knowledge (arcana) +24, Perception +23
Languages Common, Draconic
ECOLOGY
Environment warm mountains
Organization solitary
Treasure triple
`;

  const parsedDragon = parser.parse(dragonStatblock);
  assert.equal(parsedDragon.npc.name, "ADULT RED DRAGON");
  assert.equal(parsedDragon.npc.cr, 14);
  assert.equal(parsedDragon.npc.xpAward, 38400);
  assert.equal(parsedDragon.npc.size, "huge");
  assert.equal(parsedDragon.npc.creatureType, "dragon");
  assert.deepEqual(parsedDragon.npc.subtypes, ["fire"]);
  assert.equal(parsedDragon.npc.health.hp, 212);
  assert.equal(parsedDragon.npc.health.maxHp, 212);
  assert.equal(parsedDragon.npc.racialHDFormula, "17d12+102");
  assert.equal(parsedDragon.npc.defenses.naturalAC, 21);
  assert.equal(parsedDragon.npc.defenses.srFormula, "25");
  assert.ok(parsedDragon.npc.defenses.drEntries.some((d) => d.amount === 5 && d.bypass === "magic"));
  assert.ok(parsedDragon.npc.defenses.immunities.includes("fire"));
  assert.ok(parsedDragon.npc.defenses.vulnerabilities.includes("vulnerability to cold"));
  assert.equal(parsedDragon.npc.speeds.land, 40);
  assert.equal(parsedDragon.npc.speeds.fly, 200);
  assert.equal(parsedDragon.npc.speeds.flyManeuverability, "poor");
  assert.equal(parsedDragon.npc.abilities.str.base, 31);
  assert.equal(parsedDragon.npc.abilities.con.base, 23);
  assert.equal(parsedDragon.npc.baseAtk, 17);
  assert.equal(parsedDragon.npc.cmb, 29);
  assert.equal(parsedDragon.npc.cmd, 39);
  assert.ok(parsedDragon.actions.some((a) => a.name === "bite" && a.attackBonusFormula === "25"));
  assert.ok(parsedDragon.actions.some((a) => a.name === "2 claws" && a.attackBonusFormula === "25"));
  assert.ok(parsedDragon.features.some((f) => f.name.includes("breath weapon")));
  assert.ok(parsedDragon.spellbooks.length >= 1);
  assert.equal(parsedDragon.npc.environment, "warm mountains");
  assert.equal(parsedDragon.npc.skills.kar.total, 24);
  assert.equal(parsedDragon.npc.skills.apr.total, 24);
  assert.equal(parsedDragon.npc.skills.blf.total, 24);
  assert.equal(parsedDragon.npc.skills.per.total, 23);
});

test("Section 06: Go-interpreted automations definitions and physical item broken rules", async () => {
  const { definitions } = await import(
    pathToFileURL(path.resolve("server/easel/modules/pf1e/server/automations.mjs"))
  );
  const defs = definitions();
  assert.equal(defs.length, 5);

  const names = new Set(defs.map((d) => d.name));
  assert.ok(names.has("pf1e.ApplyDamage"));
  assert.ok(names.has("pf1e.SpendActionUses"));
  assert.ok(names.has("pf1e.Rest"));
  assert.ok(names.has("pf1e.AdvanceTurn"));
  assert.ok(names.has("pf1e.TransferItem"));

  for (const d of defs) {
    assert.ok(d.name);
    assert.ok(Array.isArray(d.parameters));
    assert.ok(Array.isArray(d.steps));
    assert.ok(d.steps.length > 0);
  }

  const { WeaponPhysical, ArmorPhysical, ItemPhysical } = await import(
    pathToFileURL(path.resolve("server/easel/modules/pf1e/server/layers/item-physical.mjs"))
  );

  const unbrokenWeapon = new WeaponPhysical();
  unbrokenWeapon.hp = 10;
  unbrokenWeapon.maxHp = 10;
  unbrokenWeapon.critRange = 19;
  unbrokenWeapon.critMultiplier = 3;
  assert.equal(unbrokenWeapon.isBroken, false);
  assert.equal(unbrokenWeapon.attackPenalty, 0);
  assert.equal(unbrokenWeapon.damagePenalty, 0);
  assert.equal(unbrokenWeapon.effectiveCritRange, 19);
  assert.equal(unbrokenWeapon.effectiveCritMultiplier, 3);

  const brokenWeapon = new WeaponPhysical();
  brokenWeapon.hp = 5;
  brokenWeapon.maxHp = 10;
  brokenWeapon.critRange = 19;
  brokenWeapon.critMultiplier = 3;
  assert.equal(brokenWeapon.isBroken, true);
  assert.equal(brokenWeapon.attackPenalty, -2);
  assert.equal(brokenWeapon.damagePenalty, -2);
  assert.equal(brokenWeapon.effectiveCritRange, 20);
  assert.equal(brokenWeapon.effectiveCritMultiplier, 2);

  const unbrokenArmor = new ArmorPhysical();
  unbrokenArmor.hp = 20;
  unbrokenArmor.maxHp = 20;
  unbrokenArmor.armorBonus = 6;
  unbrokenArmor.armorCheckPenalty = -3;
  assert.equal(unbrokenArmor.isBroken, false);
  assert.equal(unbrokenArmor.effectiveArmorBonus, 6);
  assert.equal(unbrokenArmor.effectiveACP, -3);

  const brokenArmor = new ArmorPhysical();
  brokenArmor.hp = 10;
  brokenArmor.maxHp = 20;
  brokenArmor.armorBonus = 6;
  brokenArmor.armorCheckPenalty = -3;
  assert.equal(brokenArmor.isBroken, true);
  assert.equal(brokenArmor.effectiveArmorBonus, 3);
  assert.equal(brokenArmor.effectiveACP, -6);

  const bagOfHolding = new ItemPhysical();
  bagOfHolding.weightLbs = 15;
  bagOfHolding.constantWeightLbs = 15;
  const bagWeight = bagOfHolding.getEffectiveWeight([
    { weightLbs: 50, quantity: 2 },
    { weightLbs: 100, quantity: 1 }
  ]);
  assert.equal(bagWeight, 15);

  const backpack = new ItemPhysical();
  backpack.weightLbs = 2;
  const bpWeight = backpack.getEffectiveWeight([
    { weightLbs: 5, quantity: 2 },
    { weightLbs: 10, quantity: 1 }
  ]);
  assert.equal(bpWeight, 2 + 20);
});

test("Section 06: ActorDerived layer integration and roll data context", async () => {
  const { ActorDerived } = await import(
    pathToFileURL(path.resolve("server/easel/modules/pf1e/server/layers/actor-derived.mjs"))
  );
  const actor = new ActorDerived();
  actor.name = "Valeros";
  actor.size = "medium";
  actor.baseAtk = 6;
  actor.abilities = {
    str: { base: 16, damage: 0, drain: 0, penalty: 0 },
    dex: { base: 14, damage: 0, drain: 0, penalty: 0 },
    con: { base: 14, damage: 0, drain: 0, penalty: 0 },
    int: { base: 10, damage: 0, drain: 0, penalty: 0 },
    wis: { base: 12, damage: 0, drain: 0, penalty: 0 },
    cha: { base: 8, damage: 0, drain: 0, penalty: 0 }
  };
  actor.health = { hp: 45, maxHp: 45, tempHp: 0, nonlethal: 0 };
  actor.speeds = { land: 30 };
  actor.skills = {
    clm: { ranks: 2, isClassSkill: true },
    swm: { ranks: 1, isClassSkill: true },
    per: { ranks: 3, isClassSkill: false }
  };

  const sword = {
    name: "Longsword +1",
    equipped: true,
    carried: true,
    weightLbs: 4,
    quantity: 1,
    modifiers: [{ target: "attack.melee", value: 1, type: "enhancement", key: "enhancement" }]
  };
  const armor = {
    name: "Breastplate",
    equipped: true,
    carried: true,
    slot: "armor",
    armorBonus: 6,
    maxDex: 3,
    armorCheckPenalty: -4,
    weightLbs: 30,
    quantity: 1
  };

  const FormulaTool = (
    await import(pathToFileURL(path.resolve("server/easel/server/library/rules/server/formula.mjs")))
  ).default;
  const formulaTool = new FormulaTool();

  const derived = actor.computeDerived({
    items: [sword, armor],
    race: {
      name: "Orc",
      modifiers: [{ target: "ability.str", value: 2, type: "racial", key: "racial" }]
    },
    classLevels: [{ name: "fighter", classLevel: 6 }]
  });

  assert.equal(derived.abilities.str.total, 18);
  assert.equal(derived.abilities.str.mod, 4);
  assert.equal(derived.abilities.dex.mod, 2);
  assert.equal(derived.bab, 6);
  assert.deepEqual(derived.iteratives, [6, 1]);
  assert.equal(derived.encumbrance.totalWeightLbs, 34);
  assert.equal(derived.encumbrance.loadCategory, "light");
  assert.equal(derived.encumbrance.maxDex, 3);
  assert.equal(derived.encumbrance.acp, -4);
  assert.equal(derived.speed.land, 20);

  assert.equal(derived.ac.normal, 10 + 6 + 2);
  assert.equal(derived.ac.touch, 10 + 2);
  assert.equal(derived.ac.flatFooted, 10 + 6);

  assert.equal(derived.cmb, 6 + 4);
  assert.equal(derived.cmd, 10 + 6 + 4 + 2);

  assert.equal(derived.skills.clm.total, 4 + 2 + 3 - 4);
  assert.equal(derived.skills.swm.total, 4 + 1 + 3 - 4);
  assert.equal(derived.skills.per.total, 1 + 3);

  assert.equal(derived.rollData["@abilities.str.mod"], 4);
  assert.equal(derived.rollData["@bab"], 6);
  assert.equal(derived.rollData["@armor.acp"], -4);
  assert.equal(derived.rollData["@classes.fighter.level"], 6);
  assert.equal(derived.rollData.classes.fighter.level, 6);

  const evalResult = formulaTool.evaluate("@classes.fighter.level + @bab + @abilities.str.mod", derived.rollData);
  assert.equal(evalResult, 6 + 6 + 4);
});

test("Section 07: easel.pf1e.game@1 server coordinator rolls and RPCs", async () => {
  const Game = (
    await import(pathToFileURL(path.resolve("server/easel/modules/pf1e/server/game.mjs")))
  ).default;
  const game = new Game();

  const mockSource = { integer: (min, max) => (min === 1 && max === 20 ? 15 : 6) };

  const abResult = game.rollAbility({
    actorId: "actor-valeros",
    ability: "str",
    score: 16,
    modifier: 3,
    source: mockSource
  });
  assert.equal(abResult.type, "ability");
  assert.equal(abResult.dicePayload.dice[0].sides, 20);
  assert.equal(abResult.card.total, 15 + 3);

  const saveResult = game.rollSave({
    actorId: "actor-valeros",
    save: "fort",
    modifier: 5,
    dc: 18,
    source: mockSource
  });
  assert.equal(saveResult.type, "save");
  assert.equal(saveResult.card.total, 15 + 5);
  assert.equal(saveResult.card.success, true);

  const skillResult = game.rollSkill({
    actorId: "actor-valeros",
    skillId: "climb",
    modifier: 7,
    take: 0,
    source: mockSource
  });
  assert.equal(skillResult.type, "skill");
  assert.equal(skillResult.card.total, 15 + 7);

  const initResult = game.rollInitiative({
    actorId: "actor-valeros",
    modifier: 2,
    source: mockSource
  });
  assert.equal(initResult.type, "initiative");
  assert.equal(initResult.card.total, 15 + 2);

  const actionResult = game.useAction({
    actorId: "actor-valeros",
    actionId: "act-sword",
    actionData: {
      name: "Longsword Strike",
      attackBonus: 6,
      critRange: 19,
      critMultiplier: 2,
      damageParts: [{ formula: "1d8+4" }]
    },
    source: mockSource
  });
  assert.equal(actionResult.type, "attack");
  assert.equal(actionResult.attackData.attack.total, 15 + 6);
  assert.equal(actionResult.dicePayload.dice.length >= 2, true);
  assert.equal(actionResult.dicePayload.dice[0].sides, 20);

  const spellResult = game.castSpell({
    actorId: "actor-seoni",
    spellId: "spell-magic-missile",
    level: 1,
    spellData: { name: "Magic Missile", damageFormula: "1d4+1" },
    source: mockSource
  });
  assert.equal(spellResult.type, "spell");
  assert.ok(spellResult.dicePayload.dice.length >= 1);

  const dmgResult = game.applyDamage({ actorId: "actor-valeros", amount: 10, isNonlethal: false, multiplier: 1 });
  assert.ok(dmgResult);

  const healResult = game.applyHealing({ actorId: "actor-valeros", amount: 5 });
  assert.ok(healResult);

  const idResult = game.identifyItem({ actorId: "actor-valeros", itemId: "item-sword", rollDC: 15, source: mockSource });
  assert.equal(idResult.identified, true);

  const parsed = game.importStatblock({
    statblockText: "GOBLIN CR 1/3\nXP 135\nNE Small humanoid (goblinoid)\nInit +6; Senses darkvision 60 ft.; Perception -1\nDEFENSE\nAC 16, touch 13, flat-footed 14\nhp 6 (1d10+1)\nFort +3, Ref +2, Will -1\nOFFENSE\nSpeed 30 ft.\nMelee short sword +2 (1d4/19-20)\nSTATISTICS\nStr 11, Dex 15, Con 12, Int 10, Wis 9, Cha 6\nBase Atk +1; CMB +0; CMD 12"
  });
  assert.equal(parsed.npc.name, "GOBLIN");

  assert.ok(game.rest({ actorId: "actor-valeros", isFullBedrest: false }));
  assert.ok(game.advanceTurn({ actorId: "actor-valeros" }));
  assert.ok(game.transferItem({ itemId: "item-1", targetActorId: "actor-2" }));
  assert.ok(game.transferCoin({ currency: { gp: 50 }, targetActorId: "actor-2" }));

  const brokenCheck = game.syncBrokenState({ actorId: "actor-valeros", itemId: "item-sword", currentHp: 4, maxHp: 10 });
  assert.equal(brokenCheck.broken, true);
  const unbrokenCheck = game.syncBrokenState({ actorId: "actor-valeros", itemId: "item-sword", currentHp: 6, maxHp: 10 });
  assert.equal(unbrokenCheck.broken, false);

  assert.ok(actionResult.card.actions.some((a) => a.id === "applyDamage"));
  assert.ok(spellResult.card.actions.some((a) => a.id === "applyDamage"));
});

test("Section 07: easel.pf1e client components charactersheet, npcsheet, recordeditor mount and validate events", async () => {
  class TestElement {
    constructor(tag, text) {
      this.tagName = tag.toUpperCase();
      this.children = [];
      this.parent = null;
      this.dataset = {};
      this.className = "";
      this.style = {};
      this.textContent = text !== undefined ? String(text) : "";
    }
    append(...nodes) {
      for (const n of nodes) {
        if (!n) continue;
        n.remove();
        this.children.push(n);
        n.parent = this;
      }
    }
    prepend(...nodes) {
      for (const n of nodes.reverse()) {
        if (!n) continue;
        n.remove();
        this.children.unshift(n);
        n.parent = this;
      }
    }
    remove() {
      if (this.parent) {
        this.parent.children.splice(this.parent.children.indexOf(this), 1);
        this.parent = null;
      }
    }
    contains(node) {
      for (let cur = node; cur; cur = cur.parent) {
        if (cur === this) return true;
      }
      return false;
    }
    replaceChildren(...nodes) {
      for (const c of [...this.children]) c.remove();
      this.append(...nodes);
    }
    setAttribute(k, v) {
      this[k] = v;
    }
    getAttribute(k) {
      return this[k];
    }
    removeAttribute(k) {
      delete this[k];
    }
    addEventListener() {}
    removeEventListener() {}
    querySelectorAll(pred) {
      const out = [];
      const visit = (el) => {
        if (pred(el)) out.push(el);
        for (const c of el.children || []) visit(c);
      };
      visit(this);
      return out;
    }
  }

  const prevElement = globalThis.Element;
  const prevDocument = globalThis.document;
  const prevRAF = globalThis.requestAnimationFrame;
  const prevCAF = globalThis.cancelAnimationFrame;
  const prevRO = globalThis.ResizeObserver;
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  globalThis.Element = TestElement;
  globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 0);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
  globalThis.document = {
    head: new TestElement("head"),
    querySelector: () => null,
    createDocumentFragment: () => new TestElement("fragment"),
    createTextNode: (text) => new TestElement("text", text),
    createElement: (tag) => {
      if (tag === "canvas") {
        const el = new TestElement("canvas");
        el.width = 400;
        el.height = 300;
        el.clientWidth = 400;
        el.clientHeight = 300;
        el.getContext = () => ({
          clearRect: () => {},
          beginPath: () => {},
          moveTo: () => {},
          lineTo: () => {},
          closePath: () => {},
          fill: () => {},
          stroke: () => {},
          fillText: () => {},
        });
        return el;
      }
      return new TestElement(tag);
    },
    createElementNS: (_ns, tag) => new TestElement(tag),
  };

  try {
    const { createInterfaces, createComponents } = await import(
      pathToFileURL(path.resolve("server/easel/modules/runtime.mjs"))
    );
    const registry = createInterfaces();

    const d20Dir = path.join(root, "d20");
    for (const name of ["abilityblock", "defensebanner", "vitality", "spellbook", "attackcard", "rolldialog", "equipmentslots"]) {
      const def = JSON.parse(fs.readFileSync(path.join(d20Dir, `interfaces/${name}.json`), "utf8"));
      const mod = await import(pathToFileURL(path.join(d20Dir, `client/${name}.mjs`)));
      const id = `easel.d20.${name}@1`;
      registry.define(id, def);
      registry.enter({ host: "easel.d20", implements: [id] });
      registry.api.register("easel.d20", id, mod.default);
      registry.leave();
    }

    const narrativeDir = path.join(root, "narrative");
    for (const name of ["richtext", "chatlog"]) {
      const def = JSON.parse(fs.readFileSync(path.join(narrativeDir, `interfaces/${name}.json`), "utf8"));
      const mod = await import(pathToFileURL(path.join(narrativeDir, `client/${name}.mjs`)));
      const id = `easel.narrative.${name}@1`;
      registry.define(id, def);
      registry.enter({ host: "easel.narrative", implements: [id] });
      registry.api.register("easel.narrative", id, mod.default);
      registry.leave();
    }

    const layoutDir = path.join(root, "layout");
    for (const name of ["vttworkspace", "toolstrip", "window", "tabs"]) {
      const def = JSON.parse(fs.readFileSync(path.join(layoutDir, `interfaces/${name}.json`), "utf8"));
      const mod = await import(pathToFileURL(path.join(layoutDir, `client/${name}.mjs`)));
      const id = `easel.layout.${name}@1`;
      registry.define(id, def);
      registry.enter({ host: "easel.layout", implements: [id] });
      registry.api.register("easel.layout", id, mod.default);
      registry.leave();
    }

    const pf1eDir = path.resolve("server/easel/modules/pf1e");
    for (const name of ["charactersheet", "npcsheet", "recordeditor"]) {
      const def = JSON.parse(fs.readFileSync(path.join(pf1eDir, `interfaces/${name}.json`), "utf8"));
      const mod = await import(pathToFileURL(path.join(pf1eDir, `client/${name}.mjs`)));
      const id = `easel.pf1e.${name}@1`;
      registry.define(id, def);
      registry.enter({ host: "easel.pf1e", implements: [id] });
      registry.api.register("easel.pf1e", id, mod.default);
      registry.leave();
    }
    registry.close([]);

    const domRoot = new TestElement("div");
    const manager = createComponents(registry, domRoot);
    globalThis.Easel = { Components: manager.api, Interfaces: registry.api };

    const charEvents = [];
    const charHandle = manager.api.create("easel.pf1e.charactersheet@1", {
      props: {
        actor: {
          id: "char-1",
          name: "Valeros",
          alignment: "ng",
          xp: 2400,
          abilities: {
            str: { base: 16, total: 16, modifier: 3 },
            dex: { base: 14, total: 14, modifier: 2 },
            con: { base: 14, total: 14, modifier: 2 },
            int: { base: 10, total: 10, modifier: 0 },
            wis: { base: 12, total: 12, modifier: 1 },
            cha: { base: 8, total: 8, modifier: -1 }
          },
          health: { hp: 45, maxHp: 45, tempHp: 0, nonlethal: 0 },
          speeds: { land: 30 },
          senses: { visionPreset: "normal" },
          skills: {
            clm: { ranks: 2, classSkillOverride: true },
            swm: { ranks: 1, classSkillOverride: true }
          },
          currency: { pp: 0, gp: 150, sp: 0, cp: 0 }
        },
        derived: {
          bab: 6,
          iteratives: [6, 1],
          cmb: 9,
          cmd: 21,
          ac: { normal: 18, touch: 12, flatFooted: 16 },
          saves: { fort: 7, ref: 4, will: 3 },
          speed: { land: 30 }
        },
        classes: [{ name: "Fighter", classLevel: 6 }],
        features: [{ id: "f-1", name: "Power Attack", subtype: "Feat" }],
        actions: [{ id: "act-1", name: "Longsword", actionType: "mwak", attackBonusFormula: "6" }],
        items: [
          { id: "item-1", name: "Longsword +1", type: "Weapon", weaponCategory: "martial", priceGp: 2315, weightLbs: 4, equipped: true, identified: true }
        ],
        activeTab: "summary"
      }
    });

    charEvents.length = 0;
    charHandle.on("rest", (p) => charEvents.push({ evt: "rest", p }));
    charHandle.on("rollInitiative", (p) => charEvents.push({ evt: "rollInitiative", p }));
    charHandle.on("rollSkill", (p) => charEvents.push({ evt: "rollSkill", p }));
    charHandle.on("useAction", (p) => charEvents.push({ evt: "useAction", p }));
    manager.api.mountRoot(charHandle);

    const restBtn = domRoot.querySelectorAll((el) => String(el.className).includes("pf1e-btn-rest"))[0];
    assert.ok(restBtn);
    restBtn.onclick({ shiftKey: false });
    assert.ok(charEvents.some((e) => e.evt === "rest"));

    const initBtn = domRoot.querySelectorAll((el) => String(el.className).includes("pf1e-btn-init"))[0];
    assert.ok(initBtn);
    initBtn.onclick();
    assert.ok(charEvents.some((e) => e.evt === "rollInitiative"));

    for (const tabId of ["attributes", "combat", "inventory", "features", "skills", "spellbooks", "buffs", "biography", "notes", "settings"]) {
      charHandle.setProps({ activeTab: tabId });
      const panel = domRoot.querySelectorAll((el) => String(el.className).includes(`pf1e-panel-${tabId}`))[0];
      assert.ok(panel, `Panel for ${tabId} should exist`);
      assert.equal(panel.hidden, false);
    }

    charHandle.setProps({ activeTab: "combat" });
    const combatInitBtn = domRoot.querySelectorAll((el) => String(el.className).includes("pf1e-btn-combat-init"))[0];
    assert.ok(combatInitBtn);
    combatInitBtn.onclick();
    assert.ok(charEvents.some((e) => e.evt === "rollInitiative"));

    charHandle.on("updateSkillClassSkill", (p) => charEvents.push({ evt: "updateSkillClassSkill", p }));
    charHandle.on("addCustomSkill", (p) => charEvents.push({ evt: "addCustomSkill", p }));
    charHandle.on("selectSpellbook", (p) => charEvents.push({ evt: "selectSpellbook", p }));

    charHandle.setProps({ activeTab: "skills" });
    const skillRollBtn = domRoot.querySelectorAll((el) => String(el.className).includes("pf1e-skill-roll-btn"))[0];
    assert.ok(skillRollBtn);
    skillRollBtn.onclick();
    assert.ok(charEvents.some((e) => e.evt === "rollSkill"));

    const addSubBtn = domRoot.querySelectorAll((el) => String(el.className).includes("pf1e-btn-add-subskill"))[0];
    assert.ok(addSubBtn);
    const subInput = domRoot.querySelectorAll((el) => String(el.className).includes("pf1e-subskill-name-input"))[0];
    subInput.value = "Alchemy";
    addSubBtn.onclick();
    assert.ok(charEvents.some((e) => e.evt === "addCustomSkill"));

    charHandle.setProps({ activeTab: "spellbooks" });
    const sbTab = domRoot.querySelectorAll((el) => String(el.className).includes("pf1e-sb-subtab"))[1];
    assert.ok(sbTab);
    sbTab.onclick();
    assert.ok(charEvents.some((e) => e.evt === "selectSpellbook"));

    charHandle.destroy();

    const npcEvents = [];
    const npcHandle = manager.api.create("easel.pf1e.npcsheet@1", {
      props: {
        mode: "lite",
        actor: {
          id: "npc-1",
          name: "Goblin Raider",
          cr: 0.33,
          xpAward: 135,
          creatureType: "humanoid",
          subtypes: ["goblinoid"],
          health: { hp: 6, maxHp: 6 },
          currency: { gp: 5, sp: 12 },
          skills: { perception: { ranks: 1, total: 3, ability: "wis" } }
        },
        actions: [{ id: "act-g1", name: "Short Sword", attackBonusFormula: "2" }],
        items: [{ id: "item-g1", name: "Short Sword", priceGp: 10, weightLbs: 2 }],
        spells: [{ id: "sp-1", name: "Acid Splash", level: 0 }],
        targetActorId: "char-1"
      }
    });

    npcHandle.on("useAction", (p) => npcEvents.push({ evt: "useAction", p }));
    npcHandle.on("castSpell", (p) => npcEvents.push({ evt: "castSpell", p }));
    npcHandle.on("rollSkill", (p) => npcEvents.push({ evt: "rollSkill", p }));
    npcHandle.on("transferItem", (p) => npcEvents.push({ evt: "transferItem", p }));
    npcHandle.on("transferCoin", (p) => npcEvents.push({ evt: "transferCoin", p }));
    manager.api.mountRoot(npcHandle);

    const npcAtkBtn = domRoot.querySelectorAll((el) => el.textContent === "Roll")[0];
    assert.ok(npcAtkBtn);
    npcAtkBtn.onclick({ shiftKey: false });
    assert.ok(npcEvents.some((e) => e.evt === "useAction"));

    const liteCastBtn = domRoot.querySelectorAll((el) => String(el.className).includes("pf1e-btn-lite-cast"))[0];
    assert.ok(liteCastBtn);
    liteCastBtn.onclick();
    assert.ok(npcEvents.some((e) => e.evt === "castSpell"));

    const liteSkillBtn = domRoot.querySelectorAll((el) => String(el.className).includes("pf1e-btn-lite-skill"))[0];
    assert.ok(liteSkillBtn);
    liteSkillBtn.onclick();
    assert.ok(npcEvents.some((e) => e.evt === "rollSkill"));

    npcHandle.setProps({ mode: "full" });
    assert.ok(domRoot.querySelectorAll((el) => String(el.className).includes("pf1e-npc-full-header"))[0]);

    npcHandle.setProps({ mode: "loot" });
    const takeBtn = domRoot.querySelectorAll((el) => String(el.className).includes("pf1e-btn-loot-item"))[0];
    assert.ok(takeBtn);
    takeBtn.onclick();
    assert.ok(npcEvents.some((e) => e.evt === "transferItem" && e.p.itemId === "item-g1"));

    const lootCoinsBtn = domRoot.querySelectorAll((el) => String(el.className).includes("pf1e-btn-loot-coins"))[0];
    assert.ok(lootCoinsBtn);
    lootCoinsBtn.onclick();
    assert.ok(npcEvents.some((e) => e.evt === "transferCoin"));

    npcHandle.destroy();

    const trapHandle = manager.api.create("easel.pf1e.npcsheet@1", {
      props: {
        recordType: "Trap",
        actor: { id: "trap-1", name: "Pit Trap", cr: 1, trapData: { perceptionDC: 20, disableDeviceDC: 20 } }
      }
    });
    const trapEvents = [];
    trapHandle.on("triggerTrap", (p) => trapEvents.push(p));
    manager.api.mountRoot(trapHandle);
    const trigTrapBtn = domRoot.querySelectorAll((el) => String(el.className).includes("pf1e-trap-trigger-btn"))[0];
    assert.ok(trigTrapBtn);
    trigTrapBtn.onclick();
    assert.ok(trapEvents.some((p) => p.trapId === "trap-1"));
    trapHandle.destroy();

    const editEvents = [];
    const editHandle = manager.api.create("easel.pf1e.recordeditor@1", {
      props: {
        recordType: "Weapon",
        record: {
          id: "wpn-1",
          name: "Flaming Longsword",
          weaponCategory: "martial",
          baseDamageDice: "1d8",
          modifiers: [{ target: "damage", bonusType: "untyped", formula: "1d6" }],
          contextNotes: [{ target: "damage", text: "Fire damage" }]
        },
        actions: [{ id: "act-slash", name: "Slash", attackBonusFormula: "5" }],
        activeTab: "details"
      }
    });
    editHandle.on("save", (p) => editEvents.push({ evt: "save", p }));
    editHandle.on("addAction", (p) => editEvents.push({ evt: "addAction", p }));
    editHandle.on("addModifier", (p) => editEvents.push({ evt: "addModifier", p }));
    editHandle.on("addContextNote", (p) => editEvents.push({ evt: "addContextNote", p }));
    manager.api.mountRoot(editHandle);

    editHandle.setProps({ activeTab: "actions" });
    const addActBtn = domRoot.querySelectorAll((el) => String(el.className).includes("pf1e-btn-add-action"))[0];
    assert.ok(addActBtn);
    addActBtn.onclick();
    assert.ok(editEvents.some((e) => e.evt === "addAction" && e.p.action.activation));

    editHandle.setProps({ activeTab: "modifiers" });
    const addModBtn = domRoot.querySelectorAll((el) => el.textContent === "Add Modifier")[0];
    assert.ok(addModBtn);
    addModBtn.onclick();
    assert.ok(editEvents.some((e) => e.evt === "addModifier"));

    const addNoteBtn = domRoot.querySelectorAll((el) => el.textContent === "Add Note")[0];
    assert.ok(addNoteBtn);
    addNoteBtn.onclick();
    assert.ok(editEvents.some((e) => e.evt === "addContextNote"));

    const saveBtn = domRoot.querySelectorAll((el) => String(el.className).includes("pf1e-btn-save-record"))[0];
    assert.ok(saveBtn);
    saveBtn.onclick();
    assert.ok(editEvents.some((e) => e.evt === "save" && e.p.recordType === "Weapon"));

    editHandle.destroy();
    manager.destroy();
  } finally {
    globalThis.Element = prevElement;
    globalThis.document = prevDocument;
    globalThis.requestAnimationFrame = prevRAF;
    globalThis.cancelAnimationFrame = prevCAF;
    globalThis.ResizeObserver = prevRO;
  }
});

test("Section 07: easel.pf1e.controller@1 mounts workspace, coordinates dicebox and chatlog", async () => {
  class TestElement {
    constructor(tag, text) {
      this.tagName = tag.toUpperCase();
      this.children = [];
      this.parent = null;
      this.dataset = {};
      this.className = "";
      this.classList = {
        add: (...cls) => {
          const set = new Set((this.className || "").split(/\s+/).filter(Boolean));
          for (const c of cls) set.add(c);
          this.className = Array.from(set).join(" ");
        },
        remove: (...cls) => {
          const set = new Set((this.className || "").split(/\s+/).filter(Boolean));
          for (const c of cls) set.delete(c);
          this.className = Array.from(set).join(" ");
        },
        contains: (c) => (this.className || "").split(/\s+/).includes(c),
        toggle: (c, force) => {
          const set = new Set((this.className || "").split(/\s+/).filter(Boolean));
          const has = set.has(c);
          const next = force !== undefined ? !!force : !has;
          if (next) set.add(c); else set.delete(c);
          this.className = Array.from(set).join(" ");
          return next;
        }
      };
      this.style = {};
      this.textContent = text !== undefined ? String(text) : "";
    }
    append(...nodes) {
      for (const n of nodes) {
        if (!n) continue;
        n.remove();
        this.children.push(n);
        n.parent = this;
      }
    }
    prepend(...nodes) {
      for (const n of nodes.reverse()) {
        if (!n) continue;
        n.remove();
        this.children.unshift(n);
        n.parent = this;
      }
    }
    remove() {
      if (this.parent) {
        this.parent.children.splice(this.parent.children.indexOf(this), 1);
        this.parent = null;
      }
    }
    contains(node) {
      for (let cur = node; cur; cur = cur.parent) {
        if (cur === this) return true;
      }
      return false;
    }
    replaceChildren(...nodes) {
      for (const c of [...this.children]) c.remove();
      this.append(...nodes);
    }
    setAttribute(k, v) {
      this[k] = v;
    }
    getAttribute(k) {
      return this[k];
    }
    removeAttribute(k) {
      delete this[k];
    }
    addEventListener() {}
    removeEventListener() {}
    querySelectorAll(pred) {
      const out = [];
      const visit = (el) => {
        if (pred(el)) out.push(el);
        for (const c of el.children || []) visit(c);
      };
      visit(this);
      return out;
    }
  }

  const prevApplication = globalThis.Application;
  const prevElement = globalThis.Element;
  const prevDocument = globalThis.document;
  const prevRAF = globalThis.requestAnimationFrame;
  const prevCAF = globalThis.cancelAnimationFrame;
  const prevRO = globalThis.ResizeObserver;
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  globalThis.Element = TestElement;
  globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 0);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
  globalThis.document = {
    head: new TestElement("head"),
    querySelector: () => null,
    createDocumentFragment: () => new TestElement("fragment"),
    createTextNode: (text) => new TestElement("text", text),
    createElement: (tag) => {
      if (tag === "canvas") {
        const el = new TestElement("canvas");
        el.width = 400;
        el.height = 300;
        el.clientWidth = 400;
        el.clientHeight = 300;
        el.getContext = () => ({
          clearRect: () => {},
          beginPath: () => {},
          moveTo: () => {},
          lineTo: () => {},
          closePath: () => {},
          fill: () => {},
          stroke: () => {},
          fillText: () => {},
        });
        return el;
      }
      return new TestElement(tag);
    },
    createElementNS: (_ns, tag) => new TestElement(tag),
  };

  try {
    const { createInterfaces, createComponents } = await import(
      pathToFileURL(path.resolve("server/easel/modules/runtime.mjs"))
    );
    const registry = createInterfaces();

    const d20Dir = path.join(root, "d20");
    for (const name of ["abilityblock", "defensebanner", "vitality", "spellbook", "attackcard", "rolldialog", "equipmentslots"]) {
      const def = JSON.parse(fs.readFileSync(path.join(d20Dir, `interfaces/${name}.json`), "utf8"));
      const mod = await import(pathToFileURL(path.join(d20Dir, `client/${name}.mjs`)));
      const id = `easel.d20.${name}@1`;
      registry.define(id, def);
      registry.enter({ host: "easel.d20", implements: [id] });
      registry.api.register("easel.d20", id, mod.default);
      registry.leave();
    }

    const narrativeDir = path.join(root, "narrative");
    for (const name of ["richtext", "chatlog"]) {
      const def = JSON.parse(fs.readFileSync(path.join(narrativeDir, `interfaces/${name}.json`), "utf8"));
      const mod = await import(pathToFileURL(path.join(narrativeDir, `client/${name}.mjs`)));
      const id = `easel.narrative.${name}@1`;
      registry.define(id, def);
      registry.enter({ host: "easel.narrative", implements: [id] });
      registry.api.register("easel.narrative", id, mod.default);
      registry.leave();
    }

    const diceDir = path.join(root, "dice");
    for (const name of ["dicebox", "dicesettings", "rollcard"]) {
      const def = JSON.parse(fs.readFileSync(path.join(diceDir, `interfaces/${name}.json`), "utf8"));
      const mod = await import(pathToFileURL(path.join(diceDir, `client/${name}.mjs`)));
      const id = `easel.dice.${name}@1`;
      registry.define(id, def);
      registry.enter({ host: "easel.dice", implements: [id] });
      registry.api.register("easel.dice", id, mod.default);
      registry.leave();
    }

    const combatDir = path.join(root, "combat");
    for (const name of ["encounter"]) {
      const def = JSON.parse(fs.readFileSync(path.join(combatDir, `interfaces/${name}.json`), "utf8"));
      const mod = await import(pathToFileURL(path.join(combatDir, `client/${name}.mjs`)));
      const id = `easel.combat.${name}@1`;
      registry.define(id, def);
      registry.enter({ host: "easel.combat", implements: [id] });
      registry.api.register("easel.combat", id, mod.default);
      registry.leave();
    }

    const layoutDir = path.join(root, "layout");
    for (const name of ["vttworkspace", "toolstrip", "window", "tabs"]) {
      const def = JSON.parse(fs.readFileSync(path.join(layoutDir, `interfaces/${name}.json`), "utf8"));
      const mod = await import(pathToFileURL(path.join(layoutDir, `client/${name}.mjs`)));
      const id = `easel.layout.${name}@1`;
      registry.define(id, def);
      registry.enter({ host: "easel.layout", implements: [id] });
      registry.api.register("easel.layout", id, mod.default);
      registry.leave();
    }

    const pf1eDir = path.resolve("server/easel/modules/pf1e");
    for (const name of ["charactersheet", "npcsheet", "recordeditor"]) {
      const def = JSON.parse(fs.readFileSync(path.join(pf1eDir, `interfaces/${name}.json`), "utf8"));
      const mod = await import(pathToFileURL(path.join(pf1eDir, `client/${name}.mjs`)));
      const id = `easel.pf1e.${name}@1`;
      registry.define(id, def);
      registry.enter({ host: "easel.pf1e", implements: [id] });
      registry.api.register("easel.pf1e", id, mod.default);
      registry.leave();
    }
    const collectionsDir = path.join(root, "collections");
    for (const name of ["directory", "compendium"]) {
      const def = JSON.parse(fs.readFileSync(path.join(collectionsDir, `interfaces/${name}.json`), "utf8"));
      const mod = await import(pathToFileURL(path.join(collectionsDir, `client/${name}.mjs`)));
      const id = `easel.collections.${name}@1`;
      registry.define(id, def);
      registry.enter({ host: "easel.collections", implements: [id] });
      registry.api.register("easel.collections", id, mod.default);
      registry.leave();
    }
    registry.close([]);

    const domRoot = new TestElement("div");
    const manager = createComponents(registry, domRoot);
    globalThis.Easel = { Components: manager.api, Interfaces: registry.api };

    const Controller = (
      await import(pathToFileURL(path.resolve("server/easel/modules/pf1e/client/controller.mjs")))
    ).default;
    globalThis.Application = { events: { emit: () => Promise.resolve(), on: () => {} }, onReady: () => {} };
    const controller = new Controller();
    controller.mount({ title: "PF1e Adventure" });

    assert.ok(controller.workspace);
    assert.ok(controller.dicebox);
    assert.ok(controller.chatlog);
    assert.ok(controller.tracker);

    controller.animateRoll({ dicePayload: { id: "roll-crit-1", dice: [{ sides: 20, value: 20 }] } });
    controller.receiveState({ entries: [], messages: [{ id: "roll-crit-1", card: { title: "Attack", total: 26 }, attackData: { isCriticalHit: true } }] });
    assert.equal(controller.dicebox.props.rolls[0].id, "roll-crit-1");
    assert.equal(controller.chatlog.props.messages[0].attackData.isCriticalHit, true);

    const charWin = controller.openCharacterSheet("actor-valeros", {
      actor: { id: "actor-valeros", name: "Valeros" }
    });
    assert.ok(charWin);
    assert.equal(charWin.props.title, "Valeros");

    const npcWin = controller.openNPCSheet("npc-goblin", "lite", {
      actor: { id: "npc-goblin", name: "Goblin" }
    });
    assert.ok(npcWin);
    assert.equal(npcWin.props.title, "Goblin");

    const editWin = controller.openRecordEditor("Weapon", "item-sword", {
      name: "Longsword +1"
    });
    assert.ok(editWin);
    assert.equal(editWin.props.title, "Edit Weapon");

    let dialogRolled = false;
    controller.openRollDialog({ name: "Slash", bonus: 5 }, (intent) => {
      dialogRolled = true;
      assert.equal(intent.bonus, 5);
    });
    const dialogRollBtn = domRoot.querySelectorAll((el) => String(el.className).includes("kit-btn-roll"))[0];
    assert.ok(dialogRollBtn);
    dialogRollBtn.onclick();
    assert.equal(dialogRolled, true);

    manager.destroy();
  } finally {
    globalThis.Application = prevApplication;
    globalThis.Element = prevElement;
    globalThis.document = prevDocument;
    globalThis.requestAnimationFrame = prevRAF;
    globalThis.cancelAnimationFrame = prevCAF;
    globalThis.ResizeObserver = prevRO;
  }
});

test("Section 08: easel.pf1e.game application manifest and guardrails", () => {
  const manifestPath = path.resolve("server/easel/applications/pf1e/manifest.json");
  assert.ok(fs.existsSync(manifestPath));
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  assert.equal(manifest.type, "application");
  assert.equal(manifest.owner, "easel");
  assert.equal(manifest.host, "pf1e");
  assert.equal(manifest.name, "game");
  assert.deepEqual(manifest.server.application.required.modules, ["easel.pf1e.rules", "easel.vtt.table"]);
  assert.ok(manifest.server.application.required.interfaces.includes("easel.pf1e.game@1"));
  assert.deepEqual(manifest.client.application.required.modules, ["easel.pf1e.rules", "easel.vtt.table"]);
  assert.ok(manifest.client.application.required.interfaces.includes("easel.pf1e.controller@1"));

  const serverAppPath = path.resolve("server/easel/applications/pf1e/server/application.mjs");
  const serverCode = fs.readFileSync(serverAppPath, "utf8").trim();
  assert.ok(serverCode.includes('Easel.Interfaces.create("easel.vtt.table@1")'));

  const clientAppPath = path.resolve("server/easel/applications/pf1e/client/application.mjs");
  const clientCode = fs.readFileSync(clientAppPath, "utf8").trim();
  assert.ok(clientCode.includes("bindTable(ctrl)"));
});

test("Section 08: easel.pf1e.game application composition", async () => {
  class TestElement {
    constructor(tag, text) {
      this.tagName = tag.toUpperCase();
      this.children = [];
      this.parent = null;
      this.dataset = {};
      this.className = "";
      this.classList = {
        add: (...cls) => {
          const set = new Set((this.className || "").split(/\s+/).filter(Boolean));
          for (const c of cls) set.add(c);
          this.className = Array.from(set).join(" ");
        },
        remove: (...cls) => {
          const set = new Set((this.className || "").split(/\s+/).filter(Boolean));
          for (const c of cls) set.delete(c);
          this.className = Array.from(set).join(" ");
        },
        contains: (c) => (this.className || "").split(/\s+/).includes(c),
        toggle: (c, force) => {
          const set = new Set((this.className || "").split(/\s+/).filter(Boolean));
          const has = set.has(c);
          const next = force !== undefined ? !!force : !has;
          if (next) set.add(c); else set.delete(c);
          this.className = Array.from(set).join(" ");
          return next;
        }
      };
      this.style = {};
      this.textContent = text !== undefined ? String(text) : "";
    }
    append(...nodes) {
      for (const n of nodes) {
        if (!n) continue;
        n.remove();
        this.children.push(n);
        n.parent = this;
      }
    }
    prepend(...nodes) {
      for (const n of nodes.reverse()) {
        if (!n) continue;
        n.remove();
        this.children.unshift(n);
        n.parent = this;
      }
    }
    remove() {
      if (this.parent) {
        this.parent.children.splice(this.parent.children.indexOf(this), 1);
        this.parent = null;
      }
    }
    contains(node) {
      for (let cur = node; cur; cur = cur.parent) {
        if (cur === this) return true;
      }
      return false;
    }
    replaceChildren(...nodes) {
      for (const c of [...this.children]) c.remove();
      this.append(...nodes);
    }
    setAttribute(k, v) {
      this[k] = v;
    }
    getAttribute(k) {
      return this[k];
    }
    removeAttribute(k) {
      delete this[k];
    }
    addEventListener() {}
    removeEventListener() {}
    querySelectorAll(pred) {
      const out = [];
      const visit = (el) => {
        if (pred(el)) out.push(el);
        for (const c of el.children || []) visit(c);
      };
      visit(this);
      return out;
    }
  }

  const prevElement = globalThis.Element;
  const prevDocument = globalThis.document;
  const prevRAF = globalThis.requestAnimationFrame;
  const prevCAF = globalThis.cancelAnimationFrame;
  const prevRO = globalThis.ResizeObserver;

  globalThis.Element = TestElement;
  globalThis.document = {
    head: new TestElement("head"),
    querySelector: () => null,
    querySelectorAll: () => [],
    createDocumentFragment: () => new TestElement("fragment"),
    createTextNode: (text) => new TestElement("text", text),
    createElement: (tag) => {
      if (tag === "canvas") {
        const el = new TestElement("canvas");
        el.width = 400;
        el.height = 300;
        el.clientWidth = 400;
        el.clientHeight = 300;
        el.getContext = () => ({
          clearRect: () => {},
          beginPath: () => {},
          moveTo: () => {},
          lineTo: () => {},
          closePath: () => {},
          fill: () => {},
          stroke: () => {},
          fillText: () => {},
        });
        return el;
      }
      return new TestElement(tag);
    },
    createElementNS: (_ns, tag) => new TestElement(tag),
    body: new TestElement("body"),
  };
  globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };

  try {
    const { createInterfaces, createComponents } = await import(
      pathToFileURL(path.resolve("server/easel/modules/runtime.mjs"))
    );
    const registry = createInterfaces();

    const loadClientDef = (p) => JSON.parse(fs.readFileSync(path.resolve(p), "utf8"));
    const registerC = async (id, jsonPath, jsPath) => {
      const def = loadClientDef(jsonPath);
      const mod = await import(pathToFileURL(path.resolve(jsPath)));
      registry.define(id, def);
      const host = id.split(".")[1];
      registry.enter({ host: `easel.${host}`, implements: [id] });
      registry.api.register(`easel.${host}`, id, mod.default);
      registry.leave();
    };

    await registerC("easel.layout.vttworkspace@1", "server/easel/server/library/layout/interfaces/vttworkspace.json", "server/easel/server/library/layout/client/vttworkspace.mjs");
    await registerC("easel.layout.toolstrip@1", "server/easel/server/library/layout/interfaces/toolstrip.json", "server/easel/server/library/layout/client/toolstrip.mjs");
    await registerC("easel.layout.tabs@1", "server/easel/server/library/layout/interfaces/tabs.json", "server/easel/server/library/layout/client/tabs.mjs");
    await registerC("easel.layout.window@1", "server/easel/server/library/layout/interfaces/window.json", "server/easel/server/library/layout/client/window.mjs");
    await registerC("easel.layout.panel@1", "server/easel/server/library/layout/interfaces/panel.json", "server/easel/server/library/layout/client/panel.mjs");
    await registerC("easel.layout.dialog@1", "server/easel/server/library/layout/interfaces/dialog.json", "server/easel/server/library/layout/client/dialog.mjs");

    const pixiDir = path.resolve("server/easel/modules/pixi");
    const pixiDef = JSON.parse(
      fs.readFileSync(path.join(pixiDir, "interfaces/pixi.json"), "utf8"),
    );
    const PixiClass = (
      await import(pathToFileURL(path.join(pixiDir, "client/pixi.mjs")))
    ).default;
    class HeadlessPixi extends PixiClass {
      constructor() {
        super();
        const ContainerClass = this.Container;
        this.Application = class MockApplication {
          constructor() {
            this.stage = new ContainerClass();
          }
          init() {
            return Promise.resolve();
          }
          destroy() {}
        };
      }
    }
    registry.define("easel.graphics.pixi@1", pixiDef);
    registry.enter({
      host: "easel.graphics",
      implements: ["easel.graphics.pixi@1"],
    });
    registry.api.register("easel.graphics", "easel.graphics.pixi@1", HeadlessPixi);
    registry.leave();

    await registerC("easel.maps.map@1", "server/easel/server/library/maps/interfaces/map.json", "server/easel/server/library/maps/client/map.mjs");
    await registerC("easel.maps.fog@1", "server/easel/server/library/maps/interfaces/fog.json", "server/easel/server/library/maps/client/fog.mjs");
    await registerC("easel.dice.dicebox@1", "server/easel/server/library/dice/interfaces/dicebox.json", "server/easel/server/library/dice/client/dicebox.mjs");
    await registerC("easel.dice.dicesettings@1", "server/easel/server/library/dice/interfaces/dicesettings.json", "server/easel/server/library/dice/client/dicesettings.mjs");
    await registerC("easel.dice.rollcard@1", "server/easel/server/library/dice/interfaces/rollcard.json", "server/easel/server/library/dice/client/rollcard.mjs");
    await registerC("easel.combat.encounter@1", "server/easel/server/library/combat/interfaces/encounter.json", "server/easel/server/library/combat/client/encounter.mjs");
    await registerC("easel.narrative.chatlog@1", "server/easel/server/library/narrative/interfaces/chatlog.json", "server/easel/server/library/narrative/client/chatlog.mjs");
    await registerC("easel.narrative.richtext@1", "server/easel/server/library/narrative/interfaces/richtext.json", "server/easel/server/library/narrative/client/richtext.mjs");
    await registerC("easel.collections.directory@1", "server/easel/server/library/collections/interfaces/directory.json", "server/easel/server/library/collections/client/directory.mjs");
    await registerC("easel.collections.compendium@1", "server/easel/server/library/collections/interfaces/compendium.json", "server/easel/server/library/collections/client/compendium.mjs");

    await registerC("easel.d20.abilityblock@1", "server/easel/server/library/d20/interfaces/abilityblock.json", "server/easel/server/library/d20/client/abilityblock.mjs");
    await registerC("easel.d20.defensebanner@1", "server/easel/server/library/d20/interfaces/defensebanner.json", "server/easel/server/library/d20/client/defensebanner.mjs");
    await registerC("easel.d20.vitality@1", "server/easel/server/library/d20/interfaces/vitality.json", "server/easel/server/library/d20/client/vitality.mjs");
    await registerC("easel.d20.spellbook@1", "server/easel/server/library/d20/interfaces/spellbook.json", "server/easel/server/library/d20/client/spellbook.mjs");
    await registerC("easel.d20.attackcard@1", "server/easel/server/library/d20/interfaces/attackcard.json", "server/easel/server/library/d20/client/attackcard.mjs");
    await registerC("easel.d20.rolldialog@1", "server/easel/server/library/d20/interfaces/rolldialog.json", "server/easel/server/library/d20/client/rolldialog.mjs");
    await registerC("easel.d20.equipmentslots@1", "server/easel/server/library/d20/interfaces/equipmentslots.json", "server/easel/server/library/d20/client/equipmentslots.mjs");
    await registerC("easel.rules.modifierlist@1", "server/easel/server/library/rules/interfaces/modifierlist.json", "server/easel/server/library/rules/client/modifierlist.mjs");

    await registerC("easel.pf1e.charactersheet@1", "server/easel/modules/pf1e/interfaces/charactersheet.json", "server/easel/modules/pf1e/client/charactersheet.mjs");
    await registerC("easel.pf1e.npcsheet@1", "server/easel/modules/pf1e/interfaces/npcsheet.json", "server/easel/modules/pf1e/client/npcsheet.mjs");
    await registerC("easel.pf1e.recordeditor@1", "server/easel/modules/pf1e/interfaces/recordeditor.json", "server/easel/modules/pf1e/client/recordeditor.mjs");
    await registerC("easel.pf1e.controller@1", "server/easel/modules/pf1e/interfaces/controller.json", "server/easel/modules/pf1e/client/controller.mjs");

    for (const name of ["scenebinder", "combatbinder", "chatbinder", "directorybinder"]) {
      await registerC(`easel.vtt.${name}@1`, `server/easel/modules/vtt/interfaces/${name}.json`, `server/easel/modules/vtt/client/${name}.mjs`);
    }
    for (const [id, file] of Object.entries({
      "easel.vtt.table@1": "modules/vtt/server/table.mjs",
      "easel.maps.geometry@1": "server/library/maps/server/geometry.mjs",
      "easel.visibility.projection@1": "server/library/visibility/server/projection.mjs",
      "easel.d20.check@1": "server/library/d20/server/check.mjs",
      "easel.dice.notation@1": "server/library/dice/server/notation.mjs",
      "easel.dice.roller@1": "server/library/dice/server/roller.mjs",
    })) {
      registry.define(id, {});
      const host = id.slice(0, id.lastIndexOf("."));
      registry.enter({ host, implements: [id] });
      registry.api.register(host, id, (await import(pathToFileURL(path.resolve("server/easel", file)))).default);
      registry.leave();
    }

    const GameClass = (
      await import(pathToFileURL(path.resolve("server/easel/modules/pf1e/server/game.mjs")))
    ).default;
    registry.define("easel.pf1e.game@1", {});
    registry.enter({ host: "easel.pf1e", implements: ["easel.pf1e.game@1"] });
    registry.api.register("easel.pf1e", "easel.pf1e.game@1", GameClass);
    registry.leave();

    registry.close([]);

    const domRoot = new TestElement("div");
    const manager = createComponents(registry, domRoot);
    globalThis.Easel = { Components: manager.api, Interfaces: registry.api };

    const eventsEmitted = [];
    globalThis.Application = {
      onReady: () => {},
      events: {
        emit: (name, payload) => {
          eventsEmitted.push({ name, payload });
          return Promise.resolve();
        },
        on: (name, handler) => {},
        register: () => {}
      }
    };

    const clientAppMod = await import(
      pathToFileURL(path.resolve("server/easel/applications/pf1e/client/application.mjs"))
    );
    assert.equal(typeof clientAppMod.initialize, "function");

    const controller = clientAppMod.initialize({ title: "PF1e Tabletop RPG", gmMode: true });
    assert.ok(controller);
    assert.ok(domRoot.children.length > 0);
    assert.ok(controller.workspace);
    assert.ok(controller.map);
    assert.ok(controller.dicebox);
    assert.ok(controller.toolstrip);
    assert.ok(controller.chatlog);
    assert.ok(controller.tracker);
    assert.ok(controller.directory);
    assert.ok(controller.compendium);
    assert.ok(controller.dicesettings);

    const serverAppMod = await import(
      pathToFileURL(path.resolve("server/easel/applications/pf1e/server/application.mjs"))
    );

    const Game = (await import(pathToFileURL(path.resolve("server/easel/modules/pf1e/server/game.mjs")))).default;
    const game = new Game();


    const mockSource = { integer: (min, max) => (min === 0 && max === 20 ? 17 : min === 1 && max === 20 ? 18 : 4) };

    const rollAb = game.rollAbility({ actorId: "actor-valeros", ability: "str", modifier: 4, source: mockSource });
    assert.equal(rollAb.type, "ability");
    assert.equal(rollAb.card.total, 22);

    const rollAtk = game.useAction({
      actorId: "actor-valeros",
      actionId: "act-sword",
      actionData: { name: "Longsword", attackBonus: 7, critRange: 19, critMultiplier: 2, damageParts: [{ formula: "1d8+4" }] },
      source: mockSource
    });
    assert.equal(rollAtk.type, "attack");

    const rollSave = game.rollSave({ actorId: "actor-valeros", save: "ref", modifier: 3, dc: 15, source: mockSource });
    assert.equal(rollSave.type, "save");
    assert.equal(rollSave.card.success, true);

    const rollSpell = game.castSpell({ actorId: "actor-seoni", spellId: "sp-fireball", level: 3, spellData: { name: "Fireball" }, source: mockSource });
    assert.equal(rollSpell.type, "spell");

    controller.animateRoll(rollAtk);
    controller.tableBindings.chat.update({ messages: [], diceSettings: {} });
    controller.receiveState({ entries: [], messages: [{ id: rollAtk.rollId, card: rollAtk.card }] });
    assert.ok(controller.dicebox.props.rolls.length > 0);
    assert.ok(controller.chatlog.props.messages.length > 0);

    const statblockParser = (await import(pathToFileURL(path.resolve("server/easel/modules/pf1e/server/statblock.mjs")))).default;
    const parser = new statblockParser();
    const parsed = parser.parse(`GOBLIN CR 1/3\nXP 135\nNE Small humanoid (goblinoid)\nInit +6; Senses darkvision 60 ft.; Perception -1\nDEFENSE\nAC 16, touch 13, flat-footed 14 (+2 armor, +2 Dex, +1 shield, +1 size)\nhp 6 (1d10+1)\nFort +3, Ref +2, Will -1\nOFFENSE\nSpeed 30 ft.\nMelee short sword +2 (1d4/19-20)\nRanged short bow +4 (1d4/x3)\nSTATISTICS\nStr 11, Dex 15, Con 12, Int 10, Wis 9, Cha 6\nBase Atk +1; CMB +0; CMD 12\nFeats Improved Initiative\nSkills Ride +10, Stealth +10, Swim +4\nLanguages Goblin`);
    assert.equal(parsed.npc.name, "GOBLIN");
    assert.equal(parsed.npc.size, "small");
    assert.equal(parsed.npc.health.hp, 6);

    const sec = await import(pathToFileURL(path.resolve("server/easel/modules/pf1e/server/security.mjs")));
    const projectedForPlayer = sec.projectActor(parsed.npc, "player-1");
    assert.equal(projectedForPlayer.name, "GOBLIN");
    assert.equal(projectedForPlayer.notes, undefined);

    const { ActorConditions } = await import(pathToFileURL(path.resolve("server/easel/modules/pf1e/server/layers/actor-conditions.mjs")));
    const condHandler = new ActorConditions();
    const blinded = condHandler.expandConditions(["blinded"]);
    assert.equal(blinded.stateFlags.loseDexToAC, true);

    const charWin = controller.openCharacterSheet("actor-valeros", { actor: { id: "actor-valeros", name: "Valeros" } });
    assert.ok(charWin);
    const npcWin = controller.openNPCSheet("npc-goblin", "full", { actor: parsed.npc });
    assert.ok(npcWin);
    const editWin = controller.openRecordEditor("Weapon", "item-sword", { name: "Short Sword" });
    assert.ok(editWin);

    manager.destroy();
  } finally {
    globalThis.Element = prevElement;
    globalThis.document = prevDocument;
    globalThis.requestAnimationFrame = prevRAF;
    globalThis.cancelAnimationFrame = prevCAF;
    globalThis.ResizeObserver = prevRO;
  }
});



