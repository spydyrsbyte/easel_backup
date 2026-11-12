import story from "./map.mjs";

export default async function gm(context) {
  globalThis.storyMode = "gm";
  return story(context);
}
