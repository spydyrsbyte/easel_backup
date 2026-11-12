export default async function steps(page) {
  const map = page.locator(".ez-map");
  const box = await map.boundingBox();
  const at = (x, y) => page.evaluate(({ x, y }) => {
    const component = document.querySelector(".ez-map");
    const instance = Easel.Components.get("map");
    return instance ? null : null;
  }, { x, y });
  await at(0, 0);
  await page.mouse.click(box.x + 420, box.y + 600);
  await page.mouse.click(box.x + 560, box.y + 600);
  await page.mouse.click(box.x + 560, box.y + 700);
  await page.keyboard.press("Escape");
  await page.evaluate(() => Easel.Components.get("map").setProps({ tool: "light" }));
  await page.mouse.click(box.x + 780, box.y + 620);
  await page.evaluate(() => Easel.Components.get("map").setProps({ tool: "select" }));
  await page.waitForTimeout(400);
  const events = await page.evaluate(() => globalThis.mapEvents.map((event) => event.name + (event.payload.action ? ":" + event.payload.action : "")));
  console.log("events: " + events.join(", "));
}
