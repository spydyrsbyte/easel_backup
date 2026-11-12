export function safeImage(url) {
  if (!url || typeof url !== "string") return "";
  const trimmed = url.trim();
  if (/^(https?:\/\/|\/|data:image\/(png|jpeg|webp|gif|svg\+xml);base64,)/i.test(trimmed)) {
    return trimmed;
  }
  return "";
}

export function element(tag, className = "", text = "") {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined && text !== "") el.textContent = String(text);
  return el;
}
