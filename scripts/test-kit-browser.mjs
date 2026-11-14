import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { pathToFileURL } from "node:url";
const { chromium } = await import(
  pathToFileURL(
    process.env.EASEL_PLAYWRIGHT_MODULE ||
      path.resolve("node_modules/playwright/index.mjs"),
  )
);
const root = path.resolve("server/easel/server/library");
const libraryIndex = JSON.parse(
  fs.readFileSync(path.join(root, "catalog.json"), "utf8"),
);
const pixiRoot = path.resolve("server/easel/modules/pixi");
const pixiDefinition = JSON.parse(
  fs.readFileSync(path.join(pixiRoot, "interfaces/pixi.json"), "utf8"),
);
const members = [];
for (const library of libraryIndex.libraries) {
  const dir = path.join(root, library.host),
    manifest = JSON.parse(
      fs.readFileSync(path.join(dir, "manifest.json"), "utf8"),
    );
  for (const m of JSON.parse(
    fs.readFileSync(path.join(dir, "catalog.json"), "utf8"),
  ).members.filter((m) => m.side === "client"))
    members.push({
      ...m,
      host: library.host,
      id: "easel." + library.host + "." + m.name + "@" + (m.version || 1),
      url: "/library/" + library.host + "/" + m.entry,
      requires:
        (Array.isArray(manifest.client?.interfaces)
          ? manifest.client.interfaces.find(
              (i) => i.name === m.name || i.name === m.name + "@" + (m.version || 1),
            )?.required?.interfaces
          : manifest.client?.interfaces?.[m.name]?.required?.interfaces) || [],
      definition: JSON.parse(
        fs.readFileSync(path.join(dir, m.contract), "utf8"),
      ),
    });
}
const policy = "style-src 'self'";
const pageStyle = "body{margin:0;padding:24px;background:#0f141b;color:#eee}";
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  let file;
  if (url.pathname === "/page.css") {
    res.setHeader("content-type", "text/css");
    return res.end(pageStyle);
  }
  if (url.pathname === "/") {
    res.setHeader("content-type", "text/html");
    res.setHeader("content-security-policy", policy);
    return res.end(
      '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Easel Kit verification</title><link rel="stylesheet" href="/page.css"></head><body><main id="root"></main></body></html>',
    );
  }
  if (url.pathname === "/runtime.mjs")
    file = path.resolve("server/easel/modules/runtime.mjs");
  else if (url.pathname === "/back.webp")
    file = path.resolve(
      "server/easel/server/library/dice/client/assets/standard.webp",
    );
  else if (url.pathname.startsWith("/modules/pixi/")) {
    file = path.resolve(
      pixiRoot,
      decodeURIComponent(url.pathname.slice("/modules/pixi/".length)),
    );
    if (!file.startsWith(pixiRoot + path.sep)) {
      res.statusCode = 403;
      return res.end();
    }
  } else if (url.pathname.startsWith("/library/")) {
    file = path.resolve(
      root,
      decodeURIComponent(url.pathname.slice("/library/".length)),
    );
    if (!file.startsWith(root + path.sep)) {
      res.statusCode = 403;
      return res.end();
    }
  }
  if (!file || !fs.existsSync(file)) {
    res.statusCode = 404;
    return res.end();
  }
  res.setHeader(
    "content-type",
    file.endsWith(".mjs")
      ? "text/javascript"
      : file.endsWith(".webp")
        ? "image/webp"
        : file.endsWith(".css")
          ? "text/css"
          : "application/json",
  );
  res.end(fs.readFileSync(file));
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium
  .launch({ channel: "msedge", headless: true })
  .catch(() => chromium.launch({ headless: true }));
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }),
  errors = [],
  requests = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.addInitScript(() => {
  globalThis.cspViolations = [];
  document.addEventListener("securitypolicyviolation", (e) =>
    globalThis.cspViolations.push(e.violatedDirective + " " + e.sourceFile + ":" + e.lineNumber),
  );
});
page.on("request", (r) => {
  if (r.url().includes("/library/") && r.url().endsWith(".mjs"))
    requests.push(new URL(r.url()).pathname);
});
await page.route("**/*", (route) => {
  const url = new URL(route.request().url());
  let file;
  if (url.pathname === "/page.css")
    return route.fulfill({ status: 200, contentType: "text/css", body: pageStyle });
  if (url.pathname === "/") {
    return route.fulfill({
      status: 200,
      contentType: "text/html",
      headers: { "content-security-policy": policy },
      body: '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Easel Kit verification</title><link rel="stylesheet" href="/page.css"></head><body><main id="root"></main></body></html>',
    });
  }
  if (url.pathname === "/runtime.mjs")
    file = path.resolve("server/easel/modules/runtime.mjs");
  else if (url.pathname === "/back.webp")
    file = path.resolve(
      "server/easel/server/library/dice/client/assets/standard.webp",
    );
  else if (url.pathname.startsWith("/modules/pixi/")) {
    file = path.resolve(
      pixiRoot,
      decodeURIComponent(url.pathname.slice("/modules/pixi/".length)),
    );
    if (!file.startsWith(pixiRoot + path.sep))
      return route.fulfill({ status: 403 });
  } else if (url.pathname.startsWith("/library/")) {
    file = path.resolve(
      root,
      decodeURIComponent(url.pathname.slice("/library/".length)),
    );
    if (!file.startsWith(root + path.sep))
      return route.fulfill({ status: 403 });
  }
  if (!file || !fs.existsSync(file)) return route.fulfill({ status: 404 });
  const contentType = file.endsWith(".mjs")
    ? "text/javascript"
    : file.endsWith(".webp")
      ? "image/webp"
      : file.endsWith(".json")
        ? "application/json"
        : file.endsWith(".css")
          ? "text/css"
          : "application/octet-stream";
  return route.fulfill({
    status: 200,
    contentType,
    body: fs.readFileSync(file),
  });
});
try {
  await page.goto("http://127.0.0.1:" + server.address().port);
  await page.evaluate(
    async ({ members, pixiDefinition }) => {
      const { createInterfaces, createComponents } =
        await import("/runtime.mjs");
      const registry = createInterfaces();
      registry.loader((url) => import(url));
      registry.define("easel.graphics.pixi@1", pixiDefinition);
      registry.lazy(
        "easel.graphics.pixi@1",
        "easel.graphics.pixi",
        "/modules/pixi/client/pixi.mjs",
      );
      for (const m of members) {
        registry.define(m.id, m.definition);
        registry.lazy(m.id, "easel." + m.host, m.url, m.requires || []);
      }
      registry.close([]);
      globalThis.Easel = { Interfaces: registry.api, Components: null };
      globalThis.kitRegistry = registry;
      globalThis.createKitComponents = createComponents;
    },
    { members, pixiDefinition },
  );
  assert.equal(
    requests.length,
    0,
    "catalog import must not load member implementations",
  );
  await page.evaluate(async () => {
    await kitRegistry.api.load("easel.input.selection@1");
    const before = kitRegistry.api.list("easel.input.selection@1")[0].obj;
    await kitRegistry.api.load("easel.input.selection@1");
    if (kitRegistry.api.list("easel.input.selection@1")[0].obj !== before)
      throw new Error("Implementation cache changed");
  });
  assert.deepEqual(
    requests.sort(),
    [
      "/library/input/client/base.mjs",
      "/library/input/client/safe.mjs",
      "/library/input/client/selection.mjs",
    ].sort(),
  );
  const results = [];
  for (const member of members) {
    const result = await page.evaluate(async (m) => {
      await kitRegistry.api.load(m.id);
      const root = document.getElementById("root");
      root.replaceChildren();
      const manager = createKitComponents(kitRegistry, root),
        props = m.definition.properties.title ? { title: m.id } : {},
        events = [];
      const sample = [
        {
          id: "a",
          name: "Alpha",
          label: "Alpha",
          description: "First entry",
          value: 3,
          max: 5,
          price: 2,
          quantity: 3,
          actor: "Alice",
          amount: 2,
          ready: true,
          tags: ["fire"],
          image: "/back.webp",
        },
        {
          id: "b",
          name: "Beta",
          label: "Beta",
          value: 1,
          max: 5,
          price: 3,
          quantity: 1,
          actor: "Bob",
          amount: 3,
          ready: false,
          requires: ["a"],
        },
      ];
      for (const [key, rule] of Object.entries(m.definition.properties)) {
        if (key === "items") props.items = sample;
        if (key === "data")
          props.data = {
            id: "card",
            name: "Test card",
            label: "Test entry",
            text: "Text body",
            description: "Description",
            oracle: "Oracle text",
            life: 3,
            known: true,
            value: 2,
            price: 2,
            quantity: 3,
            image: "/back.webp",
            face: "/back.webp",
            back: "/back.webp",
            from: "gold",
            to: "silver",
            rate: 2,
            remaining: 5,
            highest: 3,
            filled: 2,
          };
        if (key === "src") props.src = "/back.webp";
        if (key === "alt") props.alt = "Example image";
        if (key === "text") props.text = "Example text";
        if (key === "active") props.active = "a";
        if (key === "value") props.value = 2;
        if (key === "fields")
          props.fields = [
            { id: "life", path: "life", label: "Life", type: "number" },
          ];
        if (key === "actions")
          props.actions = [{ id: "inspect", label: "Inspect" }];
        if (key === "bindings")
          props.bindings = [{ key: "k", action: "example" }];
        if (key === "nodes")
          props.nodes = [
            { id: "a", label: "Alpha", x: 100, y: 100 },
            { id: "b", label: "Beta", x: 300, y: 200 },
          ];
        if (key === "edges") props.edges = [{ from: "a", to: "b" }];
        if (key === "points")
          props.points = [
            { x: 10, y: 10 },
            { x: 100, y: 100 },
          ];
        if (key === "regions")
          props.regions = [
            {
              id: "r",
              color: "#826a3e",
              points: [
                { x: 0, y: 0 },
                { x: 100, y: 0 },
                { x: 50, y: 100 },
              ],
            },
          ];
        if (key === "layers")
          props.layers = [
            { image: "/back.webp", x: 0, y: 0, width: 200, height: 280 },
          ];
        if (key === "columns" && rule.type === "Array")
          props.columns = [
            { key: "label", label: "Name" },
            { key: "value", label: "Value" },
          ];
        if (key === "height") props.height = 300;
      }
      const handle = manager.api.create(m.id, { props });
      for (const event of Object.keys(m.definition.events))
        handle.on(event, (payload) => events.push({ event, payload }));
      manager.api.mountRoot(handle);
      if (!root.querySelector("[data-kit]"))
        throw new Error("Component did not mount");
      const button = root.querySelector("button:not(:disabled)");
      button?.click();
      const input = root.querySelector("input");
      if (input) {
        input.value = input.type === "number" ? "4" : "changed";
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
      const item = root.querySelector("[role=option]");
      item?.click();
      if (
        m.renderer === "selection" &&
        !events.some((e) => e.event === "selection")
      )
        throw new Error("Selection did not emit");
      if (m.renderer === "card" || m.renderer === "cardinspect") {
        handle.setProps({
          data: {
            id: "secret",
            faceUp: false,
            name: "PRIVATE CARD",
            oracle: "PRIVATE RULES",
            back: "/back.webp",
          },
        });
        if (root.textContent.includes("PRIVATE"))
          throw new Error("Face-down rendering leaked content");
      }
      const rect = root.getBoundingClientRect();
      if (!Number.isFinite(rect.width)) throw new Error("Invalid geometry");
      manager.destroy();
      if (root.children.length) throw new Error("Component teardown left DOM");
      return { id: m.id, events: events.length };
    }, member);
    results.push(result);
  }
  await page.evaluate(async () => {
    const root = document.getElementById("root");
    root.replaceChildren();
    const manager = createKitComponents(kitRegistry, root);
    await kitRegistry.api.load("easel.surfaces.table@1");
    await kitRegistry.api.load("easel.cards.card@1");
    const surface = manager.api.create("easel.surfaces.table@1", { props: { height: 300, camera: { x: 35, y: 25, zoom: 1.5, rotation: 45 } } });
    const card = manager.api.create("easel.cards.card@1", { props: { data: { id: "a", name: "Visible card", image: "/back.webp" } } });
    card.attach(surface, "objects");
    manager.api.mountRoot(surface);
    const viewport = root.querySelector(".kit-surface"), world = root.querySelector(".kit-world");
    const point = (x,y) => new DOMPoint(x,y).matrixTransform(new DOMMatrix(getComputedStyle(root.querySelector(".kit-world")).transform).inverse());
    const before = point(150,100), rect = viewport.getBoundingClientRect();
    viewport.dispatchEvent(new WheelEvent("wheel", { clientX: rect.left+150, clientY: rect.top+100, deltaY: -100, cancelable: true }));
    const after = point(150,100);
    if(Math.hypot(before.x-after.x,before.y-after.y)>.001) throw new Error("Zoom moved its pointer anchor");
    surface.setProps({focus:{x:10,y:20}});
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const focusedViewport=root.querySelector(".kit-surface");
    const centered=point(focusedViewport.clientWidth/2,focusedViewport.clientHeight/2);
    if(Math.hypot(centered.x-10,centered.y-20)>1) throw new Error("Camera did not focus its world point");
    let rejected=false;try{surface.setProps({camera:{zoom:0}});}catch{rejected=true;}
    if(!rejected)throw new Error("Invalid camera zoom was accepted");
    manager.destroy();
  });
  await page.evaluate(async () => {
    const root = document.getElementById("root");root.replaceChildren();
    const manager=createKitComponents(kitRegistry,root);
    await kitRegistry.api.load("easel.input.shortcut@1");
    let calls=0;const shortcuts=manager.api.create("easel.input.shortcut@1",{props:{bindings:[{key:"k",action:"test"}]}});
    shortcuts.on("action",()=>calls++);manager.api.mountRoot(shortcuts);
    document.body.dispatchEvent(new KeyboardEvent("keydown",{key:"k",bubbles:true}));
    if(calls!==1)throw new Error("Shortcut did not activate");
    const input=document.createElement("input");root.append(input);input.dispatchEvent(new KeyboardEvent("keydown",{key:"k",bubbles:true}));
    if(calls!==1)throw new Error("Shortcut intercepted text input");
    manager.destroy();document.body.dispatchEvent(new KeyboardEvent("keydown",{key:"k",bubbles:true}));
    if(calls!==1)throw new Error("Destroyed shortcut retained a listener");root.replaceChildren();
  });
  await page.evaluate(async () => {
    const root = document.getElementById("root");
    root.replaceChildren();
    const manager = createKitComponents(kitRegistry, root);
    await kitRegistry.api.load("easel.graphics.pixi@1");
    await kitRegistry.api.load("easel.maps.worldmap@1");
    manager.destroy();
    const wmManager = createKitComponents(kitRegistry, root);
    const wmEvents = [];
    const wm = wmManager.api.create("easel.maps.worldmap@1", {
      props: {
        title: "Golarion",
        pins: [{ id: "pin-1", label: "Sandpoint", x: 120, y: 150, linkedMapId: "map-sandpoint" }],
      },
    });
    wm.on("pinSelect", (p) => wmEvents.push(p));
    wmManager.api.mountRoot(wm);
    const pinBtn = root.querySelector("[data-pin-id='pin-1']");
    pinBtn?.click();
    if (!wmEvents.some((p) => p.id === "pin-1" && p.linkedMapId === "map-sandpoint")) {
      throw new Error("Worldmap pinSelect event did not fire");
    }
    wmManager.destroy();
    root.replaceChildren();
  });
  await page.evaluate(async () => {
    const root = document.getElementById("root");
    root.replaceChildren();
    await kitRegistry.api.load("easel.dice.dicebox@1");
    await kitRegistry.api.load("easel.narrative.richtext@1");
    const manager = createKitComponents(kitRegistry, root);
    const dicebox = manager.api.create("easel.dice.dicebox@1", {
      props: { rolls: [{ id: "roll-e2e", dice: [{ sides: 20, value: 20, label: "20" }] }], speed: 10 },
    });
    const diceEvents = [];
    dicebox.on("settled", (p) => diceEvents.push(p));
    manager.api.mountRoot(dicebox);
    await new Promise((resolve) => setTimeout(resolve, 150));
    if (!diceEvents.some((e) => e.rollId === "roll-e2e")) throw new Error("Dicebox settled event failed in browser");
    manager.destroy();
    root.replaceChildren();

    const rtManager = createKitComponents(kitRegistry, root);
    const rt = rtManager.api.create("easel.narrative.richtext@1", {
      props: { text: "Roll [[1d20+7]] or [[/r 2d6 # Fire]]" },
    });
    const rtEvents = [];
    rt.on("enricherClick", (p) => rtEvents.push(p));
    rtManager.api.mountRoot(rt);

    const enrichers = root.querySelectorAll(".kit-enricher-roll");
    if (enrichers.length !== 2) throw new Error("Richtext inline roll enrichers not parsed in browser");
    enrichers[0].click();
    if (!rtEvents.some((e) => e.formula === "1d20+7")) throw new Error("Richtext enricherClick failed for [[1d20+7]]");

    rtManager.destroy();
    root.replaceChildren();
  });
  assert.equal(results.length, members.length);
  assert.deepEqual(errors, []);
  assert.deepEqual(await page.evaluate(() => globalThis.cspViolations), []);
  assert.equal(
    await page.evaluate(() => Boolean(document.querySelector("link[data-easel-kits]")?.sheet?.cssRules.length)),
    true,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(async () => {
    const root = document.getElementById("root");
    const manager = createKitComponents(kitRegistry, root);
    await kitRegistry.api.load("easel.cards.hand@1");
    const hand = manager.api.create("easel.cards.hand@1", {
      props: {
        items: Array.from({ length: 15 }, (_, i) => ({
          id: String(i),
          name: "Card " + i,
          image: "/back.webp",
        })),
      },
    });
    manager.api.mountRoot(hand);
    globalThis.mobileKitManager = manager;
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    ),
    false,
    "hand should scroll inside its viewport",
  );
  await page.screenshot({ path: "bin/kit-hand-mobile.png" });
  fs.writeFileSync(
    "bin/kit-browser-results.json",
    JSON.stringify(results, null, 2),
  );
  console.log(
    members.length +
      " lazy browser members rendered, emitted valid events, and cleaned up; privacy and mobile checks passed.",
  );
} catch (error) {
  await page
    .screenshot({ path: "bin/kit-browser-failure.png" })
    .catch(() => {});
  console.error(errors);
  throw error;
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
