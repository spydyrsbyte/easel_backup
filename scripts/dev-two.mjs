import { pathToFileURL, fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const base = process.argv[2] || "http://127.0.0.1:5199";
const game = process.argv[3] || "Two players " + Date.now();
const { chromium } = await import(pathToFileURL(process.env.EASEL_PLAYWRIGHT_MODULE || resolve(root, "node_modules/playwright/index.mjs")).href);
const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--enable-webgl", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const errors = [];
const password = "development password";

async function enter(name) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on("pageerror", (error) => errors.push(name + " pageerror: " + error.message));
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
  await page.evaluate(() => {
    const node = [...document.querySelectorAll("[data-easel-id]")].find((entry) => entry.dataset.kit === "easel.maps.map");
    globalThis.mapHandle = Easel.Components.get(node.dataset.easelId);
  });
}

const tableState = (page) =>
  page.evaluate(async () => {
    let result;
    const off = Application.events.on("easel.vtt.state", ({ state }) => (result = state));
    try {
      await Application.events.emit("easel.vtt.refresh", {});
      return result;
    } finally {
      off();
    }
  });
const check = (condition, message) => {
  if (!condition) throw new Error("check failed: " + message);
  console.log("ok  " + message);
};

try {
  const gm = await enter("dev");
  await gm.evaluate((name) => Application.events.emit("lobby.create", { name, application: "easel.tabletop.game", modules: [], access: "open" }), game);
  await join(gm);
  const player = await enter("player-one");
  await join(player);
  await gm.waitForTimeout(800);
  let gmState = await tableState(gm);
  let playerState = await tableState(player);
  check(gmState.isGM && !playerState.isGM, "the creator is the game master and the second account is a player");
  check(gmState.activeScene.tokens.length === 7, "the game master sees every token, hidden ones included");
  check(playerState.activeScene.tokens.length === 0, "a player who controls no token sees no tokens through the fog");
  check(!JSON.stringify(playerState).includes("The Collector"), "the hidden token's name never reaches the player");
  const playerId = playerState.userId;
  const mira = gmState.actors.find((actor) => actor.name === "Mira");
  await gm.evaluate(({ actorId, playerId }) => Application.events.emit("easel.tabletop.actorUpdate", { actorId, changes: { ownerUserIds: [playerId] } }), { actorId: mira.id, playerId });
  await player.waitForTimeout(900);
  playerState = await tableState(player);
  const names = playerState.activeScene.tokens.map((token) => token.name).sort();
  check(names.includes("Mira") && names.includes("Aldric") && names.includes("Pip") && names.includes("Innkeeper Bram"), "after being given Mira, the player sees the tokens in her room: " + names.join(", "));
  check(!names.includes("Cellar Rat"), "tokens behind closed doors stay hidden from the player");
  const token = playerState.activeScene.tokens.find((entry) => entry.name === "Mira");
  check(token.canControl === true, "the player controls Mira's token");
  await player.waitForTimeout(1200);
  await player.screenshot({ path: resolve(root, "bin/dev/two-player.png") });
  const refusal = await player.evaluate(
    ({ tokenId, groundId }) =>
      new Promise((done) => {
        const off = Application.events.on("easel.vtt.error", ({ message }) => {
          off();
          done(message);
        });
        Application.events.emit("easel.vtt.tokenMove", { tokenId, groundId, x: 1250, y: 350 }).catch((error) => done(error.message));
        setTimeout(() => done("moved"), 1500);
      }),
    { tokenId: token.id, groundId: token.groundId },
  );
  check(/blocked/i.test(refusal), "the server refuses a move through a wall: " + refusal);
  const aldric = playerState.activeScene.tokens.find((entry) => entry.name === "Aldric");
  const denied = await player.evaluate(
    ({ tokenId, groundId }) =>
      new Promise((done) => {
        const off = Application.events.on("easel.vtt.error", ({ message }) => {
          off();
          done(message);
        });
        Application.events.emit("easel.vtt.tokenMove", { tokenId, groundId, x: 450, y: 450 }).catch((error) => done(error.message));
        setTimeout(() => done("moved"), 1500);
      }),
    { tokenId: aldric.id, groundId: aldric.groundId },
  );
  check(/control/i.test(denied), "the server refuses moving someone else's token: " + denied);
  await player.evaluate(({ sceneId }) => Application.events.emit("easel.vtt.doorToggle", { sceneId, wallId: "door-kitchen", open: true }), { sceneId: playerState.activeScene.id });
  await player.evaluate(({ tokenId, groundId }) => Application.events.emit("easel.vtt.tokenMove", { tokenId, groundId, x: 950, y: 350 }), { tokenId: token.id, groundId: token.groundId });
  await player.waitForTimeout(1500);
  playerState = await tableState(player);
  check(playerState.activeScene.tokens.find((entry) => entry.name === "Mira").x === 950, "the player moves her own token");
  const locked = await player.evaluate(
    ({ sceneId }) =>
      new Promise((done) => {
        const off = Application.events.on("easel.vtt.error", ({ message }) => {
          off();
          done(message);
        });
        Application.events.emit("easel.vtt.doorToggle", { sceneId, wallId: "door-vault", open: true }).catch((error) => done(error.message));
        setTimeout(() => done("opened"), 1500);
      }),
    { sceneId: playerState.activeScene.id },
  );
  check(/locked/i.test(locked), "a locked door stays shut for a player: " + locked);
  await player.locator(".ez-chat-box textarea").fill("/r d20+3 # Notice");
  await player.locator(".ez-chat-box textarea").press("Enter");
  await gm.waitForTimeout(900);
  gmState = await tableState(gm);
  check(gmState.messages.some((message) => message.card?.content?.title === "Notice"), "a player's roll reaches the game master");
  await gm.locator(".ez-sidebar-tab[aria-label='Chat']").click().catch(() => {});
  await player.screenshot({ path: resolve(root, "bin/dev/two-player-kitchen.png") });
  await gm.screenshot({ path: resolve(root, "bin/dev/two-gm.png") });
  const upload = await player.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 32;
    canvas.getContext("2d").fillRect(0, 0, 32, 32);
    const blob = await new Promise((done) => canvas.toBlob(done, "image/png"));
    try {
      const file = await Application.files.upload(new File([blob], "portrait.png", { type: "image/png" }));
      const fetched = await fetch(file.url);
      return file.mediaType + " " + fetched.status;
    } catch (error) {
      return "failed: " + error.message;
    }
  });
  check(upload === "image/png 200", "a player uploads an image and reads it back: " + upload);
  const text = await player.evaluate(async () => {
    try {
      await Application.files.upload(new File(["hello"], "notes.txt", { type: "text/plain" }));
      return "accepted";
    } catch (error) {
      return error.message;
    }
  });
  check(/images only/i.test(text), "a player cannot upload other file types: " + text);
  console.log("Two-player check passed.");
} catch (error) {
  errors.push(error.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
for (const error of errors) console.log(error);
