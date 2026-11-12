import { copy, list, record, number, integer, point } from "./support.mjs";

export default class GridTool {
  measureDistance5105(points, feetPerSquare = 5) {
    list(points);
    number(feetPerSquare);
    if (points.length < 2) {
      return { feet: 0, totalSquares: 0, diagonals: 0, straights: 0 };
    }

    let totalDiagonals = 0;
    let totalStraights = 0;

    for (let i = 0; i < points.length - 1; i++) {
      const p1 = point(points[i]);
      const p2 = point(points[i + 1]);
      const dx = Math.abs(p2.x - p1.x);
      const dy = Math.abs(p2.y - p1.y);
      const diag = Math.min(dx, dy);
      const straight = Math.abs(dx - dy);
      totalDiagonals += diag;
      totalStraights += straight;
    }

    const diagonalSquares = totalDiagonals + Math.floor(totalDiagonals / 2);
    const totalSquares = totalStraights + diagonalSquares;
    const feet = totalSquares * feetPerSquare;

    return {
      feet,
      totalSquares,
      diagonals: totalDiagonals,
      straights: totalStraights
    };
  }

  getThreatenedSquares({
    originX = 0,
    originY = 0,
    spaceSquares = null,
    reachSquares = null,
    spaceFeet = null,
    reachFeet = null,
    feetPerSquare = 5,
    isReachWeapon = false
  } = {}) {
    number(originX);
    number(originY);
    number(feetPerSquare);
    const resolvedSpace =
      spaceSquares !== null && spaceSquares !== undefined
        ? integer(spaceSquares, 1, 100)
        : spaceFeet !== null && spaceFeet !== undefined
        ? Math.max(1, Math.round(number(spaceFeet) / feetPerSquare))
        : 1;
    const resolvedReach =
      reachSquares !== null && reachSquares !== undefined
        ? integer(reachSquares, 0, 100)
        : reachFeet !== null && reachFeet !== undefined
        ? Math.max(0, Math.round(number(reachFeet) / feetPerSquare))
        : 1;

    if (resolvedReach === 0) return [];

    const effectiveReach = isReachWeapon ? resolvedReach * 2 : resolvedReach;
    const deadZone = isReachWeapon ? resolvedReach : 0;

    const minX = originX - effectiveReach;
    const maxX = originX + resolvedSpace - 1 + effectiveReach;
    const minY = originY - effectiveReach;
    const maxY = originY + resolvedSpace - 1 + effectiveReach;

    const threatened = [];

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        let dx = 0;
        if (x < originX) dx = originX - x;
        else if (x >= originX + resolvedSpace) dx = x - (originX + resolvedSpace - 1);

        let dy = 0;
        if (y < originY) dy = originY - y;
        else if (y >= originY + resolvedSpace) dy = y - (originY + resolvedSpace - 1);

        const dist = Math.max(dx, dy);
        if (dist === 0) continue;

        if (dist > deadZone && dist <= effectiveReach) {
          threatened.push({ x, y });
        }
      }
    }

    return threatened;
  }

  rasterizeTemplate({
    shape = "burst",
    origin = { x: 0, y: 0 },
    direction = 0,
    radiusFeet = 15,
    feetPerSquare = 5
  } = {}) {
    record(origin);
    number(origin.x);
    number(origin.y);
    number(radiusFeet);
    number(feetPerSquare);
    number(direction);

    const radSq = Math.max(1, Math.round(radiusFeet / feetPerSquare));
    const squares = [];
    const normShape = String(shape).toLowerCase();

    if (
      normShape === "burst" ||
      normShape === "emanation" ||
      normShape === "circle"
    ) {
      for (let x = origin.x - radSq; x <= origin.x + radSq; x++) {
        for (let y = origin.y - radSq; y <= origin.y + radSq; y++) {
          const dx = Math.abs(x - origin.x);
          const dy = Math.abs(y - origin.y);
          const diag = Math.min(dx, dy);
          const straight = Math.abs(dx - dy);
          const distSq = straight + diag + Math.floor(diag / 2);
          if (distSq <= radSq) {
            squares.push({ x, y });
          }
        }
      }
    } else if (normShape === "line") {
      const rad = (direction * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      for (let s = 0; s <= radSq; s++) {
        const x = Math.round(origin.x + s * cos);
        const y = Math.round(origin.y + s * sin);
        if (!squares.some((sq) => sq.x === x && sq.y === y)) {
          squares.push({ x, y });
        }
      }
    } else if (normShape === "cone") {
      const rad = (direction * Math.PI) / 180;
      for (let x = origin.x - radSq; x <= origin.x + radSq; x++) {
        for (let y = origin.y - radSq; y <= origin.y + radSq; y++) {
          const dx = x - origin.x;
          const dy = y - origin.y;
          if (dx === 0 && dy === 0) continue;
          const dist = Math.hypot(dx, dy);
          if (dist <= radSq) {
            const angle = Math.atan2(dy, dx);
            let diff = Math.abs(angle - rad);
            while (diff > Math.PI) diff = Math.abs(diff - 2 * Math.PI);
            if (diff <= Math.PI / 4) {
              squares.push({ x, y });
            }
          }
        }
      }
    }

    return squares;
  }
}
