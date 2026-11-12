import { copy, list, integer, key, unique } from "./support.mjs";
import { shuffled } from "./random.mjs";
export default class DeckTool {
  draw(members, count = 1) {
    list(members);
    integer(count, 0, members.length);
    return {
      drawn: copy(members.slice(0, count)),
      remaining: copy(members.slice(count)),
    };
  }
  insert(members, added, where = "top") {
    list(members);
    list(added);
    if (!["top", "bottom"].includes(where)) throw new Error("Unknown deck end");
    return copy(
      where === "top" ? [...added, ...members] : [...members, ...added],
    );
  }
  deal(members, players, count = 1) {
    list(members);
    unique(list(players).map(key));
    integer(count, 0, 1000);
    if (players.length * count > members.length)
      throw new Error("Not enough cards");
    const hands = Object.fromEntries(players.map((p) => [p, []]));
    let i = 0;
    for (let n = 0; n < count; n++)
      for (const p of players) hands[p].push(copy(members[i++]));
    return { hands, remaining: copy(members.slice(i)) };
  }
  shuffle(members, source) {
    return shuffled(members, source);
  }
}
