import assert from "node:assert/strict";
import fs from "node:fs";
import { pathToFileURL, fileURLToPath } from "node:url";
const { chromium } = await import(
  pathToFileURL(process.env.EASEL_PLAYWRIGHT_MODULE).href
);
process.chdir(fileURLToPath(new URL("..", import.meta.url)));
const layout = JSON.parse(
  fs.readFileSync("server/easel/applications/mtgtable/client/layout.json", "utf8"),
);
const picture = fs.readFileSync("server/easel/applications/mtgtable/client/assets/back.jpg");
const browser = await chromium.launch({
  channel: "msedge",
  headless: true,
  args: ["--enable-webgl", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const errors = [];
const signup = async (username, viewport = { width: 1440, height: 1000 }) => {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") console.log(username, message.type(), message.text().slice(0, 300));
  });
  page.on("requestfailed", (request) => console.log(username, "request failed", request.url().slice(0, 160), request.failure()?.errorText));
  page.on("response", (response) => {
    if (response.status() >= 400 && !response.url().endsWith("/api/me")) console.log(username, "status", response.status(), response.url().slice(0, 160));
  });
  await page.route("https://cards.scryfall.io/**", (route) =>
    route.fulfill({ headers: { "Access-Control-Allow-Origin": "*" }, contentType: "image/jpeg", body: picture }),
  );
  await page.route("https://api.scryfall.com/cards/collection", async (route) => {
    const entries = route.request().postDataJSON()?.identifiers || [];
    await route.fulfill({
      headers: { "Access-Control-Allow-Origin": "*" },
      json: {
        data: entries.map((entry, index) => ({
          object: "card",
          id: "00000000-0000-0000-0000-00000000000" + (index % 10),
          name: entry.name,
          layout: "normal",
          cmc: entry.name.includes("Forest") ? 0 : 2,
          type_line: entry.name.includes("Forest") ? "Basic Land — Forest" : "Creature — Bear",
          oracle_text: entry.name.includes("Forest") ? "({T}: Add {G}.)" : "",
          image_uris: { large: "https://cards.scryfall.io/large/front/0/0/test.jpg" },
        })),
        not_found: [],
      },
    });
  });
  await page.goto(process.argv[2]);
  await page.locator("#username").waitFor();
  await page.getByRole("button", { name: "Create an account", exact: true }).click();
  await page.locator("#username").fill(username);
  await page.locator("#password").fill("browser password");
  await page.locator("#displayName").fill(username);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await page.getByRole("heading", { name: "Easel", exact: true }).waitFor();
  return page;
};
const props = (page) => page.evaluate(() => Easel.Components.get("mtgtable").props);
const join = async (page, title) => {
  await page.evaluate(() => Application.events.emit("lobby.refresh", {}));
  await page.locator(".lobby-game").filter({ hasText: title }).getByRole("button", { name: "Join", exact: true }).click();
  await page.locator(".mtgt-canvas canvas").waitFor();
  await page.waitForFunction(() => Easel.Components.get("mtgtable")?.props.state.objects);
};
const screen = async (page, x, z) => {
  const { flip, box } = await page.evaluate(() => {
    const canvas = document.querySelector(".mtgt-canvas canvas");
    const rect = canvas.getBoundingClientRect();
    const state = Easel.Components.get("mtgtable").props.state;
    return { flip: ["Green", "Blue", "Purple"].includes(state.viewer), box: { width: canvas.width, height: canvas.height, ratio: rect.width / canvas.width } };
  });
  const scale = Math.min(box.width / 126, box.height / 82);
  const point = flip
    ? { x: box.width / 2 - scale * x, y: box.height / 2 + scale * z }
    : { x: box.width / 2 + scale * x, y: box.height / 2 - scale * z };
  return { x: point.x * box.ratio, y: point.y * box.ratio };
};
const canvas = (page) => page.locator(".mtgt-canvas canvas");
const pages = [];
try {
  const owner = await signup("tabletop-owner"),
    guest = await signup("tabletop-guest");
  pages.push(owner, guest);
  await owner.getByRole("button", { name: "Applications", exact: true }).click();
  await owner.locator(".application-card").filter({ hasText: "The scripted six-player" }).getByRole("button", { name: "Start a table", exact: true }).click();
  await owner.getByLabel("Table name", { exact: true }).fill("Six seat night");
  await owner.getByRole("button", { name: "Create table", exact: true }).click();
  await owner.locator(".create-modal").waitFor({ state: "hidden" });
  await join(owner, "Six seat night");
  await join(guest, "Six seat night");
  await owner.locator(".mtgt-seat").filter({ hasText: "White" }).click();
  await guest.locator(".mtgt-seat").filter({ hasText: "Green" }).click();
  await owner.waitForFunction(() => {
    const seats = Easel.Components.get("mtgtable").props.state.seats;
    return seats.White.user && seats.Green.user;
  });
  await owner.getByRole("button", { name: "Deck importer", exact: true }).click();
  await owner.getByPlaceholder("Deck name").fill("Bears");
  await owner.locator(".mtgt-panel textarea").fill("30 Grizzly Bears\n30 Forest\n\nCommander\n1 Bear Lord");
  await owner.getByRole("button", { name: "Import", exact: true }).click();
  await owner.waitForFunction(() =>
    Easel.Components.get("mtgtable").props.state.objects.some((object) => object.kind === "deck" && object.count === 60),
  );
  await owner.locator(".mtgt-panel-header button").click();
  const white = layout.seats.White;
  let point = await screen(owner, white.buttons.draw.x, white.buttons.draw.z);
  await canvas(owner).click({ position: point });
  await owner.waitForFunction(() => Easel.Components.get("mtgtable").props.state.hands.White[0].length === 1);
  point = await screen(owner, white.mulligan.x, white.mulligan.z);
  await canvas(owner).click({ position: point });
  await owner.waitForFunction(() => Easel.Components.get("mtgtable").props.state.hands.White[0].length === 7);
  const hand = white.hands[0];
  const along = -((7 - 1) * 2.35) / 2;
  const from = await screen(owner, hand.x + white.right[0] * along, hand.z);
  const to = await screen(owner, 27, -14);
  const box = await canvas(owner).boundingBox();
  await owner.mouse.move(box.x + from.x, box.y + from.y);
  await owner.mouse.down();
  await owner.mouse.move(box.x + (from.x + to.x) / 2, box.y + (from.y + to.y) / 2, { steps: 6 });
  await owner.mouse.move(box.x + to.x, box.y + to.y, { steps: 6 });
  await owner.mouse.up();
  await owner.waitForFunction(() => Easel.Components.get("mtgtable").props.state.hands.White[0].length === 6);
  const played = (await props(owner)).state.objects.find((object) => object.kind === "card" && Math.abs(object.x - 27) < 0.5 && Math.abs(object.z + 14) < 0.5);
  assert.ok(played, "the dragged card must land on the playmat");
  await owner.mouse.move(box.x + to.x, box.y + to.y + 2);
  await owner.keyboard.press("e");
  await owner.waitForFunction((id) => Easel.Components.get("mtgtable").props.state.objects.find((object) => object.id === id)?.rot === 270, played.id);
  point = await screen(owner, white.buttons.untap.x, white.buttons.untap.z);
  await canvas(owner).click({ position: point });
  await owner.waitForFunction((id) => Easel.Components.get("mtgtable").props.state.objects.find((object) => object.id === id)?.rot === 180, played.id);
  await guest.waitForFunction(() => Easel.Components.get("mtgtable").props.state.hands.White[0].length === 6);
  const guestView = (await props(guest)).state;
  assert.ok(guestView.hands.White[0].every((card) => !card.card), "the guest must not see White's hand");
  await owner.locator(".mtgt-chat-form input").fill("drain 2");
  await owner.locator(".mtgt-chat-form").getByRole("button", { name: "Send", exact: true }).click();
  await guest.waitForFunction(() => Easel.Components.get("mtgtable").props.state.players.Green.life === 38);
  await guest.route("**/api/fetch?url=*", (route) => {
    const target = new URL(route.request().url()).searchParams.get("url");
    if (target.startsWith("https://api2.moxfield.com/v3/decks/all/link-deck"))
      return route.fulfill({
        json: {
          name: "Linked Elves",
          boards: {
            mainboard: { cards: { a: { quantity: 40, card: { name: "Llanowar Elves" } }, b: { quantity: 59, card: { name: "Forest" } } } },
            commanders: { cards: { c: { quantity: 1, card: { name: "Elf Lord" } } } },
          },
        },
      });
    if (target === "https://example.com/mat.png") return route.fulfill({ contentType: "image/jpeg", body: picture });
    return route.fulfill({ status: 404, json: { error: "not mocked" } });
  });
  await owner.route("**/api/fetch?url=*", (route) => route.fulfill({ contentType: "image/jpeg", body: picture }));
  await guest.locator(".mtgt-chat-form input").fill("scryfall https://www.moxfield.com/decks/link-deck");
  await guest.locator(".mtgt-chat-form").getByRole("button", { name: "Send", exact: true }).click();
  await guest.waitForFunction(() =>
    Easel.Components.get("mtgtable").props.state.objects.some((object) => object.kind === "deck" && object.count === 99 && object.name === "Linked Elves"),
  );
  await guest.locator(".mtgt-chat-form input").fill("playmat https://example.com/mat.png");
  await guest.locator(".mtgt-chat-form").getByRole("button", { name: "Send", exact: true }).click();
  await owner.waitForFunction(() => Easel.Components.get("mtgtable").props.state.playmats.Green === "https://example.com/mat.png");
  await owner.locator(".mtgt-chat-form input").fill("my turn");
  await owner.locator(".mtgt-chat-form").getByRole("button", { name: "Send", exact: true }).click();
  await guest.waitForFunction(() => Easel.Components.get("mtgtable").props.state.turn.color === "White");
  const bag = (await props(owner)).state.objects.find((object) => object.kind === "bag" && object.template === "die" && object.sides === 20 && object.x < 0);
  const bagPoint = await screen(owner, bag.x, bag.z);
  const dropPoint = await screen(owner, -30, -8);
  await owner.mouse.move(box.x + bagPoint.x, box.y + bagPoint.y);
  await owner.mouse.down();
  await owner.mouse.move(box.x + dropPoint.x, box.y + dropPoint.y, { steps: 8 });
  await owner.mouse.up();
  await owner.waitForFunction(() => Easel.Components.get("mtgtable").props.state.objects.some((object) => object.kind === "die" && object.template === "die" && object.sides === 20));
  const publicCard = (await props(owner)).state.objects.find((object) => object.kind === "card" && object.card && !object.faceDown);
  assert.ok(publicCard, "a public card is available for inspection");
  const inspectPoint = await screen(owner, publicCard.x, publicCard.z);
  await owner.mouse.move(box.x + inspectPoint.x, box.y + inspectPoint.y);
  await owner.keyboard.down("Alt");
  await owner.locator(".mtgt-zoom.show img").waitFor();
  await owner.keyboard.up("Alt");
  await owner.mouse.click(box.x + inspectPoint.x, box.y + inspectPoint.y, { button: "right" });
  await owner.getByRole("button", { name: "Inspect card", exact: true }).click();
  await owner.locator(".mtgt-zoom.pinned.show img").waitFor();
  await owner.keyboard.press("Escape");
  await owner.locator(".mtgt-zoom.show").waitFor({ state: "hidden" });
  await owner.getByRole("button", { name: "Rotate view right", exact: true }).click();
  await owner.getByRole("button", { name: "Rotate view left", exact: true }).click();
  await owner.getByLabel("View player area", { exact: true }).selectOption("Green");
  await owner.getByRole("button", { name: "Whole table", exact: true }).click();
  await owner.waitForTimeout(800);
  await owner.screenshot({ path: "bin/mtgtable.png" });
  await guest.waitForTimeout(500);
  await guest.screenshot({ path: "bin/mtgtable-guest.png" });
  await guest.setViewportSize({ width: 390, height: 844 });
  await guest.waitForTimeout(500);
  await guest.screenshot({ path: "bin/mtgtable-mobile.png" });
  const overflow = await guest.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  assert.equal(overflow, false, "the table must not scroll horizontally on a phone");
  assert.deepEqual(errors, []);
  console.log("MTG browser checks passed");
} catch (error) {
  for (const [index, page] of pages.entries()) {
    await page.screenshot({ path: "bin/mtgtable-failure-" + index + ".png" }).catch(() => {});
    console.log("page", index, "error:", await page.locator(".mtgt-error").textContent().catch(() => ""));
  }
  console.log("page errors:", errors);
  throw error;
} finally {
  await browser.close();
}
