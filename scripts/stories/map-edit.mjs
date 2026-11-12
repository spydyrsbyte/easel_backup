import story from "./map.mjs";

export default async function edit(context) {
  globalThis.storyMode = "edit";
  return story(context);
}
