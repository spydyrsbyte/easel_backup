const TERM = /^(\d*)d(\d+|%)(?:(kh|kl|dh|dl)(\d+))?$/i;

function parse(expression) {
  const text = String(expression ?? "").replace(/\s+/g, "");
  if (!text || text.length > 120) throw new RangeError("A dice formula needs between 1 and 120 characters.");
  const terms = [];
  const pattern = /([+-]?)([^+-]+)/g;
  let match;
  let consumed = 0;
  while ((match = pattern.exec(text))) {
    consumed += match[0].length;
    const sign = match[1] === "-" ? -1 : 1;
    const body = match[2];
    const dice = TERM.exec(body);
    if (dice) {
      const count = dice[1] === "" ? 1 : Number(dice[1]);
      const sides = dice[2] === "%" ? 100 : Number(dice[2]);
      if (!Number.isInteger(count) || count < 1 || count > 100) throw new RangeError("Roll between 1 and 100 dice at a time.");
      if (!Number.isInteger(sides) || sides < 2 || sides > 1000) throw new RangeError("Dice have between 2 and 1000 sides.");
      const keep = dice[3] ? { rule: dice[3].toLowerCase(), amount: Number(dice[4]) } : null;
      if (keep && (keep.amount < 1 || keep.amount >= count + (keep.rule[0] === "k" ? 1 : 0))) throw new RangeError("That keeps or drops more dice than are rolled.");
      terms.push({ sign, count, sides, keep });
    } else if (/^\d+$/.test(body)) terms.push({ sign, value: Number(body) });
    else throw new TypeError("\"" + body + "\" is not dice or a number.");
  }
  if (consumed !== text.length || !terms.length) throw new TypeError("That is not a dice formula.");
  if (terms.length > 20) throw new RangeError("A dice formula has at most 20 terms.");
  return terms;
}

export default class Formula {
  parse(expression) {
    return parse(expression);
  }

  roll(expression, source) {
    const random = source ?? Easel.Random;
    const terms = parse(expression);
    const dice = [];
    let total = 0;
    for (const term of terms) {
      if (term.value !== undefined) {
        total += term.sign * term.value;
        continue;
      }
      const rolled = [];
      for (let index = 0; index < term.count; index++) rolled.push({ sides: term.sides, value: random.integer(1, term.sides + 1), dropped: false });
      if (term.keep) {
        const order = [...rolled].sort((a, b) => a.value - b.value);
        const { rule, amount } = term.keep;
        const dropped = rule === "kh" ? order.slice(0, term.count - amount) : rule === "kl" ? order.slice(amount) : rule === "dl" ? order.slice(0, amount) : order.slice(term.count - amount);
        for (const die of dropped) die.dropped = true;
      }
      for (const die of rolled) {
        if (!die.dropped) total += term.sign * die.value;
        dice.push(term.sign < 0 ? { ...die, negative: true } : die);
      }
    }
    return { formula: String(expression).replace(/\s+/g, ""), total, dice };
  }
}
