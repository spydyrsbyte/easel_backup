import { bounded, key, number, record } from "./support.mjs";
const MAX_DEPTH = 64;
const ARITIES = {
  floor: [1, 1],
  ceil: [1, 1],
  round: [1, 1],
  trunc: [1, 1],
  abs: [1, 1],
  sign: [1, 1],
  sqrt: [1, 1],
  pow: [2, 2],
  min: [1, Infinity],
  max: [1, Infinity],
  clamp: [3, 3],
  ifelse: [3, 3],
  if: [2, 3],
  lookup: [2, Infinity],
  eq: [2, 2],
  ne: [2, 2],
  lt: [2, 2],
  lte: [2, 2],
  gt: [2, 2],
  gte: [2, 2],
  and: [1, Infinity],
  or: [1, Infinity],
  xor: [1, Infinity],
  not: [1, 1],
};
function ownPath(obj, name) {
  let cur = obj;
  for (const seg of String(name).split(".")) {
    if (
      cur === null ||
      cur === undefined ||
      typeof cur !== "object" ||
      !Object.prototype.hasOwnProperty.call(cur, seg)
    )
      return undefined;
    cur = cur[seg];
  }
  return cur;
}
function tokenize(expression) {
  if (typeof expression !== "string" || !expression.trim())
    throw new TypeError("Expected a nonempty formula string");
  const tokens = [];
  let i = 0;
  while (i < expression.length) {
    const ch = expression[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(expression[i + 1] ?? ""))) {
      const m = expression.slice(i).match(/^(?:[0-9]+(?:\.[0-9]+)?|\.[0-9]+)/);
      if (!m) throw new SyntaxError("Invalid number token");
      const nextCh = expression[i + m[0].length] ?? "";
      if (/[A-Za-z_.]/.test(nextCh))
        throw new SyntaxError("Invalid trailing characters after number");
      tokens.push({ type: "num", value: number(Number(m[0])) });
      i += m[0].length;
      continue;
    }
    if (ch === "@") {
      const m = expression.slice(i).match(/^@([A-Za-z_][A-Za-z0-9_.]*)/);
      if (!m || m[1].endsWith(".") || m[1].includes(".."))
        throw new SyntaxError("Invalid variable reference");
      for (const seg of m[1].split(".")) key(seg);
      tokens.push({ type: "var", name: m[1] });
      i += m[0].length;
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      const m = expression.slice(i).match(/^[A-Za-z_][A-Za-z0-9_]*/);
      tokens.push({ type: "id", name: m[0] });
      i += m[0].length;
      continue;
    }
    const two = expression.slice(i, i + 2);
    if (["**", "==", "!=", "<=", ">=", "&&", "||"].includes(two)) {
      tokens.push({ type: "op", value: two });
      i += 2;
      continue;
    }
    if ("+-*/%<>!?:(),".includes(ch)) {
      tokens.push({ type: "op", value: ch });
      i++;
      continue;
    }
    throw new SyntaxError("Unexpected character in formula");
  }
  tokens.push({ type: "eof" });
  return tokens;
}
function parse(expression) {
  const tokens = tokenize(expression);
  let pos = 0,
    depth = 0;
  const enter = () => {
      if (++depth > MAX_DEPTH)
        throw new RangeError("Formula recursion depth exceeded");
    },
    leave = () => {
      depth--;
    },
    peek = () => tokens[pos],
    next = () => tokens[pos++],
    match = (val) =>
      peek().type === "op" && peek().value === val ? (pos++, true) : false,
    expect = (val) => {
      if (!match(val)) throw new SyntaxError("Expected " + val);
    };
  const parseTernary = () => {
    enter();
    try {
      const node = parseOr();
      if (match("?")) {
        const thenBranch = parseTernary();
        expect(":");
        const elseBranch = parseTernary();
        return { kind: "ternary", cond: node, thenBranch, elseBranch };
      }
      return node;
    } finally {
      leave();
    }
  };
  const parseOr = () => {
    let node = parseAnd();
    while (match("||"))
      node = { kind: "binary", op: "||", left: node, right: parseAnd() };
    return node;
  };
  const parseAnd = () => {
    let node = parseEquality();
    while (match("&&"))
      node = { kind: "binary", op: "&&", left: node, right: parseEquality() };
    return node;
  };
  const parseEquality = () => {
    let node = parseComparison();
    while (
      peek().type === "op" &&
      (peek().value === "==" || peek().value === "!=")
    ) {
      const op = next().value;
      node = { kind: "binary", op, left: node, right: parseComparison() };
    }
    return node;
  };
  const parseComparison = () => {
    let node = parseAdditive();
    while (
      peek().type === "op" &&
      ["<", "<=", ">", ">="].includes(peek().value)
    ) {
      const op = next().value;
      node = { kind: "binary", op, left: node, right: parseAdditive() };
    }
    return node;
  };
  const parseAdditive = () => {
    let node = parseMultiplicative();
    while (
      peek().type === "op" &&
      (peek().value === "+" || peek().value === "-")
    ) {
      const op = next().value;
      node = { kind: "binary", op, left: node, right: parseMultiplicative() };
    }
    return node;
  };
  const parseMultiplicative = () => {
    let node = parsePower();
    while (peek().type === "op" && ["*", "/", "%"].includes(peek().value)) {
      const op = next().value;
      node = { kind: "binary", op, left: node, right: parsePower() };
    }
    return node;
  };
  const parsePower = () => {
    const node = parseUnary();
    if (match("**"))
      return { kind: "binary", op: "**", left: node, right: parsePower() };
    return node;
  };
  const parseUnary = () => {
    if (peek().type === "op" && ["+", "-", "!"].includes(peek().value)) {
      enter();
      try {
        const op = next().value;
        return { kind: "unary", op, arg: parseUnary() };
      } finally {
        leave();
      }
    }
    return parsePrimary();
  };
  const parsePrimary = () => {
    const t = peek();
    if (t.type === "num") {
      next();
      return { kind: "num", value: t.value };
    }
    if (t.type === "var") {
      next();
      return { kind: "var", name: t.name };
    }
    if (t.type === "id") {
      next();
      if (!Object.prototype.hasOwnProperty.call(ARITIES, t.name))
        throw new Error("Unknown formula function: " + t.name);
      expect("(");
      const args = [];
      if (!match(")")) {
        do {
          args.push(parseTernary());
        } while (match(","));
        expect(")");
      }
      const [minArgs, maxArgs] = ARITIES[t.name];
      if (args.length < minArgs || args.length > maxArgs)
        throw new Error("Invalid argument count for " + t.name);
      return { kind: "call", name: t.name, args };
    }
    if (match("(")) {
      const inner = parseTernary();
      expect(")");
      return inner;
    }
    throw new SyntaxError("Unexpected token in formula");
  };
  const ast = parseTernary();
  if (peek().type !== "eof")
    throw new SyntaxError("Unexpected trailing token in formula");
  return ast;
}
function evalAst(node, ctx, strict) {
  if (node.kind === "num") return node.value;
  if (node.kind === "var") {
    const raw = Object.prototype.hasOwnProperty.call(ctx, node.name)
      ? ctx[node.name]
      : Object.prototype.hasOwnProperty.call(ctx, "@" + node.name)
        ? ctx["@" + node.name]
        : ownPath(ctx, node.name);
    if (raw === undefined || raw === null) {
      if (strict) throw new Error("Unresolved variable: @" + node.name);
      return 0;
    }
    return number(raw);
  }
  if (node.kind === "unary") {
    const v = evalAst(node.arg, ctx, strict);
    if (node.op === "+") return v;
    if (node.op === "-") return v === 0 ? 0 : -v;
    return v === 0 ? 1 : 0;
  }
  if (node.kind === "ternary") {
    return evalAst(node.cond, ctx, strict) !== 0
      ? evalAst(node.thenBranch, ctx, strict)
      : evalAst(node.elseBranch, ctx, strict);
  }
  if (node.kind === "binary") {
    if (node.op === "&&")
      return evalAst(node.left, ctx, strict) !== 0 &&
        evalAst(node.right, ctx, strict) !== 0
        ? 1
        : 0;
    if (node.op === "||")
      return evalAst(node.left, ctx, strict) !== 0 ||
        evalAst(node.right, ctx, strict) !== 0
        ? 1
        : 0;
    const l = evalAst(node.left, ctx, strict),
      r = evalAst(node.right, ctx, strict);
    if (node.op === "+") return number(l + r);
    if (node.op === "-") return number(l - r);
    if (node.op === "*") return number(l * r);
    if (node.op === "/") {
      if (r === 0) throw new RangeError("Division by zero");
      return number(l / r);
    }
    if (node.op === "%") {
      if (r === 0) throw new RangeError("Division by zero");
      return number(l % r);
    }
    if (node.op === "**") return number(l ** r);
    if (node.op === "==") return l === r ? 1 : 0;
    if (node.op === "!=") return l !== r ? 1 : 0;
    if (node.op === "<") return l < r ? 1 : 0;
    if (node.op === "<=") return l <= r ? 1 : 0;
    if (node.op === ">") return l > r ? 1 : 0;
    if (node.op === ">=") return l >= r ? 1 : 0;
  }
  if (node.kind === "call") {
    if (node.name === "ifelse") {
      return evalAst(node.args[0], ctx, strict) !== 0
        ? evalAst(node.args[1], ctx, strict)
        : evalAst(node.args[2], ctx, strict);
    }
    if (node.name === "if") {
      return evalAst(node.args[0], ctx, strict) !== 0
        ? evalAst(node.args[1], ctx, strict)
        : node.args.length === 3
          ? evalAst(node.args[2], ctx, strict)
          : 0;
    }
    const args = node.args.map((a) => evalAst(a, ctx, strict));
    switch (node.name) {
      case "floor":
        return Math.floor(args[0]);
      case "ceil":
        return Math.ceil(args[0]);
      case "round":
        return Math.round(args[0]);
      case "trunc":
        return Math.trunc(args[0]);
      case "abs":
        return Math.abs(args[0]);
      case "sign":
        return Math.sign(args[0]);
      case "sqrt":
        if (args[0] < 0) throw new RangeError("Square root of negative number");
        return number(Math.sqrt(args[0]));
      case "pow":
        return number(Math.pow(args[0], args[1]));
      case "min":
        return Math.min(...args);
      case "max":
        return Math.max(...args);
      case "clamp":
        return bounded(args[0], args[1], args[2]);
      case "lookup": {
        const idx = Math.trunc(args[0]);
        return idx >= 1 && idx <= args.length - 2 ? args[idx + 1] : args[1];
      }
      case "eq":
        return args[0] === args[1] ? 1 : 0;
      case "ne":
        return args[0] !== args[1] ? 1 : 0;
      case "lt":
        return args[0] < args[1] ? 1 : 0;
      case "lte":
        return args[0] <= args[1] ? 1 : 0;
      case "gt":
        return args[0] > args[1] ? 1 : 0;
      case "gte":
        return args[0] >= args[1] ? 1 : 0;
      case "and":
        return args.every((v) => v !== 0) ? 1 : 0;
      case "or":
        return args.some((v) => v !== 0) ? 1 : 0;
      case "xor":
        return args.filter((v) => v !== 0).length === 1 ? 1 : 0;
      case "not":
        return args[0] === 0 ? 1 : 0;
      default:
        throw new Error("Unknown formula function: " + node.name);
    }
  }
  throw new Error("Invalid formula node");
}
function collectVars(node, out) {
  if (node.kind === "var") out.add(node.name);
  else if (node.kind === "unary") collectVars(node.arg, out);
  else if (node.kind === "binary") {
    collectVars(node.left, out);
    collectVars(node.right, out);
  } else if (node.kind === "ternary") {
    collectVars(node.cond, out);
    collectVars(node.thenBranch, out);
    collectVars(node.elseBranch, out);
  } else if (node.kind === "call") {
    for (const arg of node.args) collectVars(arg, out);
  }
}
export default class FormulaTool {
  evaluate(expression, context = {}) {
    record(context);
    const options = arguments[2] === undefined ? {} : record(arguments[2]);
    const strict = options.strict ?? true;
    const ast = parse(expression);
    const result = number(evalAst(ast, context, strict));
    return result === 0 ? 0 : result;
  }
  variables(expression) {
    const ast = parse(expression);
    const found = new Set();
    collectVars(ast, found);
    return [...found];
  }
}
