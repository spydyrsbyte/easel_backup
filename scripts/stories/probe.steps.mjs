export default async function steps(page) {
  const report = await page.evaluate(() => {
    const frame = document.querySelector(".ez-tabletop");
    const chain = [];
    for (let node = frame; node && node !== document.body; node = node.parentElement) chain.push(node.tagName + "." + String(node.className).split(" ").slice(0, 2).join(".") + " " + Math.round(node.getBoundingClientRect().width) + "x" + Math.round(node.getBoundingClientRect().height));
    return {
      frame: !!frame,
      chain,
      sidebar: frame?.dataset.sidebar,
      ids: [...document.querySelectorAll("[data-easel-id]")].map((node) => node.dataset.easelId + ":" + (node.dataset.kit || "")).slice(0, 40),
      css: !!document.querySelector("link[data-easel-kits]")?.sheet,
      cssHref: document.querySelector("link[data-easel-kits]")?.href,
    };
  });
  console.log(JSON.stringify(report, null, 1));
}
