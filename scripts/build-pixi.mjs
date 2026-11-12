import { build } from "esbuild";
import fs from "node:fs/promises";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "..");
const target = path.join(root, "server/easel/modules/pixi/client/vendor");
await fs.mkdir(target, { recursive: true });
try {
  await build({
    stdin: {
      contents:
        'import "pixi.js/unsafe-eval"; export { Application, Container, Graphics, Text, Sprite, Assets, RenderTexture, ColorMatrixFilter, BlurFilter, AlphaFilter, Mesh, Geometry, MeshGeometry, Shader, TilingSprite, Rectangle, Texture, Matrix, Point, Polygon } from "pixi.js";',
      resolveDir: root,
      sourcefile: "pixi-entry.mjs",
    },
    outfile: path.join(target, "pixi.mjs"),
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    minify: true,
    legalComments: "eof",
    logLevel: "silent",
  });
} catch {
  const distMjs = await fs.readFile(
    path.join(root, "node_modules/pixi.js/dist/pixi.min.mjs"),
    "utf8",
  );
  const unsafeEval = await fs.readFile(
    path.join(root, "node_modules/pixi.js/dist/packages/unsafe-eval.min.js"),
    "utf8",
  );
  const sourceMapPattern = new RegExp("\\x2f\\x2f# sourceMappingURL=.*$", "m");
  const bannerPattern = new RegExp("^\\x2f\\*![\\s\\S]*?\\*\\x2f");
  const stripped = distMjs.replace(sourceMapPattern, "").trimEnd();
  const unsafeBody = unsafeEval
    .replace(bannerPattern, "")
    .replace(sourceMapPattern, "")
    .replace(/^this\.PIXI=this\.PIXI\|\|\{\};/, "")
    .replace(/Object\.assign\(this\.PIXI,unsafe_eval_js\);?\s*$/, "")
    .trim();
  const bridge =
    "const PIXI={AbstractRenderer:Fr,UboSystem:Oh,GlUniformGroupSystem:Xh,GlUboSystem:Bh,GpuUboSystem:ic,GlShaderSystem:Nh,ParticleBuffer:ST,uniformParsers:yr,UniformGroup:Et,BufferResource:co,TextureSource:ht,TextureView:n0,TextureStyle:le,getAttributeInfoFromFormat:Be,Geometry:hr,Buffer:Zt,BufferUsage:it,WGSL_TO_STD40_SIZE:Gh,WGSL_ALIGN_SIZE_DATA:ii};" +
    unsafeBody +
    "Object.assign(ST.prototype,{generateParticleUpdate:unsafe_eval_js.generateParticleUpdatePolyfill});";
  await fs.writeFile(
    path.join(target, "pixi.mjs"),
    `${stripped}\n${bridge}\n`,
    "utf8",
  );
}
await fs.copyFile(
  path.join(root, "node_modules/pixi.js/LICENSE"),
  path.join(target, "LICENSE"),
);

