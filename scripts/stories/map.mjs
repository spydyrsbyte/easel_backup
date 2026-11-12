import { sampleScene } from "./sample.mjs";

export default async function story({ Easel }) {
  const mode = new URLSearchParams(location.search).get("mode") || globalThis.storyMode || "player";
  await Easel.Interfaces.load("easel.maps.map@2");
  const { map, tokens } = await sampleScene();
  const gm = mode !== "player";
  const component = Easel.Components.create("easel.maps.map@2", {
    id: "map",
    props: {
      map,
      sceneKey: "tavern",
      tokens: tokens.filter((token) => gm || !token.hidden),
      gm,
      editing: mode === "edit",
      tool: mode === "edit" ? "wall" : "select",
      selectedTokenIds: ["token-1"],
      pings: mode === "player" ? [{ id: "p1", x: 900, y: 1000, color: "#43d9c0" }] : [],
    },
  });
  globalThis.mapEvents = [];
  for (const name of ["tokenSelect", "tokenMove", "mapChange", "select", "doorToggle", "ping", "context", "drop", "notice"]) component.on(name, (payload) => globalThis.mapEvents.push({ name, payload }));
  component.on("tokenSelect", ({ ids }) => component.setProps({ selectedTokenIds: ids }));
  component.on("tokenMove", ({ id, x, y }) => component.setProps({ tokens: component.props.tokens.map((token) => (token.id === id ? { ...token, x, y } : token)) }));
  Easel.Components.mountRoot(component);
  return "ok";
}
