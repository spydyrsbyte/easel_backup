let messages = {};
export async function loadText() {
  messages = await (
    await fetch(new URL("./i18n/en.json", import.meta.url))
  ).json();
}
export function text(value) {
  if (value == null) return "";
  if (typeof value !== "object") return String(value);
  let result = messages[value.i18n] || value.i18n || "";
  for (const [key, item] of Object.entries(value.args || {}))
    result = result.replaceAll("{" + key + "}", text(item));
  return result;
}
