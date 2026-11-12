import { pathToFileURL, fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const options = { base: "http://127.0.0.1:5199", application: "", game: "", out: "bin/dev/shot.png", width: 1440, height: 900, steps: "", user: "dev", lobby: false, full: false, wait: 600 };
for (let index = 2; index < process.argv.length; index += 2) {
  const key = process.argv[index].replace(/^--/, "");
  options[key] = typeof options[key] === "number" ? Number(process.argv[index + 1]) : typeof options[key] === "boolean" ? process.argv[index + 1] !== "false" : process.argv[index + 1];
}
const { chromium } = await import(
  pathToFileURL(process.env.EASEL_PLAYWRIGHT_MODULE || resolve(root, "node_modules/playwright/index.mjs")).href
);
const browser = await chromium.launch({
  channel: "msedge",
  headless: true,
  args: ["--enable-webgl", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const errors = [];
try {
  const context = await browser.newContext({ viewport: { width: options.width, height: options.height }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on("pageerror", (error) => errors.push("pageerror: " + error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push("console: " + message.text());
  });
  await page.goto(options.base);
  await page.locator("#username").waitFor();
  const password = "development password";
  const signIn = async (create) => {
    if (create) await page.getByRole("button", { name: "Create an account", exact: true }).click();
    await page.locator("#username").fill(options.user);
    await page.locator("#password").fill(password);
    if (create) await page.locator("#displayName").fill(options.user);
    await page.getByRole("button", { name: create ? "Create account" : "Sign in", exact: true }).click();
  };
  await signIn(false);
  const signedIn = await Promise.race([
    page.waitForFunction(() => globalThis.Easel?.Components.get("lobby")).then(() => true),
    page.getByRole("alert").filter({ hasText: /invalid/i }).waitFor().then(() => false),
  ]);
  if (!signedIn) {
    await signIn(true);
    await page.waitForFunction(() => globalThis.Easel?.Components.get("lobby"));
  }
  await page.waitForFunction(() => Array.isArray(Easel.Components.get("lobby")?.props.games));
  if (!options.lobby && options.application) {
    const name = options.game || options.application;
    const existing = await page.evaluate((name) => Easel.Components.get("lobby").props.games.find((game) => game.name === name) || null, name);
    if (!existing) {
      await page.evaluate(({ name, application }) => Application.events.emit("lobby.create", { name, application, modules: [], access: "open" }), { name, application: options.application });
      await page.waitForFunction((name) => Easel.Components.get("lobby")?.props.games.some((game) => game.name === name && game.running), name);
    } else if (!existing.running) {
      await page.evaluate((id) => Application.events.emit("lobby.start", { game: id }), existing.id);
      await page.waitForFunction((name) => Easel.Components.get("lobby")?.props.games.some((game) => game.name === name && game.running), name);
    }
    const id = await page.evaluate((name) => Easel.Components.get("lobby").props.games.find((game) => game.name === name).id, name);
    await page.evaluate((id) => Application.events.emit("lobby.join", { game: id }), id);
    await page.waitForFunction(() => !Easel.Components.get("lobby") && Easel.Components.get("status")?.props.text === "Connected");
  }
  await page.waitForTimeout(options.wait);
  if (options.steps) {
    const steps = await import(pathToFileURL(resolve(root, options.steps)).href);
    await steps.default(page, { context, browser, options, shot: (name) => page.screenshot({ path: resolve(root, name) }) });
  }
  await page.screenshot({ path: resolve(root, options.out), fullPage: options.full });
  console.log("saved " + options.out);
} catch (error) {
  errors.push("script: " + error.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
for (const error of errors) console.log(error);
