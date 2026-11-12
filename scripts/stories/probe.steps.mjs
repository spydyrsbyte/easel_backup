export default async function steps(page) {
  await page.waitForTimeout(2500);
  console.log(
    JSON.stringify(
      await page.evaluate(() => ({
        alerts: [...document.querySelectorAll("[role=alert]")].map((node) => node.textContent).filter(Boolean),
        lobby: !!Easel.Components.get("lobby"),
        board: !!document.querySelector(".ez-gameboard"),
        body: document.body.innerText.slice(0, 400),
      })),
      null,
      1,
    ),
  );
}
