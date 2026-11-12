import fs from "node:fs";

for (const file of process.argv.slice(2)) {
  const text = fs.readFileSync(file, "utf8");
  const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  fs.writeFileSync(file, JSON.stringify(JSON.parse(clean), null, 2) + "\n");
}
