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
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const base = process.argv[2];
  const button = (name) => page.getByRole("button", { name, exact: true });
  const signUp = async () => {
    if (await button("Create an account").isVisible())
      await button("Create an account").click();
    await page.locator("#username").fill("challenged");
    await page.locator("#password").fill("browser password");
    await button("Create account").click();
    await page.getByRole("heading", { name: "One more step" }).waitFor();
  };
  await page.goto(base);
  await button("Create an account").waitFor();
  await signUp();
  assert.equal(await page.locator("#username").isVisible(), false);
  assert.equal(
    await page.locator('label[for="challengeResponse"] span').textContent(),
    "Invite",
  );
  await button("Start over").click();
  await page.getByRole("heading", { name: "Join us" }).waitFor();
  assert.equal(await page.locator("#challengeResponse").isVisible(), false);

  await signUp();
  await page.locator("#challengeResponse").fill("wrong");
  await button("Continue").click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Invalid invite. Sign in again to retry." })
    .waitFor();
  await page.getByRole("heading", { name: "Join us" }).waitFor();

  await signUp();
  await page.locator("#challengeResponse").fill("letmein");
  await button("Continue").click();
  await page.getByRole("heading", { name: "Your table is ready." }).waitFor();
  await page.waitForFunction(
    () =>
      globalThis.Easel?.Components.get("status")?.props.text === "Connected",
  );
  const refusal = await page.evaluate(async () => {
    try {
      await Application.files.upload(
        new File(["hello"], "notes.txt", { type: "text/plain" }),
      );
      return "accepted";
    } catch (error) {
      return error.status + " " + error.message;
    }
  });
  assert.equal(refusal, "403 this table does not accept uploads");
  assert.match(
    await page.evaluate(() => Application.files.url("abc")),
    /^\/files\/[^/]+\/abc$/,
  );

  const returned = await context.newPage();
  await returned.goto(base + "/#challenge=code&challengeToken=expired-token");
  await returned.getByRole("heading", { name: "One more step" }).waitFor();
  assert.equal(new URL(returned.url()).hash, "");
  await returned.locator("#challengeResponse").fill("123456");
  await returned.getByRole("button", { name: "Continue", exact: true }).click();
  await returned
    .getByRole("alert")
    .filter({ hasText: "challenge expired or is invalid" })
    .waitFor();
  await returned.getByRole("heading", { name: "Sign in" }).waitFor();
  await returned.close();

  const refused = await context.newPage();
  await refused.goto(base + "/#error=This+account+is+banned.");
  await refused
    .getByRole("alert")
    .filter({ hasText: "This account is banned." })
    .waitFor();
  await refused.close();
  assert.deepEqual(errors, []);
  console.log(
    "Challenge acceptance passed: challenge, cancel, refusal, success, provider return, expiry, upload helper.",
  );
} finally {
  await browser.close();
}
