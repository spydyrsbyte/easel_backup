import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { pathToFileURL, fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const library = path.join(root, "server/easel/server/library");
const pixiRoot = path.join(root, "server/easel/modules/pixi");
const options = { story: "", out: "bin/dev/kit.png", width: 1280, height: 800, wait: 900, theme: "dark" };
for (let index = 2; index < process.argv.length; index += 2) {
  const key = process.argv[index].replace(/^--/, "");
  options[key] = typeof options[key] === "number" ? Number(process.argv[index + 1]) : process.argv[index + 1];
}
const { chromium } = await import(pathToFileURL(process.env.EASEL_PLAYWRIGHT_MODULE || path.join(root, "node_modules/playwright/index.mjs")).href);
const members = [];
const index = JSON.parse(fs.readFileSync(path.join(library, "catalog.json"), "utf8"));
for (const entry of index.libraries) {
  const manifest = JSON.parse(fs.readFileSync(path.join(library, entry.host, "manifest.json"), "utf8"));
  for (const declared of manifest.client?.interfaces || []) {
    if (!declared["http-entry"]) continue;
    members.push({
      id: "easel." + entry.host + "." + declared.name,
      host: "easel." + entry.host,
      url: "/library/" + entry.host + "/" + declared["http-entry"],
      requires: declared.required?.interfaces || [],
      definition: JSON.parse(fs.readFileSync(path.join(library, entry.host, declared.file), "utf8")),
    });
  }
}
const types = { ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp" };
const page = `<!doctype html><html data-theme="${options.theme}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Easel kit preview</title><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/page.css"></head><body><main id="root"></main></body></html>`;
const server = http.createServer((request, response) => {
  const url = new URL(request.url, "http://localhost");
  let file = null;
  if (url.pathname === "/") {
    response.setHeader("content-type", "text/html");
    response.setHeader("content-security-policy", "style-src 'self'");
    return response.end(page);
  }
  if (url.pathname === "/page.css") {
    response.setHeader("content-type", "text/css");
    return response.end("html,body{height:100%;margin:0}#root{height:100%;display:flex}#root>*{flex:1;min-width:0}");
  }
  if (url.pathname === "/style.css") file = path.join(root, "server/easel/templates/css/style.css");
  else if (url.pathname === "/runtime.mjs") file = path.join(root, "server/easel/modules/runtime.mjs");
  else if (url.pathname.startsWith("/modules/pixi/")) file = path.join(pixiRoot, decodeURIComponent(url.pathname.slice("/modules/pixi/".length)));
  else if (url.pathname.startsWith("/library/")) file = path.join(library, decodeURIComponent(url.pathname.slice("/library/".length)));
  else if (url.pathname.startsWith("/stories/")) file = path.join(root, "scripts/stories", decodeURIComponent(url.pathname.slice("/stories/".length)));
  else if (url.pathname.startsWith("/packages/")) file = path.join(root, "server/easel", decodeURIComponent(url.pathname.slice("/packages/".length)));
  if (!file || !path.resolve(file).startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    response.statusCode = 404;
    return response.end();
  }
  response.setHeader("content-type", types[path.extname(file)] || "application/octet-stream");
  response.end(fs.readFileSync(file));
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--enable-webgl", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const errors = [];
try {
  const context = await browser.newContext({ viewport: { width: options.width, height: options.height }, deviceScaleFactor: 1 });
  const tab = await context.newPage();
  tab.on("pageerror", (error) => errors.push("pageerror: " + error.message + "\n" + (error.stack || "").split("\n").slice(0, 4).join("\n")));
  tab.on("console", (message) => {
    if (message.type() === "error") errors.push("console: " + message.text());
  });
  await tab.addInitScript(() => {
    globalThis.cspViolations = [];
    document.addEventListener("securitypolicyviolation", (event) => globalThis.cspViolations.push(event.violatedDirective + " " + event.sourceFile + ":" + event.lineNumber));
  });
  await tab.goto("http://127.0.0.1:" + server.address().port);
  await tab.evaluate(
    async ({ members, pixi, story }) => {
      const { createInterfaces, createComponents } = await import("/runtime.mjs");
      const registry = createInterfaces();
      registry.loader((url) => import(url));
      registry.define("easel.graphics.pixi@1", pixi);
      registry.lazy("easel.graphics.pixi@1", "easel.graphics.pixi", "/modules/pixi/client/pixi.mjs");
      for (const member of members) {
        registry.define(member.id, member.definition);
        registry.lazy(member.id, member.host, member.url, member.requires);
      }
      registry.close([]);
      const components = createComponents(registry, document.getElementById("root"));
      globalThis.Easel = { Interfaces: registry.api, Components: components.api };
      const module = await import("/stories/" + story + ".mjs");
      globalThis.story = await module.default({ Easel: globalThis.Easel });
    },
    { members, pixi: JSON.parse(fs.readFileSync(path.join(pixiRoot, "interfaces/pixi.json"), "utf8")), story: options.story },
  );
  await tab.waitForTimeout(options.wait);
  const steps = path.join(root, "scripts/stories", options.story + ".steps.mjs");
  if (fs.existsSync(steps)) {
    const module = await import(pathToFileURL(steps).href);
    await module.default(tab, { shot: (name) => tab.screenshot({ path: path.join(root, name) }) });
  }
  await tab.screenshot({ path: path.join(root, options.out) });
  const violations = await tab.evaluate(() => globalThis.cspViolations);
  for (const violation of violations.slice(0, 5)) errors.push("csp: " + violation);
  console.log("saved " + options.out);
} catch (error) {
  errors.push("script: " + error.message);
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
for (const error of errors) console.log(error);
