import { pathToFileURL, fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const base = process.argv[2] || "http://127.0.0.1:5199";
const game = "Pathfinder " + Date.now();
const modules = process.argv[3] ? process.argv[3].split(",") : [];
const { chromium } = await import(pathToFileURL(process.env.EASEL_PLAYWRIGHT_MODULE || resolve(root, "node_modules/playwright/index.mjs")).href);
const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--enable-webgl", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const errors = [];
const password = "development password";
const hitPoints = modules.includes("easel.pf1ehomebrew.example") ? 27 : 23;
const shot = (page, name) => page.screenshot({ path: resolve(root, "bin/dev/pf1e-" + name + ".png") });

async function enter(name) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 950 } });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on("pageerror", (error) => errors.push(name + " pageerror: " + error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().startsWith("Failed to load resource:")) errors.push(name + " console: " + message.text());
  });
  await page.goto(base);
  await page.locator("#username").waitFor();
  const sign = async (create) => {
    if (create) await page.getByRole("button", { name: "Create an account", exact: true }).click();
    await page.locator("#username").fill(name);
    await page.locator("#password").fill(password);
    if (create) await page.locator("#displayName").fill(name);
    await page.getByRole("button", { name: create ? "Create account" : "Sign in", exact: true }).click();
  };
  await sign(false);
  const ok = await Promise.race([page.waitForFunction(() => globalThis.Easel?.Components.get("lobby")).then(() => true), page.getByRole("alert").filter({ hasText: /invalid/i }).waitFor().then(() => false)]);
  if (!ok) {
    await sign(true);
    await page.waitForFunction(() => globalThis.Easel?.Components.get("lobby"));
  }
  await page.waitForFunction(() => Array.isArray(Easel.Components.get("lobby")?.props.games));
  return page;
}

async function join(page) {
  await page.evaluate(() => Application.events.emit("lobby.refresh", {}));
  await page.waitForFunction((name) => Easel.Components.get("lobby")?.props.games.some((entry) => entry.name === name && entry.running), game);
  const id = await page.evaluate((name) => Easel.Components.get("lobby").props.games.find((entry) => entry.name === name).id, game);
  await page.evaluate((id) => Application.events.emit("lobby.join", { game: id }), id);
  await page.locator(".ez-map canvas").waitFor();
}

const ask = (page, event, reply, payload = {}) =>
  page.evaluate(
    ({ event, reply, payload }) =>
      new Promise((done, fail) => {
        const off = Application.events.on(reply, (value) => {
          off();
          done(value);
        });
        Application.events.emit(event, payload).catch(fail);
        setTimeout(() => fail(new Error("no " + reply)), 8000);
      }),
    { event, reply, payload },
  );
const tab = (page, label) => page.locator('.ez-sidebar-tab[aria-label="' + label + '"]').first().click();
const sheetTab = (page, label) => page.locator(".pf-sheet .ez-sheet-tab", { hasText: label }).first().click();
const check = (condition, message) => {
  if (!condition) throw new Error("check failed: " + message);
  console.log("ok  " + message);
};
const lastCard = (page) => page.locator(".ez-chat-log .ez-msg").last();

try {
  const gm = await enter("dev");
  await gm.evaluate(({ name, modules }) => Application.events.emit("lobby.create", { name, application: "easel.pf1e.game", modules, access: "open" }), { name: game, modules });
  await join(gm);
  await gm.waitForTimeout(1200);
  await shot(gm, "a-table");

  await tab(gm, "Characters");
  await gm.locator(".ez-entry", { hasText: "Aldric" }).first().dblclick();
  await gm.locator(".pf-sheet .pf-abilities").waitFor();
  check((await gm.locator(".pf-sheet .pf-tile", { hasText: "AC" }).first().locator("strong").textContent()) === "19", "Aldric's sheet opens with AC 19");
  check((await gm.locator(".pf-sheet .pf-hp-value strong").textContent()) === String(hitPoints), "and " + hitPoints + " hit points");
  await gm.waitForTimeout(400);
  await shot(gm, "b-sheet");

  await sheetTab(gm, "Combat");
  await gm.locator(".pf-attack", { hasText: "Longsword" }).getByRole("button", { name: "Attack", exact: true }).click();
  await tab(gm, "Chat");
  await gm.locator(".ez-chat-log .ez-roll-title", { hasText: "Longsword" }).first().waitFor();
  check((await lastCard(gm).locator(".ez-roll-section").count()) >= 1, "an attack roll reaches chat with its sections");
  await gm.locator(".pf-chip-toggle", { hasText: "Power attack" }).first().click();
  await gm.waitForFunction(() => document.querySelector(".pf-attack")?.textContent.includes("+6"));
  check(true, "switching on Power Attack changes the attack line to +6");
  await gm.locator(".pf-chip-toggle", { hasText: "Shaken" }).first().click();
  await gm.waitForFunction(() => document.querySelector(".pf-attack")?.textContent.includes("+4"));
  check(true, "the shaken condition lowers it to +4");
  await gm.waitForTimeout(300);
  await shot(gm, "c-combat");
  await gm.locator(".pf-chip-toggle", { hasText: "Shaken" }).first().click();

  await sheetTab(gm, "Skills");
  await gm.locator(".pf-skill", { hasText: "Climb" }).locator(".pf-skill-total").click();
  await gm.locator(".ez-chat-log .ez-roll-title", { hasText: "Climb" }).first().waitFor();
  check(true, "a skill roll reaches chat");
  await shot(gm, "d-skills");
  await sheetTab(gm, "Gear");
  await gm.locator(".pf-item", { hasText: "Longsword" }).locator(".pf-link").click();
  await gm.locator(".pf-item-edit").waitFor();
  await shot(gm, "e-gear");
  await sheetTab(gm, "Features");
  await shot(gm, "f-features");
  await sheetTab(gm, "Effects");
  await shot(gm, "g-effects");

  const selected = await gm.evaluate(() => {
    const node = [...document.querySelectorAll("[data-easel-id]")].find((entry) => entry.dataset.kit === "easel.maps.map");
    const map = Easel.Components.get(node.dataset.easelId);
    return map.props.tokens.find((token) => token.name === "Aldric").id;
  });
  const state = await ask(gm, "easel.pf1e.refresh", "easel.pf1e.state");
  const aldric = state.actors.find((actor) => actor.name === "Aldric");
  await gm.evaluate(({ actorId }) => Application.events.emit("easel.pf1e.apply", { targets: [actorId], payload: { amount: 7, type: "S" } }), { actorId: aldric.id });
  await gm.waitForFunction((left) => document.querySelector(".pf-sheet .pf-hp-value strong")?.textContent === left, String(hitPoints - 7));
  check(Boolean(selected), "damage applied from a roll shows on the open sheet");

  await gm.locator('.ez-window [aria-label="Close"]').first().click().catch(() => {});
  await tab(gm, "Characters");
  await gm.locator(".ez-entry", { hasText: "Mira" }).first().dblclick();
  await gm.locator(".pf-sheet .pf-abilities").waitFor();
  await gm.waitForFunction(() => [...document.querySelectorAll(".pf-sheet .ez-sheet-tab")].some((node) => node.textContent === "Spells"));
  await gm.locator(".pf-sheet").last().locator(".ez-sheet-tab", { hasText: "Spells" }).click();
  await gm.locator(".pf-prepared-spell", { hasText: "Magic Missile" }).first().locator('[aria-label="Cast Magic Missile"]').click();
  await tab(gm, "Chat");
  await gm.locator(".ez-chat-log .ez-roll-title", { hasText: "Magic Missile" }).first().waitFor();
  check((await lastCard(gm).locator(".ez-roll-actions button").count()) >= 1, "casting a prepared spell posts its damage with an apply button");
  await gm.waitForFunction(() => document.querySelectorAll('.pf-prepared-spell[data-cast="true"]').length === 1);
  check(true, "and crosses the spell off");
  await gm.waitForTimeout(300);
  await shot(gm, "h-spells");

  await tab(gm, "Library");
  await gm.locator(".ez-entry", { hasText: "Goblin" }).first().waitFor();
  check((await gm.locator(".ez-entry", { hasText: "Young Red Dragon" }).count()) === 1, "the library lists monsters");
  await gm.locator(".ez-entry", { hasText: "Young Red Dragon" }).first().dblclick();
  await gm.locator(".pf-statblock").waitFor();
  await gm.waitForTimeout(300);
  await shot(gm, "i-library");
  const before = await gm.evaluate(() => Easel.Components.get([...document.querySelectorAll("[data-easel-id]")].find((entry) => entry.dataset.kit === "easel.maps.map").dataset.easelId).props.tokens.length);
  await gm.locator(".pf-entry-actions").getByRole("button", { name: "Place on this scene", exact: true }).click();
  await gm.waitForFunction((count) => Easel.Components.get([...document.querySelectorAll("[data-easel-id]")].find((entry) => entry.dataset.kit === "easel.maps.map").dataset.easelId).props.tokens.length === count + 1, before);
  check(true, "a monster placed from the library gets a token");
  for (const node of await gm.locator('.ez-window [aria-label="Close"]').all()) await node.click().catch(() => {});

  await tab(gm, "Spells");
  await gm.locator(".ez-entry", { hasText: "Fireball" }).first().waitFor();
  check(true, "the spell library opens");
  await tab(gm, "Items");
  await gm.locator(".ez-entry", { hasText: "Longsword" }).first().waitFor();
  await shot(gm, "j-items");
  await tab(gm, "Monsters");
  await gm.locator(".ez-sidebar-panel:not([hidden]) .ez-sidebar-panel:not([hidden]) .ez-browser-bar").getByRole("button", { name: "Import" }).click();
  await gm.locator(".ez-window textarea").fill("Cave Lurker CR 2\nXP 600\nNE Medium aberration\nInit +2; Senses darkvision 60 ft.; Perception +6\nDEFENSE\nAC 15, touch 12, flat-footed 13 (+2 Dex, +3 natural)\nhp 22 (3d8+9)\nFort +4, Ref +3, Will +4\nOFFENSE\nSpeed 30 ft.\nMelee 2 claws +5 (1d6+3 plus grab)\nSTATISTICS\nStr 16, Dex 15, Con 16, Int 5, Wis 12, Cha 8\nBase Atk +2; CMB +5; CMD 17");
  await gm.locator(".ez-window textarea").blur();
  await gm.locator(".ez-window").getByRole("button", { name: "Add to the library", exact: true }).click();
  await gm.locator(".ez-entry", { hasText: "Cave Lurker" }).first().waitFor();
  check((await gm.locator(".ez-entry", { hasText: "Cave Lurker" }).first().textContent()).includes("Custom"), "an imported stat block joins the library, marked as custom");

  const player = await enter("player-one");
  await join(player);
  const playerId = await player.evaluate(() => new Promise((done) => {
    const off = Application.events.on("easel.vtt.state", ({ state }) => {
      off();
      done(state.userId);
    });
    const request = () => {
      try {
        Application.events.emit("easel.vtt.refresh", {}).catch(() => setTimeout(request, 250));
      } catch {
        setTimeout(request, 250);
      }
    };
    request();
  }));
  const pip = state.actors.find((actor) => actor.name === "Pip");
  await gm.evaluate(({ actorId, playerId }) => Application.events.emit("easel.pf1e.actorUpdate", { actorId, changes: { ownerUserIds: [playerId] } }), { actorId: pip.id, playerId });
  await tab(player, "Characters");
  await player.locator(".ez-entry", { hasText: "Pip" }).first().dblclick();
  await player.locator(".pf-sheet .pf-abilities").waitFor();
  check((await player.locator(".ez-entry:visible").count()) === 1, "a player sees only the character they were given");
  await player.locator(".pf-sheet .ez-sheet-tab", { hasText: "Combat" }).click();
  await player.locator(".pf-chip-toggle", { hasText: "Sneak attack" }).first().click();
  await player.waitForFunction(() => document.querySelector(".pf-attack")?.textContent.includes("1d6 precision"));
  await player.locator(".pf-attack", { hasText: "Rapier" }).getByRole("button", { name: "Attack", exact: true }).click();
  await tab(gm, "Chat");
  await gm.locator(".ez-chat-log .ez-roll-title", { hasText: "Rapier" }).first().waitFor();
  check(true, "the player's attack, with sneak attack dice, reaches the game master");
  await player.locator('.ez-window [aria-label="Close"]').first().click();
  await player.waitForTimeout(900);
  const seen = (await ask(player, "easel.vtt.refresh", "easel.vtt.state")).state.activeScene.tokens;
  console.log("player tokens: " + JSON.stringify(seen.map((token) => [token.name, token.canControl, token.x, token.y, token.width, token.vision])));
  check(seen.some((token) => token.name === "Pip" && token.canControl), "the player controls Pip's token and sees through its eyes");
  await shot(player, "k-player");
  const refused = await player.evaluate(
    ({ actorId }) =>
      new Promise((done) => {
        const off = Application.events.on("easel.pf1e.error", ({ message }) => {
          off();
          done(message);
        });
        Application.events.emit("easel.pf1e.open", { actorId });
        setTimeout(() => done("opened"), 2000);
      }),
    { actorId: aldric.id },
  );
  check(/cannot open/.test(refused), "a player cannot open someone else's sheet: " + refused);
  if (modules.includes("easel.pf1ehomebrew.example")) {
    const info = (await ask(gm, "easel.pf1e.refresh", "easel.pf1e.state")).system;
    check(info.extensions.includes("Example house rules") && Boolean(info.skills.sai), "the example house rules are installed: " + info.extensions.join(", "));
  }
  if (modules.includes("easel.pf1ekineticist.rules")) {
    const emit = (event, payload) => gm.evaluate(({ event, payload }) => Application.events.emit(event, payload), { event, payload });
    await emit("easel.pf1e.actorCreate", { name: "Ember", kind: "character", entryId: "" });
    await gm.waitForTimeout(500);
    const ember = (await ask(gm, "easel.pf1e.refresh", "easel.pf1e.state")).actors.find((actor) => actor.name === "Ember");
    await emit("easel.pf1e.actorUpdate", { actorId: ember.id, changes: { set: { "abilities.con.base": 16, "abilities.dex.base": 14 } } });
    for (let level = 0; level < 3; level++) await emit("easel.pf1e.actorAdd", { actorId: ember.id, entryId: "class:kineticist", options: {} });
    for (const entryId of ["talent:fire-blast", "talent:extended-range", "talent:kinetic-healer"]) await emit("easel.pf1e.actorAdd", { actorId: ember.id, entryId, options: {} });
    for (const node of await gm.locator('.ez-window [aria-label="Close"]').all()) await node.click().catch(() => {});
    await tab(gm, "Characters");
    await gm.locator(".ez-entry:visible", { hasText: "Ember" }).first().dblclick();
    await gm.locator(".pf-sheet .ez-sheet-tab", { hasText: "Kineticist" }).click();
    await gm.locator('.pf-pool[data-resource="burn"]').waitFor();
    check((await gm.locator(".pf-pool-value").textContent()).startsWith("0 / 6"), "an extension adds its own sheet tab with a burn tracker");
    await gm.locator(".pf-feature", { hasText: "Extended Range" }).getByRole("button", { name: "Accept burn", exact: true }).click();
    await gm.waitForFunction(() => document.querySelector(".pf-pool-value")?.textContent.startsWith("1 / 6"));
    check((await gm.locator(".pf-attack", { hasText: "Fire Blast" }).textContent()).includes("+5"), "accepting burn raises the kinetic blast through elemental overflow");
    await gm.locator(".pf-attack", { hasText: "Fire Blast" }).getByRole("button", { name: "Attack", exact: true }).click();
    await tab(gm, "Chat");
    await gm.locator(".ez-chat-log .ez-roll-title", { hasText: "Fire Blast" }).first().waitFor();
    await tab(gm, "Library");
    await tab(gm, "Wild talents");
    await gm.locator(".ez-entry:visible", { hasText: "Kinetic Healer" }).first().waitFor();
    check(true, "the extension's library kind has its own tab");
    await gm.waitForTimeout(300);
    await shot(gm, "l-kineticist");
  }
  if (modules.includes("easel.pathofwar.rules")) {
    const emit = (event, payload) => gm.evaluate(({ event, payload }) => Application.events.emit(event, payload), { event, payload });
    await emit("easel.pf1e.actorCreate", { name: "Kara", kind: "character", entryId: "" });
    await gm.waitForTimeout(500);
    const kara = (await ask(gm, "easel.pf1e.refresh", "easel.pf1e.state")).actors.find((actor) => actor.name === "Kara");
    await emit("easel.pf1e.actorUpdate", { actorId: kara.id, changes: { set: { "abilities.str.base": 16, "abilities.cha.base": 16 } } });
    for (const entryId of ["class:warlord", "class:warlord", "item:longsword"]) await emit("easel.pf1e.actorAdd", { actorId: kara.id, entryId, options: {} });
    await gm.waitForTimeout(700);
    const opened = await ask(gm, "easel.pf1e.open", "easel.pf1e.sheet", { actorId: kara.id });
    await emit("easel.pf1e.actorItem", { actorId: kara.id, uid: opened.sheet.doc.items[0].uid, changes: { equipped: true } });
    for (const entryId of ["maneuver:tactical-strike", "maneuver:encouraging-roar", "maneuver:stance-of-aggression"]) await emit("easel.pf1e.actorAdd", { actorId: kara.id, entryId, options: {} });
    await gm.waitForTimeout(500);
    for (const node of await gm.locator('.ez-window [aria-label="Close"]').all()) await node.click().catch(() => {});
    await tab(gm, "Characters");
    await gm.locator(".ez-entry:visible", { hasText: "Kara" }).first().dblclick();
    await gm.locator(".pf-sheet .ez-sheet-tab", { hasText: "Maneuvers" }).click();
    await gm.locator(".pow").waitFor();
    check((await gm.locator(".pow .pf-tile", { hasText: "Maneuver DC" }).locator("strong").textContent()) === "13", "a module draws its own sheet page in the browser, with a maneuver DC of 13");
    const row = (name) => gm.locator(".pow [data-maneuver]", { hasText: name }).first();
    await row("Tactical Strike").getByRole("button", { name: "Ready", exact: true }).click();
    await row("Tactical Strike").getByRole("button", { name: "Initiate", exact: true }).waitFor();
    await row("Encouraging Roar").getByRole("button", { name: "Ready", exact: true }).click();
    await row("Encouraging Roar").getByRole("button", { name: "Initiate", exact: true }).waitFor();
    await row("Tactical Strike").getByRole("button", { name: "Initiate", exact: true }).click();
    await tab(gm, "Chat");
    await gm.locator(".ez-chat-log .ez-roll-title", { hasText: "Tactical Strike (Longsword)" }).first().waitFor();
    await gm.locator('.pow [data-maneuver][data-expended="true"]', { hasText: "Tactical Strike" }).waitFor();
    check(true, "initiating a strike rolls the weapon attack and expends the maneuver");
    await gm.locator(".pow").getByRole("button", { name: "Stance of Aggression" }).first().click();
    await gm.locator(".pow .pf-tile", { hasText: "Readied" }).waitFor();
    await gm.waitForTimeout(500);
    await shot(gm, "m-pathofwar");
    await row("Tactical Strike").getByRole("button", { name: "Recover", exact: true }).click();
    await row("Tactical Strike").getByRole("button", { name: "Initiate", exact: true }).waitFor();
    check(true, "recovering brings the maneuver back");
    await tab(gm, "Library");
    await tab(gm, "Maneuvers");
    await gm.locator(".ez-entry:visible", { hasText: "Crushing Blow" }).first().waitFor();
    check(true, "the maneuver library has its own tab");
  }
  if (errors.length) throw new Error("browser errors:\n" + errors.join("\n"));
  console.log("Pathfinder check passed.");
} catch (error) {
  console.error(error.message);
  if (errors.length) console.error(errors.join("\n"));
  process.exitCode = 1;
} finally {
  await browser.close();
}
