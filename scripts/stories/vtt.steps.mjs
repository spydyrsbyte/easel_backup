export default async function steps(page, { shot }) {
  const wait = (ms) => page.waitForTimeout(ms);
  await page.locator(".ez-map canvas").waitFor();
  await wait(1500);
  await shot("bin/dev/vtt-a-map.png");
  const input = page.locator(".ez-chat-box textarea");
  await input.fill("The door creaks open.");
  await input.press("Enter");
  await page.locator(".ez-dicetray button", { hasText: "d20" }).click();
  await input.fill("/r 2d6+3 # Longsword");
  await input.press("Enter");
  await wait(900);
  const canvas = await page.locator(".ez-map").boundingBox();
  const token = await page.evaluate(() => {
    const frame = [...document.querySelectorAll("[data-easel-id]")].find((node) => node.dataset.kit === "easel.maps.map");
    const handle = Easel.Components.get(frame.dataset.easelId);
    const mira = handle.props.tokens.find((entry) => entry.name === "Mira");
    return mira;
  });
  await page.evaluate(() => {
    const frame = [...document.querySelectorAll("[data-easel-id]")].find((node) => node.dataset.kit === "easel.maps.map");
    globalThis.mapHandle = Easel.Components.get(frame.dataset.easelId);
  });
  const screen = async (x, y) =>
    page.evaluate(
      ({ x, y }) => {
        const node = document.querySelector(".ez-map");
        const bounds = node.getBoundingClientRect();
        const canvasNode = node.querySelector("canvas");
        void canvasNode;
        const props = globalThis.mapHandle.props;
        const size = props.map.size;
        const inset = props.insets || {};
        const width = bounds.width - (inset.left || 0) - (inset.right || 0);
        const height = bounds.height - (inset.top || 0) - (inset.bottom || 0);
        const zoom = Math.min(width / size.width, height / size.height) * 0.94;
        return { x: bounds.left + (inset.left || 0) + width / 2 + (x - size.width / 2) * zoom, y: bounds.top + (inset.top || 0) + height / 2 + (y - size.height / 2) * zoom };
      },
      { x, y },
    );
  const at = await screen(token.x, token.y);
  await page.mouse.dblclick(at.x, at.y);
  await wait(700);
  await shot("bin/dev/vtt-b-sheet.png");
  await page.locator(".ez-window .ez-iconbtn[aria-label='Close']").first().click();
  await page.locator(".ez-sidebar-tab[aria-label='Encounter']").click();
  await page.getByRole("button", { name: "Start an encounter" }).click();
  await wait(500);
  for (const name of ["Aldric", "Mira", "Cellar Rat"]) {
    const target = await page.evaluate((name) => globalThis.mapHandle.props.tokens.find((entry) => entry.name === name), name);
    const point = await screen(target.x, target.y);
    await page.mouse.click(point.x, point.y, { button: "right" });
    await page.locator(".ez-menu-item", { hasText: "Add to encounter" }).click();
    await wait(350);
  }
  await page.locator(".ez-tracker .ez-iconbtn[aria-label='Encounter options']").click();
  await page.locator(".ez-menu-item", { hasText: "Roll all initiative" }).click();
  await wait(900);
  await page.getByRole("button", { name: "Begin" }).click();
  await wait(700);
  await shot("bin/dev/vtt-c-combat.png");
  await page.keyboard.press("e");
  await wait(900);
  await shot("bin/dev/vtt-d-edit.png");
  const light = await screen(600, 250);
  await page.mouse.click(light.x, light.y);
  await wait(500);
  await shot("bin/dev/vtt-e-light.png");
  await page.keyboard.press("Escape");
  await page.keyboard.press("e");
  await wait(600);
  await page.locator(".ez-scene", { hasText: "Arrival at Ravenhold" }).click();
  await wait(2200);
  await shot("bin/dev/vtt-f-stage.png");
  await page.keyboard.press("e");
  await wait(800);
  await page.mouse.click(canvas.x + 300, canvas.y + 420);
  await wait(500);
  await shot("bin/dev/vtt-g-stage-edit.png");
  await page.keyboard.press("e");
  await page.locator(".ez-scene", { hasText: "The Gilded Tankard" }).click();
  await wait(800);
}
