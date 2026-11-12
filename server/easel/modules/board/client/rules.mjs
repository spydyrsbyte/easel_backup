const inside = (x, y) => x >= 0 && y >= 0 && x < 8 && y < 8;
const DIAGONALS = [
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
];
const STRAIGHTS = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
];
const KNIGHT = [
  [1, 2],
  [2, 1],
  [-1, 2],
  [-2, 1],
  [1, -2],
  [2, -1],
  [-1, -2],
  [-2, -1],
];

function forwardOnly(piece, dy) {
  return piece.kind === "king" || (piece.side === "white" ? dy === -1 : dy === 1);
}

export function jumps(squares, index) {
  const piece = squares[index];
  const result = [];
  if (!piece?.side) return result;
  for (const [dx, dy] of DIAGONALS) {
    const x = piece.x + dx * 2;
    const y = piece.y + dy * 2;
    if (!inside(x, y) || !forwardOnly(piece, dy)) continue;
    const middle = squares[(piece.y + dy) * 8 + piece.x + dx];
    if (!squares[y * 8 + x].side && middle.side && middle.side !== piece.side) result.push(y * 8 + x);
  }
  return result;
}

function checkers(match, index) {
  const squares = match.squares;
  const piece = squares[index];
  if (match.chain >= 0 && match.chain !== index) return [];
  const own = jumps(squares, index);
  if (own.length || match.chain >= 0) return own;
  if (squares.some((entry, other) => entry.side === piece.side && jumps(squares, other).length)) return [];
  const result = [];
  for (const [dx, dy] of DIAGONALS) {
    const x = piece.x + dx;
    const y = piece.y + dy;
    if (inside(x, y) && forwardOnly(piece, dy) && !squares[y * 8 + x].side) result.push(y * 8 + x);
  }
  return result;
}

function chess(match, index) {
  const squares = match.squares;
  const piece = squares[index];
  const result = [];
  const step = (dx, dy, far) => {
    let x = piece.x + dx;
    let y = piece.y + dy;
    while (inside(x, y)) {
      const target = squares[y * 8 + x];
      if (target.side === piece.side) break;
      result.push(y * 8 + x);
      if (target.side || !far) break;
      x += dx;
      y += dy;
    }
  };
  if (piece.kind === "knight") for (const [dx, dy] of KNIGHT) step(dx, dy, false);
  else if (piece.kind === "king") for (const [dx, dy] of [...DIAGONALS, ...STRAIGHTS]) step(dx, dy, false);
  else if (piece.kind === "rook") for (const [dx, dy] of STRAIGHTS) step(dx, dy, true);
  else if (piece.kind === "bishop") for (const [dx, dy] of DIAGONALS) step(dx, dy, true);
  else if (piece.kind === "queen") for (const [dx, dy] of [...DIAGONALS, ...STRAIGHTS]) step(dx, dy, true);
  else if (piece.kind === "pawn") {
    const forward = piece.side === "white" ? -1 : 1;
    const home = piece.side === "white" ? 6 : 1;
    const one = piece.y + forward;
    if (inside(piece.x, one) && !squares[one * 8 + piece.x].side) {
      result.push(one * 8 + piece.x);
      const two = one + forward;
      if (piece.y === home && !squares[two * 8 + piece.x].side) result.push(two * 8 + piece.x);
    }
    for (const dx of [-1, 1]) {
      const x = piece.x + dx;
      if (!inside(x, one)) continue;
      const target = squares[one * 8 + x];
      if (target.side && target.side !== piece.side) result.push(one * 8 + x);
    }
  }
  return result;
}

export function targets(match, index) {
  const piece = match?.squares?.[index];
  if (!piece?.side || piece.side !== match.turn || match.winner) return [];
  return match.game === "chess" ? chess(match, index) : checkers(match, index);
}

export const squareName = (index) => "abcdefgh"[index % 8] + (8 - Math.floor(index / 8));

const LETTERS = { king: "K", queen: "Q", rook: "R", bishop: "B", knight: "N", pawn: "" };
export const VALUES = { pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9, king: 0, checker: 1 };

export function notation(match) {
  const moves = [];
  for (const [index, move] of (match.history || []).entries()) {
    const column = move.side === "white" ? 0 : 1;
    const taken = !!move.taken;
    if (match.game === "chess") {
      const known = Object.hasOwn(LETTERS, move.piece || "");
      const letter = known ? LETTERS[move.piece] : "";
      const text = !known ? squareName(move.from) + "–" + squareName(move.to) : (letter || (taken ? squareName(move.from)[0] : "")) + (taken ? "x" : "") + squareName(move.to) + (move.promoted ? "=Q" : "") + (move.taken === "king" ? "#" : "");
      moves.push({ id: String(index), column, text, side: move.side, piece: move.piece || "", title: squareName(move.from) + " to " + squareName(move.to) });
      continue;
    }
    const jumped = taken || Math.abs((move.from % 8) - (move.to % 8)) === 2;
    const before = moves[moves.length - 1];
    if (before && before.side === move.side && jumped) {
      before.text += "x" + squareName(move.to) + (move.promoted ? " K" : "");
      before.id = String(index);
      continue;
    }
    moves.push({ id: String(index), column, side: move.side, text: squareName(move.from) + (jumped ? "x" : "–") + squareName(move.to) + (move.promoted ? " K" : "") });
  }
  return moves;
}
