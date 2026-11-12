import assert from "node:assert/strict";
import { pathToFileURL, fileURLToPath } from "node:url";
const { chromium } = await import(
  pathToFileURL(process.env.EASEL_PLAYWRIGHT_MODULE).href
);
const browser = await chromium.launch({
  channel: "msedge",
  headless: true,
  args: [
    "--enable-webgl",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const errors = [];
const base = process.argv[2];
process.chdir(fileURLToPath(new URL("..", import.meta.url)));
const contexts = [];
const signup = async (username) => {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 1000 },
  });
  contexts.push(context);
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      !message.text().startsWith("Failed to load resource:")
    )
      errors.push(message.text());
  });
  await page.goto(base);
  await page.locator("#username").waitFor();
  await page.screenshot({ path: "bin/signin.png", fullPage: true });
  await page
    .getByRole("button", { name: "Create an account", exact: true })
    .click();
  await page.locator("#username").fill(username);
  await page.locator("#password").fill("browser password");
  await page.locator("#displayName").fill(username);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await page.getByRole("heading", { name: "Easel", exact: true }).waitFor();
  return page;
};
const state = (page) =>
  page.evaluate(
    () =>
      new Promise((done) => {
        const off = Application.events.on("easel.board.state", (value) => {
          off();
          done(value);
        });
        Application.events.emit("easel.board.refresh", {});
      }),
  );
const match = async (page) => (await state(page)).match;
const emit = (page, event, payload) =>
  page.evaluate(
    async ({ event, payload }) => {
      await Application.events.emit(event, payload);
    },
    { event, payload },
  );
const waitRevision = async (page, revision) => {
  for (let attempt = 0; attempt < 100; attempt++) {
    if ((await match(page)).revision === revision) return;
    await page.waitForTimeout(100);
  }
  throw new Error("revision " + revision + " was not reached");
};
const clickSquare = (page, index) =>
  page.locator(`.ez-gb-square[data-index="${index}"]`).click();
const join = async (page, name, game = name) => {
  await emit(page, "lobby.refresh", {});
  await page
    .locator(".lobby-game")
    .filter({ hasText: name })
    .getByRole("button", { name: "Join", exact: true })
    .click();
  await page.locator(".ez-gameboard .ez-gb-piece").first().waitFor({ timeout: 10000 });
  assert.equal(await page.locator(".ez-gameboard .ez-gb-piece").count(), game.includes("heckers") ? 24 : 32);
};
const createTable = async (page, game, name, access = "open") => {
  await page.getByRole("button", { name: "Applications", exact: true }).click();
  const card = page
    .locator(".application-card")
    .filter({
      has: page.getByRole("heading", {
        name: game === "chess" ? "Chess" : "Checkers",
        exact: true,
      }),
    });
  await page.screenshot({ path: "bin/applications.png", fullPage: true });
  await card
    .getByRole("button", { name: "Start a table", exact: true })
    .click();
  await page.locator("#lobby-name").fill(name);
  await page.locator("#lobby-access").selectOption(access);
  await page.getByRole("button", { name: "Create table", exact: true }).click();
  await page.locator(".create-modal").waitFor({ state: "hidden" });
  await page.locator(".lobby-game").filter({ hasText: name }).waitFor();
};
const settings = async (page) => {
  await page.locator(".user-menu-button").click();
  await page.getByRole("menuitem", { name: "Settings", exact: true }).click();
  await page.getByRole("heading", { name: "Users", exact: true }).waitFor();
};
try {
  const white = await signup("browser-white");
  const black = await signup("browser-black");
  for (const game of ["chess", "checkers"]) {
    const title = "Browser " + game;
    await createTable(white, game, title);
    await white.getByLabel("Search tables").fill(title);
    assert.equal(await white.locator(".lobby-game:visible").count(), 1);
    await white.getByLabel("Search tables").fill("");
    await white.screenshot({ path: "bin/lobby.png", fullPage: true });
    await join(white, title);
    await join(black, title);
    await white
      .getByRole("button", { name: "Play white", exact: true })
      .click();
    await black
      .getByRole("button", { name: "Play black", exact: true })
      .click();
    await waitRevision(white, 2);
    await waitRevision(black, 2);
    const from = game === "chess" ? 52 : 40,
      to = game === "chess" ? 36 : 33;
    await emit(black, "easel.board.move", { from, to, revision: 2 });
    await black
      .getByRole("alert")
      .filter({ hasText: "not your turn" })
      .waitFor();
    assert.equal((await match(white)).revision, 2);
    await clickSquare(white, from);
    await clickSquare(white, to);
    await waitRevision(white, 3);
    await waitRevision(black, 3);
    assert.equal((await match(black)).squares[to].side, "white");
    await black.reload();
    await black.locator(".ez-gameboard .ez-gb-piece").first().waitFor();
    await waitRevision(black, 3);
    assert.equal(await black.locator(".ez-gameboard").getAttribute("data-kit"), "easel.surfaces.gameboard");
    assert.equal(await black.locator(".ez-moves .ez-move").count(), 1);
    const blackFrom = game === "chess" ? 12 : 17,
      blackTo = game === "chess" ? 28 : 24;
    await clickSquare(black, blackFrom);
    await clickSquare(black, blackTo);
    await waitRevision(white, 4);
    await waitRevision(black, 4);
    await white.getByRole("link", { name: "Easel", exact: true }).click();
    await white.getByRole("heading", { name: "Easel", exact: true }).waitFor();
    await white
      .locator(".lobby-game")
      .filter({ hasText: title })
      .getByRole("button", { name: "Settings", exact: true })
      .click();
    await white
      .getByRole("button", { name: "Users and roles", exact: true })
      .click();
    await white.getByLabel("Role for browser-black").selectOption("spectator");
    await white.waitForFunction(() =>
      Object.values(Easel.Components.get("lobby").props.memberships)
        .flat()
        .some(
          (user) =>
            user.displayName === "browser-black" && user.role === "spectator",
        ),
    );
    for (let attempt = 0; (await state(black)).canPlay !== false; attempt++) {
      assert.ok(attempt < 100, "spectator role did not reach the board");
      await black.waitForTimeout(100);
    }
    assert.equal(
      await black.getByRole("button", { name: "Reset match" }).isVisible(),
      false,
    );
    await black.getByRole("link", { name: "Easel", exact: true }).click();
    await black.getByRole("heading", { name: "Easel", exact: true }).waitFor();
    await white.getByLabel("Role for browser-black").selectOption("player");
    await white
      .getByRole("button", { name: "Close table settings", exact: true })
      .click();
  }
  await settings(white);
  const blackAccount = white
    .locator(".lobby-accounts .management-row")
    .filter({ hasText: "browser-black" });
  await blackAccount
    .getByRole("button", { name: "Make administrator", exact: true })
    .click();
  await black
    .getByRole("button", { name: "Applications", exact: true })
    .waitFor({ state: "visible" });
  await blackAccount
    .getByRole("button", { name: "Remove administrator", exact: true })
    .click();
  await black
    .getByRole("button", { name: "Applications", exact: true })
    .waitFor({ state: "hidden" });
  const whiteAccount = white
    .locator(".lobby-accounts .management-row")
    .filter({ hasText: "browser-white" });
  await whiteAccount
    .getByRole("button", { name: "Remove administrator", exact: true })
    .click();
  await white
    .getByRole("alert")
    .filter({ hasText: "Keep at least one" })
    .waitFor();
  await white.screenshot({ path: "bin/users.png", fullPage: true });
  await createTable(white, "chess", "Private chess", "invite");
  const privateRow = white
    .locator(".lobby-game")
    .filter({ hasText: "Private chess" });
  await privateRow.waitFor();
  await emit(black, "lobby.refresh", {});
  await black
    .locator(".lobby-game")
    .filter({ hasText: "Private chess" })
    .getByRole("button", { name: "Join", exact: true })
    .click();
  await black.getByRole("alert").filter({ hasText: "members only" }).waitFor();
  await privateRow
    .getByRole("button", { name: "Settings", exact: true })
    .click();
  await white
    .getByRole("button", { name: "Users and roles", exact: true })
    .click();
  await white
    .getByLabel("User to add")
    .selectOption({ label: "browser-black" });
  await white.getByRole("button", { name: "Add member", exact: true }).click();
  const addedRole = white.getByLabel("Role for browser-black");
  await addedRole.waitFor();
  assert.equal(await addedRole.inputValue(), "player");
  await join(black, "Private chess");
  await white.screenshot({ path: "bin/table-settings.png", fullPage: true });
  await black.screenshot({ path: "bin/chess.png", fullPage: true });
  await black.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await black.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await black.screenshot({ path: "bin/mobile-game.png", fullPage: true });
  await white
    .getByRole("button", { name: "Close table settings", exact: true })
    .click();
  await white.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await white.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await white.screenshot({ path: "bin/mobile-lobby.png", fullPage: true });
  assert.deepEqual(errors, []);
  console.log(
    "Two-account chess/checkers, board input, synchronization, reconnect, game roles, members-only tables and mobile layout passed.",
  );
} catch (error) {
  console.error("Browser errors:", errors);
  for (const context of contexts)
    for (const page of context.pages()) {
      console.error((await page.locator("body").innerText()).slice(0, 3000));
      console.error(
        await page.locator(".ez-gameboard").evaluateAll((nodes) =>
          nodes.map((node) => ({
            html: node.outerHTML.slice(0, 600),
            bounds: node.getBoundingClientRect().toJSON(),
          })),
        ),
      );
      await page.screenshot({
        path: "bin/board-failure-" + contexts.indexOf(context) + ".png",
        fullPage: true,
      });
    }
  throw error;
} finally {
  for (const context of contexts) await context.close();
  await browser.close();
}
