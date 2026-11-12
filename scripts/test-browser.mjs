import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
const { chromium } = await import(
  pathToFileURL(process.env.EASEL_PLAYWRIGHT_MODULE).href
);
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  await context.addInitScript(() => {
    const Native = WebSocket;
    globalThis.WebSocket = class extends Native {
      constructor(...args) {
        super(...args);
        globalThis.testSocket = this;
      }
      send(data) {
        (globalThis.sentFrames ??= []).push(JSON.parse(data));
        return super.send(data);
      }
    };
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const component = (id) => page.locator('[data-easel-id="' + id + '"]');
  await page.goto(process.argv[2]);
  await component("login").waitFor({ state: "visible" });
  assert.ok(
    await page.evaluate(() =>
      [
        "shell",
        "header",
        "login",
        "providers",
        "session",
        "status",
        "retry",
        "logout",
      ].every((id) => Easel.Components.get(id)),
    ),
  );
  assert.equal(await page.evaluate(() => Easel.Components.get("table")), null);
  await page.evaluate(
    () => (globalThis.shellBefore = Easel.Components.get("shell")),
  );
  await page
    .getByRole("button", { name: "Create an account", exact: true })
    .click();
  await page.locator("#username").fill("browser-user");
  await page.locator("#password").fill("browser password");
  await page.locator("#displayName").fill("Browser Player");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await page.getByRole("heading", { name: "Your table is ready." }).waitFor();
  await page.waitForFunction(
    () =>
      globalThis.Easel?.Components.get("status")?.props.text === "Connected",
  );
  await page.getByRole("button", { name: "Roll a d20" }).click();
  await page.getByRole("heading", { name: /You rolled \d+\./ }).waitFor();
  assert.equal(
    await page.evaluate(() => Easel.Interfaces.list("easel.easel.button@1").length),
    2,
  );
  assert.ok(
    await page.evaluate(
      () => Easel.Components.get("shell") === globalThis.shellBefore,
    ),
  );
  assert.equal(
    await page.evaluate(() => Easel.Interfaces.supports("easel.easel.signin@1")),
    1,
  );
  assert.equal(
    await page.evaluate(() => Easel.Components.get("table").parent.id),
    "session",
  );
  assert.equal(
    await page.evaluate(() => Easel.Components.get("table").slot),
    "game",
  );
  assert.equal(
    await page.evaluate(() => Easel.Components.get("session").parent.id),
    "shell",
  );
  await page.evaluate(() => {
    const child = Easel.Components.get("roll"),
      parent = Easel.Components.get("table");
    const button = document.querySelector('[data-easel-id="roll"]');
    child.detach();
    child.attach(parent, "content");
    if (document.querySelector('[data-easel-id="roll"]') !== button)
      throw new Error("Move replaced instance");
  });
  const reloaded = page.waitForEvent("load");
  await page.evaluate(() => globalThis.testSocket.close());
  await reloaded;
  await page.waitForFunction(
    () =>
      globalThis.Easel?.Components.get("status")?.props.text === "Connected",
  );
  await page.getByRole("button", { name: "Roll a d20" }).click();
  await page.getByRole("heading", { name: /You rolled \d+\./ }).waitFor();
  await page.locator(".user-menu-button").click();
  await component("logout").click();
  await component("login").waitFor({ state: "visible" });
  await page.reload();
  await page.locator("#username").fill("browser-user");
  await page.locator("#password").fill("wrong password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page
    .getByRole("alert")
    .filter({ hasText: "invalid username or password" })
    .waitFor();
  await page.locator("#password").fill("browser password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForFunction(
    () =>
      globalThis.Easel?.Components.get("status")?.props.text === "Connected",
  );
  await page.getByRole("button", { name: "Roll a d20" }).click();
  await page.getByRole("heading", { name: /You rolled \d+\./ }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  const failure = await context.newPage();
  await failure.route("**/api/me", (route) =>
    route.fulfill({ status: 503, json: { error: "Test service unavailable" } }),
  );
  await failure.goto(process.argv[2]);
  await failure
    .getByRole("status")
    .filter({ hasText: "Test service unavailable" })
    .waitFor();
  await failure
    .getByRole("button", { name: "Try again" })
    .waitFor({ state: "visible" });
  assert.ok(
    await failure.evaluate(
      () => Easel.Components.get("retry") && Easel.Components.get("shell"),
    ),
  );
  const retried = failure.waitForEvent("load");
  await failure.getByRole("button", { name: "Try again" }).click();
  await retried;
  await failure
    .getByRole("status")
    .filter({ hasText: "Test service unavailable" })
    .waitFor();
  await failure.close();
  const missing = await context.newPage();
  await missing.route("**/assets/**/client/application.mjs", route => route.fulfill({status: 404, body: "Missing test application"}));
  await missing.goto(process.argv[2]);
  await missing.getByRole("button", {name: "Try again"}).waitFor({state: "visible"});
  assert.ok(await missing.evaluate(() => !!Easel.Components.get("shell")));
  assert.equal(await missing.evaluate(() => Easel.Components.get("table")), null);
  assert.equal(await missing.evaluate(() => globalThis.sentFrames.some(frame => frame.type === "ready")), false);
  await missing.unroute("**/assets/**/client/application.mjs");
  const recovered = missing.waitForEvent("load");
  await missing.getByRole("button", {name: "Try again"}).click();
  await recovered;
  await missing.waitForFunction(() => globalThis.Easel?.Components.get("status")?.props.text === "Connected");
  assert.equal(await missing.evaluate(() => Easel.Components.get("table").parent.id), "session");
  await missing.close();
  assert.deepEqual(errors, []);
  console.log(
    "Browser acceptance passed: signup, login, component move, events, reload, logout, mobile layout.",
  );
} finally {
  await browser.close();
}
