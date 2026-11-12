import { bounded, copy, number, record, key } from "./support.mjs";
export default class ChargesTool {
  spend(pool, cost = 1) {
    record(pool);
    const current = number(pool.value);
    if (current < 0) throw new RangeError("Negative charge balance");
    if (pool.max !== undefined && pool.max !== null && number(pool.max) < 0)
      throw new RangeError("Negative charge maximum");
    if (number(cost) < 0) throw new RangeError("Negative charge cost");
    if (current < cost) throw new Error("Insufficient charges");
    return { ...copy(pool), value: number(current - cost) };
  }
  restore(pool, options = {}) {
    record(pool);
    const { period, amount = null } = record(options);
    const current = number(pool.value),
      max = number(pool.max);
    if (current < 0 || max < 0) throw new RangeError("Negative charge pool");
    const poolPeriod = pool.per ?? pool.rechargePeriod;
    if (period !== undefined) key(period);
    if (poolPeriod !== undefined) key(poolPeriod);
    if (period !== undefined && poolPeriod !== period) return copy(pool);
    let next;
    if (amount === null || amount === undefined) {
      next = max;
    } else {
      if (number(amount) < 0) throw new RangeError("Negative restore amount");
      next = Math.min(max, current + amount);
    }
    return { ...copy(pool), value: number(next) };
  }
  evaluateMax(pool, maxValue) {
    record(pool);
    if (number(maxValue) < 0) throw new RangeError("Negative charge maximum");
    const raw =
      pool.value === undefined || pool.value === null
        ? maxValue
        : number(pool.value);
    if (raw < 0) throw new RangeError("Negative charge balance");
    return {
      ...copy(pool),
      value: bounded(raw, 0, maxValue),
      max: maxValue,
    };
  }
}
