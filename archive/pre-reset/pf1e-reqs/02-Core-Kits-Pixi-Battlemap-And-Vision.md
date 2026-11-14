# 02 — Core Kits: PixiJS Battlemap, Vision, Hindrances, & Scenes

> **Concern Tier:** 1 — Core Generic RP Kits (`Easel/server/easel/server/library/maps`, `visibility`, `graphics/pixi`)
> **Prerequisite Reading:** [`00-Architecture-Guardrails.md`](00-Architecture-Guardrails.md)

---

## 1. Overview & Purpose

This section upgrades the Core spatial and visibility Kits (`easel.maps` and `easel.visibility`) from their current minimal DOM placeholders to the full **multi-level battlemap, wall/door/column collision, rules-neutral hindrance/vision, and viewer-specific illusion architecture** from `_Easel`, while replacing `_Easel`'s legacy Godot WASM renderer and coarse 128px bitmap mask with **PixiJS v8 (`easel.graphics.pixi@1`)** for all `http-entry` components.

---

## 2. What It Is Pulling & Where From

| Target Brick | Source in `_Easel` / `Easel` | What to Pull & How to Upgrade |
|---|---|---|
| `easel.graphics.pixi@1` | [`Easel/server/easel/modules/pixi/client/pixi.mjs`](../Easel/server/easel/modules/pixi/client/pixi.mjs)<br>[`Easel/server/easel/modules/pixi/client/vendor/pixi.mjs`](../Easel/server/easel/modules/pixi/client/vendor/pixi.mjs) | Expose `RenderTexture`, `ColorMatrixFilter`, `BlurFilter`, `AlphaFilter`, `Mesh`, `Geometry`, and `TilingSprite` alongside `Application`, `Container`, `Graphics`, `Text`, `Sprite`, `Assets` from `./vendor/pixi.mjs`. |
| `easel.maps.geometry@1` *(server)* | [`_Easel/Praxis/modules/rpgkit/0.1.0/client/battlemap.js`](../_Easel/Praxis/modules/rpgkit/0.1.0/client/battlemap.js) | Pull the multi-level `ground` stack model (`createGround`, `createLayer`, `groundStack`, `visibleStack`, `battleView`, `unitsPerPixel`), wall/door/column definitions, polygon containment (`insidePolygon`), and `movementBlocked(walls, from, to, size)` with the **80% token body radius** (`BODY_ALLOWANCE = 0.8`, `bodyRadius = 0.4 * min(w, h)`). |
| `easel.maps.vision@1` *(server)* | [`_Easel/Praxis/modules/rpgkit/0.1.0/client/vision.js`](../_Easel/Praxis/modules/rpgkit/0.1.0/client/vision.js)<br>[`_Easel/Praxis/modules/rpgkit/0.1.0/vision.js`](../_Easel/Praxis/modules/rpgkit/0.1.0/vision.js)<br>[`_Easel/tests/rpgkit-vision.test.js`](../_Easel/tests/rpgkit-vision.test.js) | Pull `VisionRegistry`, built-in removable `wall` hindrance and `SIGHT` preset, `angleMatches`, `hindrance` (`Math.min` most-permissive per object), `combineHindrances`, `effectiveDistance` (`multiplier /= 1 - hindrance` compounding across objects), `detailAt` (smoothstep fade from `range.depth` to `range.maximum` + `luminance` gating), `inFieldOfView` (`fov`, `facing`, `blind`), and 9-point token footprint admission. |
| `easel.visibility.projection@1` *(server)* | [`_Easel/Praxis/modules/rpgkit/0.1.0/VISION.md`](../_Easel/Praxis/modules/rpgkit/0.1.0/VISION.md)<br>[`_Easel/Praxis/modules/rpgkit/0.1.0/vision.js`](../_Easel/Praxis/modules/rpgkit/0.1.0/vision.js) | Pull viewer-specific pre-filter presentation overrides (`{opacity, luminance: {strength, hue}, types}`), so game rules can strip `types: ['wall']` and lower `opacity` for a viewer who disbelieved an illusion *before* visibility filtering runs. Include per-`(map, revision, viewer)` caching, stripping `visionMask`/`presentation` at save boundaries, and delta calculation. |
| `easel.maps.map@1` & `easel.maps.fog@1` *(client)* | [`_Easel/Praxis/modules/rpgkit/0.1.0/BATTLEMAP_EDITOR.md`](../_Easel/Praxis/modules/rpgkit/0.1.0/BATTLEMAP_EDITOR.md)<br>[`_Easel/Praxis/modules/rpgkit/0.1.0/client/board.js`](../_Easel/Praxis/modules/rpgkit/0.1.0/client/board.js)<br>[`_Easel/Praxis/modules/rpgkit/0.1.0/client/mapfile.js`](../_Easel/Praxis/modules/rpgkit/0.1.0/client/mapfile.js) | Build the `http-entry` using **PixiJS v8** (`easel.graphics.pixi@1`): renders the `ground` stack with `alphaMask` cutaways, `object`/`drawing`/`wall`/`token`/`light`/`roof` layers, GPU vector visibility polygons & `ColorMatrixFilter` (`saturation: 0` darkvision), persistent explored Fog of War `RenderTexture`, clickable door icons, live 80%-body-radius drag collision preview, 2-click **Line up grid** calibration, and `.map` zip import/export. |
| `easel.maps.template@1` *(server & client)* | [`_referenceOnly/Data/systems/pf1`](../_referenceOnly/Data/systems/pf1) (measured templates) | Server geometry + PixiJS overlay for `circle`/`burst`, `cone` (90°/60°), `ray`/`line`, and `rect` AoE templates, returning covered grid cells and tokens. |
| `easel.maps.shadowbox@1` & `easel.maps.worldmap@1` *(client)* | [`_Easel/docs/RPGKIT_INTERFACES.md`](../_Easel/docs/RPGKIT_INTERFACES.md)<br>[`_Easel/Praxis/modules/rpgkit/0.1.0/interfaces/shadow-box-definition.json`](../_Easel/Praxis/modules/rpgkit/0.1.0/interfaces/shadow-box-definition.json)<br>[`world-map-definition.json`](../_Easel/Praxis/modules/rpgkit/0.1.0/interfaces/world-map-definition.json) | Build `http-entry` with PixiJS v8: `shadowbox@1` renders a 16:9 stage with group hierarchy, tint/saturation/contrast/luminance/chroma-key filters, `Speak` dialogue boxes, GM `ToggleElements`, and `.box` zip files; `worldmap@1` renders draggable/zoomable overland image tiles with linked location pins. |

---

## 3. How to Build Each Piece

### 3.1 Expand `easel.graphics.pixi@1`
- **File**: `Easel/server/easel/modules/pixi/client/pixi.mjs`
- Re-export `RenderTexture`, `ColorMatrixFilter`, `BlurFilter`, `AlphaFilter`, `Mesh`, `MeshGeometry`, `Shader`, `TilingSprite`, and `Rectangle` from `./vendor/pixi.mjs` so any map/dice/surface component requiring `easel.graphics.pixi@1` can construct GPU masks and filters without importing vendor files directly.

### 3.2 Server Vision, Hindrance, & Geometry (`easel.maps.geometry@1`, `easel.maps.vision@1`, `easel.visibility.projection@1`)
- **`Easel/server/easel/server/library/maps/server/geometry.mjs`**:
  - Keep `distance(a, b)`, `lineOfSight(a, b, walls)`, `contains(value, polygon)`, `area(polygon)`.
  - Add `bodyRadius(size)`, `movementBlocked(walls, from, to, size)` (handling closed walls, closed doors, circular columns, 80% body allowance, and stepping away when stuck), `groundStack(map, groundId)`, and `visibleStack(map, groundId, tokens)`.
- **`Easel/server/easel/server/library/maps/server/vision.mjs`**:
  - Keep `visible(observer, targets, options)` and `polygon(observer, options)`.
  - Add `register({hindrances, presets})`, `hindrance(vision, visibility, angle, typesOverride)`, `combineHindrances(values)`, `effectiveDistance(distance, crossings)`, `detailAt(vision, distance, luminance)`, and `evaluateScene(scene, {hindrances, presets, fallback})` which computes per-observer visibility, illumination (blocked by physical wall segments), and 9-point token footprint visibility.
- **`Easel/server/easel/server/library/visibility/server/projection.mjs`**:
  - Keep existing `project(state, viewer, rules)` method.
  - Add `projectBattlemap(map, viewer, {onTokenDraw, visionConfig})`:
    1. Strips any incoming `visionMask` or `presentation` fields (guaranteeing viewer-only state never leaks into saved map data).
    2. Resolves the active `groundStack` and runs `onTokenDraw(token, viewer)` on candidate tokens before visibility filtering.
    3. Evaluates `vision@1` to filter out unseen tokens on fog-enabled maps and returns `{ scene, tokens, visionPolygons, lightSources }` tailored to `viewer`.

### 3.3 Client PixiJS Battlemap (`easel.maps.map@1` & `easel.maps.fog@1`)
- **Manifest Requirement**: In `Easel/server/easel/server/library/maps/manifest.json`, add `"required": {"modules": ["easel.graphics.pixi"], "interfaces": ["easel.graphics.pixi@1"]}` to `map@1`, `fog@1`, `template@1`, `shadowbox@1`, and `worldmap@1`.
- **Scene Graph Structure inside `easel.maps.map@1`**:
  1. `worldContainer` (pan, pointer-anchored wheel zoom, rotation):
     - `lowerGroundsContainer`: renders `object` art of lower `ground` levels masked by the upper ground's `alphaMask` sprite + subtle depth-darkening filter.
     - `activeGroundContainer`:
       - `groundSprite` (map background art) + `gridGraphics` (square, hex-flat, hex-pointy, or hidden; supports live 2-click **Line up grid** calibration).
       - `objectLayerContainer` (props/tiles with `alphaMask` and `lightMask`).
       - `drawingLayerContainer` (vector polygons/freehand strokes).
       - `tokenLayerContainer` (token sprites, selection rings, HP bars, condition badges, and ghost drag-preview with red collision highlight when `movementBlocked` triggers).
       - `roofLayerContainer` (smoothly tweens `alpha` to `0` when an observer token is inside the roof's `shape` polygon).
       - `lightingAndFogContainer` (Pixi `RenderTexture` blending unexplored black fog, dimmed explored fog memory, crisp vector wall/column shadow polygons per observer sense, and `ColorMatrixFilter` `saturation: 0` for darkvision regions).
       - `wallControlsContainer` (visible in GM edit mode + interactive door toggle icons in play mode).
       - `templatesAndRulerContainer` (slotted overlays for `template@1` and `ruler@1`).
  2. DOM `slots.objects` and `slots.overlay` synchronized with `worldContainer` transform for HTML popovers/HUDs.
- **Emitted Local Events**:
  - `cameraChanged`, `tokenSelect`, `tokenMoveRequest` (`{tokenId, groundId, from, to}`), `doorToggleRequest` (`{wallId, open}`), `gridCalibrated` (`{size, offset}`), `mapEditChange`, `exportMap`, `importMap`.

---

## 4. Anti-Spaghetti Guardrails for Section 02

- **DO NOT** resurrect the Godot WASM build (`godot.wasm`/`godot.pck`). All browser rendering uses `easel.graphics.pixi@1`.
- **DO NOT** bake PF1e rules (like darkvision = 60 ft or 5-10-5 diagonals) into `easel.maps`. Keep `easel.maps` 100% rules-neutral; games pass their `hindrances`, `presets`, and distance metric via props/arguments.
- **DO NOT** allow `visionMask` or `presentation` to be saved in map definitions—strip them in `projection@1` and validate in tests (just like [`_Easel/tests/rpgkit-vision.test.js` line 21](../_Easel/tests/rpgkit-vision.test.js#L21-L44)).
- **DO NOT** send unseen tokens to the browser and merely hide them with `alpha: 0` on fog-enabled maps; unseen tokens must be filtered out on the server by `projection@1` / `vision@1`.

---

## 5. Verification

```powershell
node --test scripts/test-kits.mjs scripts/test-client.mjs
go test ./internal/session -run Kit
node scripts/test-kit-browser.mjs
```
Port the unit test cases from [`_Easel/tests/rpgkit-vision.test.js`](../_Easel/tests/rpgkit-vision.test.js) and [`_Easel/tests/rpgkit-battlemap.test.js`](../_Easel/tests/rpgkit-battlemap.test.js) into `scripts/test-kits.mjs` so every hindrance, compounding distance, illusion disbelief, ground stack, and 80% doorway collision case is verified automatically.
