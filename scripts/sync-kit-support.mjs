import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(
  new URL("../server/easel/server/library/", import.meta.url),
);
const catalog = JSON.parse(
  fs.readFileSync(path.join(root, "catalog.json"), "utf8"),
);
for (const kit of catalog.libraries) {
  for (const [side, source, files] of [
    ["client", "client", ["base.mjs", "safe.mjs", "kit.css", "ui.mjs"]],
    [
      "server",
      "game",
      ["support.mjs", "random.mjs", "spatial.mjs", "network.mjs"],
    ],
  ]) {
    const dir = path.join(root, kit.host, side);
    if (!fs.existsSync(dir)) continue;
    for (const file of files) {
      const data = fs.readFileSync(path.join(root, source, file));
      const target = path.join(dir, file);
      if (!fs.existsSync(target) || !fs.readFileSync(target).equals(data))
        fs.writeFileSync(target, data);
    }
  }
}
for (const target of ["../server/easel/modules/vtt/client/", "../server/easel/modules/board/client/"]) {
  const dir = fileURLToPath(new URL(target, import.meta.url));
  if (!fs.existsSync(dir)) continue;
  for (const file of ["ui.mjs", "kit.css"]) {
    const data = fs.readFileSync(path.join(root, "client", file));
    const destination = path.join(dir, file);
    if (!fs.existsSync(destination) || !fs.readFileSync(destination).equals(data)) fs.writeFileSync(destination, data);
  }
}