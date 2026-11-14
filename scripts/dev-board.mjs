import { pathToFileURL, fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const base = process.argv[2] || "http://127.0.0.1:5199";
const { chromium } = await import(pathToFileURL(process.env.EASEL_PLAYWRIGHT_MODULE || resolve(root, "node_modules/playwright/index.mjs")).href);
const browser = await chromium.launch({ channel: "msedge", headless: true });
const errors = [];
const password = "development password";

async function enter(name, viewport = { width: 1440, height: 900 }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on("pageerror", (error) => errors.push(name + " pageerror: " + error.message));
  page.on("websocket", (socket) => socket.on("framereceived", (frame) => process.env.EASEL_DEBUG && !String(frame.payload).includes("lobby.state") && console.log(name + " << " + String(frame.payload).slice(0, 400))));
  page.on("response", (response) => {
    if (response.status() >= 400 && !response.url().endsWith("/api/me")) errors.push(name + " " + response.status() + ": " + response.url());
  });
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

async function join(page, game) {
  await page.evaluate(() => Application.events.emit("lobby.refresh", {}));
  await page.waitForFunction((name) => Easel.Components.get("lobby")?.props.games.some((entry) => entry.name === name && entry.running), game);
  const id = await page.evaluate((name) => Easel.Components.get("lobby").props.games.find((entry) => entry.name === name).id, game);
  if (process.env.EASEL_DEBUG) await page.evaluate(() => new MutationObserver(() => console.log("STATUS " + document.querySelector(".connection-status")?.textContent)).observe(document.querySelector(".connection-status"), { childList: true, subtree: true, characterData: true }));
  page.on("console", (message) => process.env.EASEL_DEBUG && message.text().startsWith("STATUS") && console.log(message.text()));
  const joined = await page.evaluate((id) => Application.events.emit("lobby.join", { game: id }).then(() => "ok", (error) => "join error: " + error.message), id);
  if (joined !== "ok") errors.push(joined);
  page.on("console", (message) => process.env.EASEL_DEBUG && console.log("[" + message.type() + "] " + message.text()));
  if (process.env.EASEL_DEBUG) {
    await page.waitForTimeout(4000);
    console.log(await page.evaluate(() => JSON.stringify({ roots: [...document.querySelectorAll("[data-easel-id]")].map((node) => node.dataset.easelId + ":" + (node.dataset.kit || node.className)).slice(0, 12), error: Easel.Components.get("lobby")?.props.error, status: Easel.Components.get("status")?.props.text, session: Object.fromEntries(Object.entries(sessionStorage)) })));
  }
  await page.locator(".ez-gameboard .ez-gb-piece").first().waitFor();
}

const match = (page) =>
  page.evaluate(async () => {
    let result;
    const off = Application.events.on("easel.board.state", (state) => (result = state.match));
    try {
      await Application.events.emit("easel.board.refresh", {});
      return result;
    } finally {
      off();
    }
  });
const check = (condition, message) => {
  if (!condition) throw new Error("check failed: " + message);
  console.log("ok  " + message);
};
const square = (page, index) => page.locator('.ez-gb-square[data-index="' + index + '"]');
const click = async (page, from, to) => {
  await square(page, from).click();
  await square(page, to).click();
};
const dragMove = async (page, from, to) => {
  const a = await square(page, from).boundingBox();
  const b = await square(page, to).boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 6 });
  await page.mouse.up();
};
const revision = (page, wanted) => page.waitForFunction(async (wanted) => (await new Promise((done) => {
  const off = Application.events.on("easel.board.state", (state) => {
    off();
    done(state.match.revision);
  });
  Application.events.emit("easel.board.refresh", {});
})) >= wanted, wanted);

try {
  const white = await enter("dev");
  const black = await enter("player-one");
  const stamp = Date.now();
  const chess = "Chess " + stamp;
  await white.evaluate((name) => Application.events.emit("lobby.create", { name, application: "easel.chess.game", modules: [], access: "open" }), chess);
  await join(white, chess);
  await join(black, chess);
  await white.screenshot({ path: resolve(root, "bin/dev/board-a-open.png") });
  await white.getByRole("button", { name: "Play white", exact: true }).click();
  await black.getByRole("button", { name: "Play black", exact: true }).click();
  await revision(white, 2);
  await white.waitForTimeout(400);
  await square(white, 52).click();
  await white.waitForTimeout(250);
  check((await white.locator('.ez-gb-square[data-target="move"]').count()) === 2, "selecting a pawn shows its two legal squares");
  await white.screenshot({ path: resolve(root, "bin/dev/board-b-select.png") });
  await square(white, 36).click();
  await revision(black, 3);
  await dragMove(black, 11, 27);
  await revision(white, 4);
  await click(white, 36, 27);
  await revision(black, 5);
  await click(black, 3, 27);
  await revision(white, 6);
  await click(white, 57, 42);
  await revision(black, 7);
  let state = await match(white);
  check(state.captured.length === 2 && state.history.length === 5, "captures and five moves are recorded");
  check(state.clock.white > 0 || state.clock.black > 0, "the clocks have been running: " + JSON.stringify(state.clock));
  await black.locator(".ez-sidebar-tab[aria-label='Chat']").click();
  await black.locator(".ez-chat-box textarea").fill("Good luck!");
  await black.locator(".ez-chat-box textarea").press("Enter");
  await white.waitForTimeout(700);
  check((await white.locator(".ez-sidebar-badge").textContent()) === "1", "an unread chat message shows a badge");
  await white.screenshot({ path: resolve(root, "bin/dev/board-c-chess.png") });
  await black.screenshot({ path: resolve(root, "bin/dev/board-d-black.png") });
  await black.getByRole("button", { name: "Offer draw", exact: true }).click();
  await white.getByRole("button", { name: "Decline", exact: true }).click();
  await black.getByRole("button", { name: "Resign", exact: true }).click();
  await black.getByRole("button", { name: "Confirm resign", exact: true }).click();
  await white.locator(".ez-result-card").waitFor();
  state = await match(white);
  check(state.winner === "white" && state.result === "resignation", "resigning gives the game to the opponent");
  await white.waitForTimeout(400);
  await white.screenshot({ path: resolve(root, "bin/dev/board-e-result.png") });
  await white.locator(".ez-result-card").getByRole("button", { name: "Play again", exact: true }).click();
  await revision(white, state.revision + 1);
  state = await match(white);
  check(state.history.length === 0 && state.names.black === "dev" && !state.winner, "a rematch resets the board and swaps colours");
  const checkers = "Checkers " + stamp;
  const third = await enter("dev", { width: 1440, height: 900 });
  await third.evaluate((name) => Application.events.emit("lobby.create", { name, application: "easel.checkers.game", modules: [], access: "open" }), checkers);
  await join(third, checkers);
  await black.goto(base);
  await black.locator(".ez-gameboard .ez-gb-piece").first().waitFor();
  await black.getByRole("link", { name: "Easel", exact: true }).click();
  await black.waitForFunction(() => Array.isArray(globalThis.Easel?.Components.get("lobby")?.props.games));
  await join(black, checkers);
  await third.getByRole("button", { name: "Play white", exact: true }).click();
  await black.getByRole("button", { name: "Play black", exact: true }).click();
  await revision(third, 2);
  await third.waitForTimeout(300);
  await click(third, 40, 33);
  await revision(black, 3);
  await click(black, 17, 24);
  await revision(third, 4);
  await click(third, 42, 35);
  await revision(black, 5);
  await click(black, 24, 42);
  await revision(third, 6);
  state = await match(third);
  check(state.captured.length === 1 && state.squares[33].side === "", "a checkers jump captures the piece");
  await third.waitForTimeout(500);
  await third.screenshot({ path: resolve(root, "bin/dev/board-f-checkers.png") });
  await third.setViewportSize({ width: 390, height: 844 });
  await third.waitForTimeout(500);
  check(!(await third.evaluate(() => document.documentElement.scrollWidth > innerWidth)), "the phone layout does not scroll sideways");
  await third.screenshot({ path: resolve(root, "bin/dev/board-g-phone.png") });
  if (errors.length) throw new Error("browser errors");
  console.log("Board check passed.");
} catch (error) {
  errors.push(error.message);
  process.exitCode = 1;
  let index = 0;
  for (const context of browser.contexts()) for (const page of context.pages()) {
    await page.screenshot({ path: resolve(root, "bin/dev/board-failure-" + index++ + ".png") }).catch(() => {});
    console.log(await page.evaluate(() => [...document.querySelectorAll("[role=alert], .ez-toast")].map((node) => node.textContent).filter(Boolean).join(" | ")).catch(() => ""));
  }
} finally {
  await browser.close();
}
for (const error of errors) console.log(error);
