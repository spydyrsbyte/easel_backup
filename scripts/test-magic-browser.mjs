import assert from "node:assert/strict";
import { pathToFileURL, fileURLToPath } from "node:url";
const { chromium } = await import(
  pathToFileURL(process.env.EASEL_PLAYWRIGHT_MODULE).href
);
process.chdir(fileURLToPath(new URL("..", import.meta.url)));
const browser = await chromium.launch({
  channel: "msedge",
  headless: true,
  args: [
    "--enable-webgl",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const errors = [],
  contexts = [];
const signup = async (username) => {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  contexts.push(context);
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route(
    "https://api.scryfall.com/cards/collection",
    async (route) => {
      const entries = route.request().postDataJSON()?.identifiers || [];
      await route.fulfill({
        headers: { "Access-Control-Allow-Origin": "*" },
        json: {
          data: entries.map((entry) => ({
            id: "00000000-0000-0000-0000-000000000001",
            name: entry.name,
            type_line: entry.name.includes("Plains")
              ? "Basic Land — Plains"
              : "Creature — Cat",
            power: "2",
            toughness: "2",
            mana_cost: entry.name.includes("Plains") ? "" : "{1}{W}",
            oracle_text: entry.name.includes("Plains")
              ? "{T}: Add {W}."
              : "Vigilance",
          })),
        },
      });
    },
  );
  await page.goto(process.argv[2]);
  await page.locator("#username").waitFor();
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
  page.evaluate(() => Easel.Components.get("magic").props.state);
const emit = (page, event, payload) =>
  page.evaluate(
    async ({ event, payload }) => {
      await Application.events.emit(event, payload);
    },
    { event, payload },
  );
const act = async (page, action, payload = {}) => {
  const request = "test-" + Math.random();
  await emit(page, "easel.mtg.action", { request, payload: { ...payload, action } });
  await page.waitForFunction(
    (request) =>
      Easel.Components.get("magic").props.response.request === request,
    request,
  );
  return page.evaluate(
    () => Easel.Components.get("magic").props.response.result,
  );
};
const join = async (page, title) => {
  await emit(page, "lobby.refresh", {});
  await page
    .locator(".lobby-game")
    .filter({ hasText: title })
    .getByRole("button", { name: "Join", exact: true })
    .click();
  await page.locator(".mtg-canvas canvas").waitFor();
  await page.waitForFunction(
    () => Easel.Components.get("magic")?.props.state.players,
  );
};
try {
  const owner = await signup("magic-owner"),
    guest = await signup("magic-guest");
  await owner
    .getByRole("button", { name: "Applications", exact: true })
    .click();
  await owner
    .locator(".application-card")
    .filter({ hasText: "Magic: The Gathering" })
    .getByRole("button", { name: "Start a table", exact: true })
    .click();
  await owner.getByLabel("Table name", { exact: true }).fill("Commander night");
  await owner
    .getByRole("button", { name: "Create table", exact: true })
    .click();
  await owner.locator(".create-modal").waitFor({ state: "hidden" });
  await join(owner, "Commander night");
  await join(guest, "Commander night");
  await owner.getByRole("button", { name: "Take a seat", exact: true }).click();
  await guest.getByRole("button", { name: "Take a seat", exact: true }).click();
  await owner.waitForFunction(
    () => Easel.Components.get("magic").props.state.players.length === 2,
  );
  await owner.getByLabel("Deck name", { exact: true }).fill("Lions");
  await owner
    .getByLabel("Deck list", { exact: true })
    .fill("4 Test Lion\n20 Plains");
  await owner.getByRole("button", { name: "Import deck", exact: true }).click();
  await owner.waitForFunction(() =>
    Object.values(Easel.Components.get("magic").props.state.libraries).some(
      (count) => count === 24,
    ),
  );
  await guest.getByLabel("Deck list", { exact: true }).fill("4 Guest Wall");
  await guest.getByRole("button", { name: "Import deck", exact: true }).click();
  await guest.waitForFunction(
    () => Easel.Components.get("magic").props.state.deck?.entries?.length === 1,
  );
  const ownID = await owner.evaluate(
    () => Easel.Components.get("magic").props.user,
  );
  await owner.getByRole("button", { name: "Draw seven", exact: true }).click();
  await owner.waitForFunction(
    (id) =>
      Easel.Components.get("magic").props.state.cards.filter(
        (card) => card.zone === "hand" && card.controller === id,
      ).length === 7,
    ownID,
  );
  let ownerState = await state(owner);
  while (
    !ownerState.cards.some(
      (card) => card.zone === "hand" && card.name === "Test Lion",
    ) &&
    ownerState.libraries[ownID] > 0
  ) {
    const count = ownerState.cards.filter(
      (card) => card.zone === "hand" && card.controller === ownID,
    ).length;
    await act(owner, "draw", { count: 1 });
    await owner.waitForFunction(
      ({ id, count }) =>
        Easel.Components.get("magic").props.state.cards.filter(
          (card) => card.zone === "hand" && card.controller === id,
        ).length > count,
      { id: ownID, count },
    );
    ownerState = await state(owner);
  }
  assert.equal(JSON.stringify(await state(guest)).includes("Test Lion"), false);
  const card = ownerState.cards
    .filter((card) => card.zone === "hand" && card.controller === ownID)
    .sort((a, b) => a.order - b.order)
    .at(-1);
  assert.equal(
    (await act(guest, "move", { id: card.id, zone: "battlefield" })).declined,
    true,
  );
  await owner.getByRole("button", { name: "Hide panels", exact: true }).click();
  await owner
    .getByRole("button", { name: "My play area", exact: true })
    .click();
  const point = await owner.evaluate(
    async ({ ownID, id }) => {
      const prefix = "/assets/easel.mtg.game-0.1.0/client/";
      const { magicLayout, stationView } = await import(prefix + "layout.mjs");
      const { pileToWorld } = await import(prefix + "cardtable-layout.mjs");
      const map = await (
        await fetch(prefix + "battlemaps/classic.json")
      ).json();
      const state = Easel.Components.get("magic").props.state;
      const piles = magicLayout(
        state.players,
        state.capabilities,
        ownID,
        "game",
        state.shape,
        state.size,
        { fallbackMap: map },
      );
      const station = piles.stations.find(
          (station) => station.player === ownID,
        ),
        view = stationView(station),
        pile = piles.find((pile) => pile.id === "hand-" + ownID);
      const hand = state.cards
          .filter((card) => card.zone === "hand" && card.controller === ownID)
          .sort((a, b) => a.order - b.order),
        index = hand.findIndex((card) => card.id === id);
      const w = map.card.width / 100,
        h = map.card.height / 100;
      const x =
          0.2 +
          index *
            Math.min(
              w * 0.85,
              Math.max(
                0.2,
                (pile.width - w - 0.4) / Math.max(1, hand.length - 1),
              ),
            ),
        y = 0.35;
      const world = pileToWorld(pile, { x: x + w / 2, y: y + h / 2 });
      const canvas = document.querySelector(".mtg-canvas canvas"),
        box = canvas.getBoundingClientRect(),
        scale = Math.min(
          (box.width - 32) / view.width,
          (box.height - 260) / view.height,
        ),
        r = (-(view.rotation || 0) * Math.PI) / 180,
        dx = world.x - view.x,
        dy = world.y - view.y;
      return {
        x: box.width / 2 + scale * (dx * Math.cos(r) - dy * Math.sin(r)),
        y:
          (box.height - 10) / 2 + scale * (dx * Math.sin(r) + dy * Math.cos(r)),
      };
    },
    { ownID, id: card.id },
  );
  await owner.locator(".mtg-canvas canvas").click({ position: point });
  await owner.getByRole("button", { name: "Show panels", exact: true }).click();
  await owner
    .locator(".dock-panel-content")
    .getByRole("heading", { name: card.name, exact: true })
    .waitFor();
  const lion = ownerState.cards.find(
    (card) => card.zone === "hand" && card.name === "Test Lion",
  );
  assert.ok(lion, "The combat test must have a creature in hand");
  if (lion) {
    assert.equal((await act(owner, "cast", { id: lion.id })).ok, true);
    await guest.waitForFunction(
      () => Easel.Components.get("magic").props.state.stack.length === 1,
    );
    await owner.getByRole("button", { name: "Rules", exact: true }).click();
    await owner
      .getByRole("button", { name: "Resolve top", exact: true })
      .click();
    await owner.waitForFunction(
      () => Easel.Components.get("magic").props.state.stack.length === 0,
    );
    const guestID = await guest.evaluate(
      () => Easel.Components.get("magic").props.user,
    );
    assert.equal(
      (await act(owner, "attack", { id: lion.id, target: guestID })).ok,
      true,
    );
    await owner
      .getByRole("button", { name: "Apply combat damage", exact: true })
      .click();
    await guest.waitForFunction(
      (id) =>
        Easel.Components.get("magic").props.state.players.find(
          (player) => player.id === id,
        ).life === 38,
      guestID,
    );
  }
  await owner.getByRole("button", { name: "Effects", exact: true }).click();
  await owner
    .getByRole("button", { name: "Create token", exact: true })
    .click();
  await guest.waitForFunction(() =>
    Easel.Components.get("magic").props.state.cards.some((card) => card.token),
  );
  await owner.getByRole("button", { name: "Chat", exact: true }).click();
  await owner
    .getByLabel("Message", { exact: true })
    .fill("Ready for the next turn");
  await owner
    .getByRole("button", { name: "Send message", exact: true })
    .click();
  await guest.waitForFunction(
    () => Easel.Components.get("magic").props.state.chat.length === 1,
  );
  await owner.getByRole("button", { name: "Whole table", exact: true }).click();
  await owner.screenshot({ path: "bin/magic-table.png", fullPage: true });
  await guest.reload();
  await guest.locator(".mtg-canvas canvas").waitFor();
  await guest.waitForFunction(
    () =>
      Easel.Components.get("magic")?.props.state.players?.length === 2 &&
      Easel.Components.get("magic")?.props.state.chat?.length === 1,
  );
  await owner
    .getByRole("button", { name: "My play area", exact: true })
    .click();
  await owner.screenshot({ path: "bin/magic-player.png", fullPage: true });
  await guest.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await guest.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await guest.screenshot({ path: "bin/magic-mobile.png", fullPage: true });
  assert.deepEqual(errors, []);
  console.log(
    "Magic: two accounts, deck lookup/import, private hands, real Pixi card input, casting, stack, combat, tokens, chat, reconnect and mobile passed.",
  );
} catch (error) {
  console.error("Page errors", errors);
  for (const [index, context] of contexts.entries())
    for (const page of context.pages()) {
      console.error((await page.locator("body").innerText()).slice(0, 4500));
      await page.screenshot({
        path: `bin/magic-failure-${index}.png`,
        fullPage: true,
      });
    }
  throw error;
} finally {
  for (const context of contexts) await context.close();
  await browser.close();
}
