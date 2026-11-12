export const applicationName = (id) =>
  ({
    "easel.chess.game": "Chess",
    "easel.checkers.game": "Checkers",
    "easel.demo.table": "Demo table",
    "easel.mtg.game": "Magic: The Gathering",
    "easel.mtgtable.game": "MTG",
  })[id] || id;

export const element = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

export const control = (text, className, handler) => {
  const button = element("button", className, text);
  button.type = "button";
  button.addEventListener("click", handler);
  return button;
};
