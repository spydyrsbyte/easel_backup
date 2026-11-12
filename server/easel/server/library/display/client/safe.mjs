export function element(tag, classes = "", text) {
  const node = document.createElement(tag);
  if (classes) node.className = classes;
  if (text !== undefined) node.textContent = String(text);
  return node;
}
export function safeImage(src) {
  if (typeof src !== "string" || !src) return "";
  try {
    const url = new URL(src, document.baseURI);
    return ["https:", "http:", "blob:"].includes(url.protocol) ||
      (url.protocol === "data:" &&
        /^data:image\/(png|jpeg|webp|gif);/i.test(src))
      ? url.href
      : "";
  } catch {
    return "";
  }
}
