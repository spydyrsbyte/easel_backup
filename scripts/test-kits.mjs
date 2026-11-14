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

test("PixiJS client components template@1 and worldmap@1 mount and validate events through runtime.mjs", async () => {
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
    for (const name of ["template", "worldmap"]) {
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
      registry.api.register("easel.maps", id, mod.default);
      registry.leave();
    }

    const domRoot = new TestElement("main");
    const tplManager = createComponents(registry, domRoot);
    const tplHandle = tplManager.api.create("easel.maps.template@1", {
      props: {
        width: 800,
        height: 600,
        templates: [{ id: "cone-1", kind: "cone", origin: { x: 100, y: 100 }, length: 120, angle: 60 }],
      },
    });
    tplManager.api.mountRoot(tplHandle);
    tplManager.destroy();

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

test("Section 03 components dicebox, dicesettings, rollcard and richtext mount and validate events", async () => {
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
      { host: "dice", name: "dicebox" },
      { host: "dice", name: "dicesettings" },
      { host: "dice", name: "rollcard" },
      { host: "narrative", name: "richtext" },
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
