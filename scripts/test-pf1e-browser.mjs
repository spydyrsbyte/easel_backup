import assert from "node:assert/strict";
import { pathToFileURL, fileURLToPath } from "node:url";
const { chromium } = await import(
  pathToFileURL(process.env.EASEL_PLAYWRIGHT_MODULE).href
);
process.chdir(fileURLToPath(new URL("..", import.meta.url)));
const browser = await chromium.launch({
  channel: "msedge",
  headless: true,
  args: ["--enable-webgl", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const errors = [];
const tableState = (target) => target.evaluate(async () => {
  let result;
  const off = Application.events.on("easel.vtt.state", ({ state }) => { result = state; });
  try { await Application.events.emit("easel.vtt.refresh", {}); return result; }
  finally { off(); }
});
const actorState = (target) => target.evaluate(async () => {
  let result;
  const off = Application.events.on("easel.pf1e.state", (state) => { result = state; });
  try { await Application.events.emit("easel.pf1e.refresh", {}); return result; }
  finally { off(); }
});
const tableSend = (target, name, payload) => target.evaluate(({ name, payload }) => Application.events.emit("easel.vtt." + name, payload), { name, payload });
const tableRefusal = (target, name, payload) => target.evaluate(({ name, payload }) => new Promise((resolve, reject) => {
  const off = Application.events.on("easel.vtt.error", (error) => { off(); resolve(error.message); });
  Application.events.emit("easel.vtt." + name, payload).catch(reject);
}), { name, payload });
const page = await (
  await browser.newContext({ viewport: { width: 1440, height: 1000 } })
).newPage();
page.setDefaultTimeout(10000);
page.on("pageerror", (error) => errors.push(error.message));
await page.addInitScript(() => {
  globalThis.cspViolations = [];
  document.addEventListener("securitypolicyviolation", (e) =>
    globalThis.cspViolations.push(e.violatedDirective + " " + e.sourceFile + ":" + e.lineNumber),
  );
});
try {
  await page.goto(process.argv[2]);
  await page.locator("#username").waitFor();
  await page.getByRole("button", { name: "Create an account", exact: true }).click();
  await page.locator("#username").fill("pathfinder-gm");
  await page.locator("#password").fill("browser password");
  await page.locator("#displayName").fill("pathfinder-gm");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await page.waitForFunction(() => Easel.Components.get("lobby")?.props.admin === true);
  await page.evaluate(() =>
    Application.events.emit("lobby.create", {
      name: "Pathfinder night",
      application: "easel.pf1e.game",
      modules: [],
      access: "open",
    }),
  );
  await page.evaluate(() => Application.events.emit("lobby.refresh", {}));
  await page
    .locator(".lobby-game")
    .filter({ hasText: "Pathfinder night" })
    .getByRole("button", { name: "Join", exact: true })
    .click();
  const workspace = page.locator(".kit-easel-layout-vttworkspace");
  await workspace.waitFor();
  await page.locator(".kit-vtt-sidebar").waitFor();
  assert.equal(
    await page.evaluate(() => Boolean(document.querySelector("link[data-easel-kits]")?.sheet?.cssRules.length)),
    true,
  );
  assert.equal(await workspace.locator(":scope > .kit-content > h3").count(), 0);
  assert.equal(await workspace.getAttribute("aria-label"), "PF1e VTT Workspace");
  const box = await workspace.boundingBox();
  const screen = page.viewportSize();
  assert.ok(Math.abs(box.x) <= 1, "workspace must reach the left edge");
  assert.ok(Math.abs(box.width - screen.width) <= 1, "workspace must fill the screen width");
  assert.ok(Math.abs(box.y + box.height - screen.height) <= 1, "workspace must reach the bottom edge without overflow");
  assert.ok(box.height >= 500, "workspace height " + box.height);
  assert.ok(box.width >= 1000, "workspace width " + box.width);
  const sidebar = await page.locator(".kit-vtt-sidebar").boundingBox();
  assert.ok(sidebar.height >= 500);
  const surface = await workspace.locator(".kit-slot-canvas .kit-surface").boundingBox();
  assert.ok(Math.abs(surface.y + surface.height - (box.y + box.height)) <= 2, "map bottom " + (surface.y + surface.height) + " workspace bottom " + (box.y + box.height));
  assert.ok(Math.abs(surface.x + surface.width - sidebar.x) <= 2, "map right " + (surface.x + surface.width) + " sidebar left " + sidebar.x);
  assert.equal(await workspace.locator(".kit-slot-canvas h3").isVisible(), false);
  await page.screenshot({ path: "bin/pf1e.png" });
  await page.getByRole("tab", { name: "Actors", exact: true }).click();
  await page.getByRole("button", { name: "+ New Character", exact: true }).click();
  await page.locator(".kit-directory-entry").filter({ hasText: "New Adventurer" }).waitFor();
  assert.equal(await page.locator(".kit-directory-entry").count(), 1);
  await page.locator(".kit-directory-entry").filter({ hasText: "New Adventurer" }).click();
  const sheet = page.locator(".kit-easel-pf1e-charactersheet");
  await sheet.waitFor();
  await sheet.getByLabel("Character name", { exact: true }).fill("Persistent Hero");
  await sheet.getByLabel("Character name", { exact: true }).press("Tab");
  await page.locator(".kit-directory-entry").filter({ hasText: "Persistent Hero" }).waitFor();
  await sheet.getByRole("tab", { name: "Attributes", exact: true }).click();
  assert.equal(await sheet.locator(".pf1e-sheet-panel:visible").count(), 1);
  await sheet.getByLabel("STR base score", { exact: true }).fill("18");
  await sheet.getByLabel("STR base score", { exact: true }).press("Tab");
  await page.waitForFunction(() => document.querySelector('.kit-ability-row[data-ability="str"] .kit-mod')?.textContent === "Mod: +4");
  await sheet.getByLabel("Maximum HP", { exact: true }).fill("30");
  await sheet.getByLabel("Maximum HP", { exact: true }).press("Tab");
  await page.waitForTimeout(250);
  await sheet.getByLabel("Hit points", { exact: true }).fill("24");
  await sheet.getByLabel("Hit points", { exact: true }).press("Tab");
  await page.waitForTimeout(250);
  await page.screenshot({ path: "bin/pf1e-sheet.png" });
  await page.reload();
  await workspace.waitFor();
  await page.getByRole("tab", { name: "Actors", exact: true }).click();
  await page.locator(".kit-directory-entry").filter({ hasText: "Persistent Hero" }).click();
  await sheet.getByRole("tab", { name: "Attributes", exact: true }).click();
  assert.equal(await sheet.getByLabel("STR base score", { exact: true }).inputValue(), "18");
  assert.equal(await sheet.getByLabel("Hit points", { exact: true }).inputValue(), "24");
  assert.equal(await sheet.getByLabel("Maximum HP", { exact: true }).inputValue(), "30");
  await sheet.getByRole("tab", { name: "Summary", exact: true }).click();
  await sheet.getByRole("button", { name: "- Damage", exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.kit-easel-d20-vitality')?.textContent.includes('HP: 19 / 30'));
  await sheet.getByRole("button", { name: "+ Heal", exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.kit-easel-d20-vitality')?.textContent.includes('HP: 24 / 30'));
  await sheet.getByRole("tab", { name: "Inventory", exact: true }).click();
  await sheet.getByRole("button", { name: "Add Equipment", exact: true }).click();
  const editor = page.locator(".kit-easel-pf1e-recordeditor");
  await editor.getByLabel("Name:", { exact: true }).fill("Rope, hempen");
  await editor.getByRole("button", { name: "Save", exact: true }).click();
  await editor.waitFor({ state: "detached" });
  await sheet.getByText("Rope, hempen", { exact: true }).waitFor();
  await sheet.getByRole("tab", { name: "Attributes", exact: true }).click();
  await sheet.locator('.kit-ability-row[data-ability="str"]').getByRole("button", { name: "Roll", exact: true }).click();
  await page.locator(".kit-window-close").click();
  await page.getByRole("tab", { name: "Chat", exact: true }).click();
  await page.locator(".kit-chatlog-message").filter({ hasText: "STR Check" }).waitFor();
  await page.locator(".kit-chatlog-text").fill("/r 2d6+3");
  await page.locator(".kit-chatlog-send").click();
  await page.locator(".kit-chatlog-message").filter({ hasText: "Roll: 2d6+3" }).waitFor();
  await page.locator(".kit-chatlog-text").fill("Hello from the saved game");
  await page.locator(".kit-chatlog-send").click();
  await page.locator(".kit-chatlog-message").filter({ hasText: "Hello from the saved game" }).waitFor();
  const secondContext = await browser.newContext();
  const second = await secondContext.newPage();
  second.on("pageerror", (error) => errors.push(error.message));
  second.setDefaultTimeout(10000);
  await second.goto(process.argv[2]);
  await second.getByRole("button", { name: "Create an account", exact: true }).click();
  await second.locator("#username").fill("pathfinder-player");
  await second.locator("#password").fill("browser password");
  await second.locator("#displayName").fill("Player Two");
  await second.getByRole("button", { name: "Create account", exact: true }).click();
  await second.locator(".lobby-game").filter({ hasText: "Pathfinder night" }).getByRole("button", { name: "Join", exact: true }).click();
  await second.locator(".kit-easel-layout-vttworkspace").waitFor();
  await second.locator(".kit-chatlog-message").filter({ hasText: "Hello from the saved game" }).waitFor();
  const projection = await second.evaluate(() => new Promise((resolve) => {
    Application.events.on("easel.pf1e.state", resolve);
    Application.events.emit("easel.pf1e.refresh", {});
  }));
  assert.equal(projection.entries.length, 0);
  const protectedActorId = (await actorState(page)).entries[0].id;
  const denied = await second.evaluate((actorId) => new Promise((resolve) => {
    Application.events.on("easel.pf1e.error", resolve);
    Application.events.emit("easel.pf1e.updateActor", { actorId, changes: { name: "Stolen Hero" } });
  }), protectedActorId);
  assert.ok(denied.message);
  await second.locator(".kit-chatlog-text").fill("Second player is connected");
  await second.locator(".kit-chatlog-send").click();
  await page.locator(".kit-chatlog-message").filter({ hasText: "Second player is connected" }).waitFor();
  await page.getByRole("tab", { name: "Scenes", exact: true }).click();
  await page.getByRole("button", { name: "+ New Scene", exact: true }).click();
  await page.locator(".kit-directory-entry").filter({ hasText: "New Scene" }).click();
  const sceneSettings = page.locator('.kit-easel-layout-window').filter({ hasText: "Scene Settings" });
  await sceneSettings.getByLabel("Scene name", { exact: true }).fill("Saved Dungeon");
  await sceneSettings.getByLabel("Map width", { exact: true }).fill("1000");
  await sceneSettings.getByLabel("Map height", { exact: true }).fill("700");
  await sceneSettings.getByLabel("Grid size", { exact: true }).fill("64");
  await sceneSettings.getByLabel("Fog of war", { exact: true }).uncheck();
  await sceneSettings.getByRole("button", { name: "Save", exact: true }).click();
  await page.locator(".kit-directory-entry").filter({ hasText: "Saved Dungeon" }).waitFor();
  let state = await tableState(page);
  const sceneId = state.activeScene.id;
  const groundId = state.activeScene.map.layers[0].id;
  const heroId = (await actorState(page)).entries[0].id;
  await page.locator(".kit-slot-canvas .kit-surface").evaluate((element, heroId) => {
    const transfer = new DataTransfer();
    transfer.setData("application/x-easel-kit", JSON.stringify({ id: heroId, type: "character" }));
    const rect = element.getBoundingClientRect();
    element.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer: transfer, clientX: rect.left + 150, clientY: rect.top + 150 }));
  }, heroId);
  await page.locator('.kit-piece').filter({ hasText: "Persistent Hero" }).waitFor();
  await second.getByRole("tab", { name: "Actors", exact: true }).click();
  await second.getByRole("button", { name: "+ New Character", exact: true }).click();
  await second.locator(".kit-directory-entry").filter({ hasText: "New Adventurer" }).waitFor();
  const playerActor = (await actorState(second)).entries.find((entry) => entry.canEdit);
  const playerId = (await actorState(second)).userId;
  await second.locator(".kit-directory-entry").filter({ hasText: "New Adventurer" }).click();
  await second.getByRole("button", { name: "Actor Access and Default Token", exact: true }).click();
  const accessWindow = second.locator('.kit-easel-layout-window').filter({ hasText: "Default token width" });
  await accessWindow.getByLabel("Default token name", { exact: true }).fill("Player Token");
  await accessWindow.getByLabel("Default token width", { exact: true }).fill("80");
  await accessWindow.getByLabel("Default token height", { exact: true }).fill("80");
  await accessWindow.getByRole("button", { name: "Save", exact: true }).click();
  await accessWindow.waitFor({ state: "detached" });
  await second.locator(".kit-window-close").click();
  const prototype = (await tableState(second)).actors.find((entry) => entry.id === playerActor.id).defaultToken;
  assert.equal(prototype.name, "Player Token");
  assert.equal(prototype.width, 80);
  await tableSend(page, "tokenCreate", { sceneId, groundId, actorType: "easel.pf1e.Character", actorId: playerActor.id, name: "Player Token", x: 300, y: 300 });
  await tableSend(page, "tokenCreate", { sceneId, groundId, actorType: "", actorId: "", name: "Beyond Wall", x: 700, y: 300 });
  state = await tableState(page);
  const heroToken = state.activeScene.tokens.find((token) => token.actorId === heroId);
  const playerToken = state.activeScene.tokens.find((token) => token.actorId === playerActor.id);
  assert.equal(playerToken.width, 80);
  const map = state.activeScene.map;
  map.layers[0].children.find((layer) => layer.type === "wall").items.push({ id: "test-wall", a: { x: 400, y: 0 }, b: { x: 400, y: 700 } });
  map.visionMask = { private: "must not persist" };
  await tableSend(page, "sceneSaveMap", { sceneId, map });
  assert.match(await tableRefusal(second, "tokenMove", { tokenId: heroToken.id, groundId, x: 200, y: 200 }), /do not control/i);
  assert.match(await tableRefusal(second, "tokenMove", { tokenId: playerToken.id, groundId, x: 600, y: 300 }), /blocked/i);
  await tableSend(second, "tokenMove", { tokenId: playerToken.id, groundId, x: 300, y: 400 });
  assert.equal((await tableState(page)).activeScene.tokens.find((token) => token.id === playerToken.id).y, 400);
  map.fogEnabled = true;
  await tableSend(page, "sceneSaveMap", { sceneId, map });
  const playerView = await tableState(second);
  assert.equal(playerView.activeScene.tokens.some((token) => token.name === "Beyond Wall"), false);
  assert.ok(playerView.activeScene.tokens.some((token) => token.id === playerToken.id));
  const heroOwnerIds = (await tableState(page)).actors.find((entry) => entry.id === heroId).ownerUserIds;
  await tableSend(page, "actorPermissions", { actorId: heroId, ownerUserIds: heroOwnerIds, viewerUserIds: [playerId], controllerUserIds: [] });
  let sharedActor = (await tableState(second)).actors.find((entry) => entry.id === heroId);
  assert.equal(sharedActor.canWrite, false);
  assert.equal(sharedActor.canControl, false);
  assert.equal(sharedActor.ownerUserIds, undefined);
  await second.getByRole("tab", { name: "Actors", exact: true }).click();
  await second.locator(".kit-directory-entry").filter({ hasText: "Persistent Hero" }).click();
  const sharedSheet = second.locator(".kit-easel-pf1e-charactersheet");
  await sharedSheet.getByRole("tab", { name: "Attributes", exact: true }).click();
  assert.equal(await sharedSheet.getByLabel("Maximum HP", { exact: true }).isDisabled(), true);
  assert.equal(await sharedSheet.locator('.kit-ability-row[data-ability="str"]').getByRole("button", { name: "Roll", exact: true }).isDisabled(), true);
  assert.match(await tableRefusal(second, "tokenMove", { tokenId: heroToken.id, groundId, x: 200, y: 200 }), /do not control/i);
  await tableSend(page, "actorPermissions", { actorId: heroId, ownerUserIds: heroOwnerIds, viewerUserIds: [], controllerUserIds: [playerId] });
  sharedActor = (await tableState(second)).actors.find((entry) => entry.id === heroId);
  assert.equal(sharedActor.canWrite, false);
  assert.equal(sharedActor.canControl, true);
  await actorState(second);
  await second.waitForFunction(() => document.querySelector('.kit-ability-row[data-ability="str"] .kit-roll-ability')?.disabled === false);
  assert.equal(await sharedSheet.getByLabel("Maximum HP", { exact: true }).isDisabled(), true);
  assert.equal((await actorState(second)).entries.find((entry) => entry.id === heroId).actor.ownerUserIds, undefined);
  await second.locator(".kit-window-close").click();
  const controllerEdit = await second.evaluate((actorId) => new Promise((resolve) => {
    const off = Application.events.on("easel.pf1e.error", ({ message }) => { off(); resolve(message); });
    Application.events.emit("easel.pf1e.updateActor", { actorId, changes: { name: "Unauthorized Edit" } });
  }), heroId);
  assert.match(controllerEdit, /owner/i);
  await tableSend(second, "tokenMove", { tokenId: heroToken.id, groundId, x: 180, y: 180 });
  assert.equal((await tableState(page)).activeScene.tokens.find((token) => token.id === heroToken.id).x, 180);
  await second.evaluate((actorId) => Application.events.emit("easel.pf1e.rollAbility", { actorId, ability: "str", score: 10, modifier: 999, rollMode: "self" }), heroId);
  const privateCheck = (await tableState(second)).messages.find((message) => message.speaker.actorId === heroId && message.rollMode === "self");
  assert.ok(privateCheck);
  assert.equal(privateCheck.card.content.total - privateCheck.card.content.naturalRoll, 4);
  assert.equal((await tableState(page)).messages.some((message) => message.id === privateCheck.id), false);
  await page.locator(`.kit-piece[data-token-id="${heroToken.id}"]`).click();
  await page.getByRole("tab", { name: "Combat", exact: true }).click();
  await page.getByRole("button", { name: "Create Encounter", exact: true }).click();
  await page.getByRole("button", { name: "Add Selected Token", exact: true }).click();
  const tracker = page.locator(".kit-easel-combat-encounter");
  await tracker.getByRole("option").filter({ hasText: "Persistent Hero" }).click();
  await tracker.getByRole("button", { name: "Roll Initiative", exact: true }).click();
  assert.equal((await tableState(page)).combat.combatants[0].hasInitiative, true);
  const combatant = (await tableState(page)).combat.combatants[0];
  await tableSend(second, "combatantRollInitiative", { combatantId: combatant.id });
  assert.ok((await tableState(second)).messages.some((message) => message.userId === playerId && message.speaker.tokenId === heroToken.id));
  await tracker.getByRole("button", { name: "Begin Combat", exact: true }).click();
  assert.equal((await tableState(page)).combat.round, 1);
  await tracker.getByRole("button", { name: "Next Turn", exact: true }).click();
  assert.equal((await tableState(page)).combat.round, 2);
  await page.evaluate(({ actorId }) => Application.events.emit("easel.pf1e.saveRecord", { recordType: "Action", record: { actorId, name: "Integration Strike", attackBonusFormula: "0", damageParts: [{ formula: "1d6", type: "bludgeoning" }] } }), { actorId: heroId });
  const action = (await actorState(page)).entries.find((entry) => entry.id === heroId).actions.find((entry) => entry.name === "Integration Strike");
  const hpBefore = (await actorState(page)).entries.find((entry) => entry.id === playerActor.id).actor.health.hp;
  await page.evaluate(({ actorId, actionId }) => Application.events.emit("easel.pf1e.useAction", { actorId, actionId, mode: "fast", take: 10, bonus: 0, conditionalModifiers: [], actionData: {}, rollMode: "public" }), { actorId: heroId, actionId: action.id });
  const attackMessage = (await tableState(page)).messages.find((message) => message.card?.content?.title === "Integration Strike");
  assert.ok(attackMessage.card.attackData.totalDamage > 0);
  await page.locator(`.kit-piece[data-token-id="${playerToken.id}"]`).click();
  await page.getByRole("tab", { name: "Chat", exact: true }).click();
  await page.locator('.kit-chatlog-message').filter({ hasText: "Integration Strike" }).getByRole("button", { name: /^Apply Damage/ }).first().click();
  assert.equal((await actorState(page)).entries.find((entry) => entry.id === playerActor.id).actor.health.hp, hpBefore - attackMessage.card.attackData.totalDamage);
  await page.getByRole("tab", { name: "Journals", exact: true }).click();
  await page.getByRole("button", { name: "+ New Journal", exact: true }).click();
  const journalWindow = page.locator('.kit-easel-layout-window').filter({ hasText: "Journal name" });
  await journalWindow.getByLabel("Journal name", { exact: true }).fill("GM Secret");
  await journalWindow.getByRole("button", { name: "Save", exact: true }).click();
  await page.locator(".kit-directory-entry").filter({ hasText: "GM Secret" }).waitFor();
  assert.equal((await tableState(second)).journals.length, 0);
  await second.getByRole("tab", { name: "Dice", exact: true }).click();
  await second.locator('.kit-dicesettings-form select').first().selectOption("metallic");
  assert.equal((await tableState(second)).diceSettings.theme, "metallic");
  assert.notEqual((await tableState(page)).diceSettings.theme, "metallic");
  for (const [rollMode, text] of [["gm", "GM message"], ["blind", "/r 1d20+7"], ["self", "Private self message"]]) {
    await tableSend(second, "chatSend", { text, rollMode, whisperUserIds: [] });
  }
  const gmMessages = (await tableState(page)).messages;
  const playerMessages = (await tableState(second)).messages;
  assert.ok(gmMessages.some((message) => message.text === "GM message"));
  assert.equal(gmMessages.some((message) => message.text === "Private self message"), false);
  assert.ok(playerMessages.some((message) => message.text === "Private self message"));
  const blind = playerMessages.find((message) => message.rollMode === "blind");
  assert.equal(blind.concealed, true);
  assert.deepEqual(blind.card, {});
  await second.reload();
  await second.locator(".kit-easel-layout-vttworkspace").waitFor();
  assert.equal((await tableState(second)).diceSettings.theme, "metallic");
  await page.reload();
  await workspace.waitFor();
  state = await tableState(page);
  assert.equal(state.activeScene.name, "Saved Dungeon");
  assert.equal(state.activeScene.tokens.length, 3);
  assert.equal(state.combat.round, 2);
  assert.equal(state.journals[0].name, "GM Secret");
  assert.equal(state.actors.find((entry) => entry.id === playerActor.id).defaultToken.x, 0);
  const restarted = await page.request.post(new URL("/_test/restart-pathfinder", process.argv[2]).href);
  assert.equal(restarted.status(), 204);
  await page.reload();
  await workspace.waitFor();
  state = await tableState(page);
  assert.equal(state.activeScene.id, sceneId);
  assert.equal(state.activeScene.tokens.find((token) => token.id === playerToken.id).y, 400);
  assert.equal(state.combat.round, 2);
  assert.equal(state.actors.find((entry) => entry.id === playerActor.id).defaultToken.width, 80);
  assert.ok(state.messages.some((message) => message.text === "Hello from the saved game"));
  await page.getByRole("tab", { name: "Chat", exact: true }).click();
  await secondContext.close();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(150);
  const mobile = await workspace.boundingBox();
  assert.ok(Math.abs(mobile.x) <= 1 && Math.abs(mobile.width - 390) <= 1, "mobile workspace must fill screen width");
  assert.ok(Math.abs(mobile.y + mobile.height - 844) <= 1, "mobile workspace must fit below the header");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: "bin/pf1e-fullscreen-mobile.png" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.waitForTimeout(150);
  await page.screenshot({ path: "bin/pf1e-fullscreen.png" });
  await page.reload();
  await page.locator(".kit-chatlog-message").filter({ hasText: "Hello from the saved game" }).waitFor();
  assert.deepEqual(await page.evaluate(() => globalThis.cspViolations), []);
  assert.deepEqual(errors, []);
  console.log("Pathfinder integrates VTT scenes, default tokens, dynamic actor roles, wall blocking, fog, combat, targeted damage, journals, private rolls and per-user dice settings, and reloads saved state after a game runtime restart.");
} catch (error) {
  console.error(await page.locator(".kit-vtt-hud").innerText().catch(() => "No status available"));
  console.error(errors);
  await page.screenshot({ path: "bin/pf1e-failure.png" }).catch(() => {});
  throw error;
} finally {
  await browser.close();
}
