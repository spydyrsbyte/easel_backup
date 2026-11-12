export const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

export const button = (text, className, handler) => {
  const node = el("button", className, text);
  node.type = "button";
  node.addEventListener("click", handler);
  return node;
};

export const icon = (path) => {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.6");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("nav-icon");
  const shape = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "path",
  );
  shape.setAttribute("d", path);
  svg.append(shape);
  return svg;
};
