import story from "./shadowbox.mjs";

export default async function edit(context) {
  globalThis.storyMode = "edit";
  return story(context);
}
