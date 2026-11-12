export async function sampleScene(base = "/packages/modules/vtt/client/samples/") {
  const scene = await (await fetch(base + "tavern.json")).json();
  const map = {
    size: scene.size,
    movementSnap: "grid",
    placementSnap: "grid",
    fogEnabled: true,
    layers: [
      {
        id: "ground",
        type: "ground",
        name: "Ground floor",
        visible: true,
        height: 0,
        image: { ref: base + scene.image, position: { x: 0, y: 0 }, size: scene.size },
        alphaMask: null,
        grid: scene.grid,
        ambient: scene.ambient,
        gmBrightness: 0.55,
        children: [
          { id: "objects", type: "object", name: "Objects", visible: true, shape: null, items: [] },
          { id: "walls", type: "wall", name: "Walls", visible: true, shape: null, items: [...scene.walls, ...scene.doors, ...scene.columns] },
          { id: "tokens", type: "token", name: "Tokens", visible: true, shape: null, items: [] },
          { id: "lights", type: "light", name: "Lights", visible: true, shape: null, items: scene.lights },
          { id: "drawings", type: "drawing", name: "Drawings", visible: true, shape: null, items: [] },
        ],
      },
    ],
  };
  const tokens = scene.tokens.map((token, index) => ({
    id: "token-" + index,
    name: token.name,
    image: base + token.image,
    x: token.x,
    y: token.y,
    width: 100,
    height: 100,
    disposition: token.disposition,
    hidden: !!token.hidden,
    controllable: !!token.player,
    bars: token.disposition === "hostile" ? [{ value: 6 + index, max: 14 }] : token.player ? [{ value: 22 - index * 5, max: 24 }] : [],
    light: token.light ? { radius: token.light, color: "#bfe0ff" } : null,
  }));
  return { scene, map, tokens };
}
