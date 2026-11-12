import { copy, record, number, integer } from "./support.mjs";

export default class CurrencyTool {
  toCopper(coins = {}) {
    record(coins);
    const pp = integer(coins.pp ?? 0, 0, 100000000);
    const gp = integer(coins.gp ?? 0, 0, 100000000);
    const sp = integer(coins.sp ?? 0, 0, 100000000);
    const cp = integer(coins.cp ?? 0, 0, 100000000);
    return pp * 1000 + gp * 100 + sp * 10 + cp;
  }

  fromCopper(copper) {
    integer(copper, 0, 100000000000);
    let rem = copper;
    const pp = Math.floor(rem / 1000);
    rem %= 1000;
    const gp = Math.floor(rem / 100);
    rem %= 100;
    const sp = Math.floor(rem / 10);
    rem %= 10;
    const cp = rem;
    return { pp, gp, sp, cp };
  }

  coinWeightLbs(coins = {}, coinsPerLb = 50) {
    record(coins);
    const totalCoins =
      integer(coins.pp ?? 0, 0, 100000000) +
      integer(coins.gp ?? 0, 0, 100000000) +
      integer(coins.sp ?? 0, 0, 100000000) +
      integer(coins.cp ?? 0, 0, 100000000);
    number(coinsPerLb);
    if (coinsPerLb <= 0)
      throw new RangeError("coinsPerLb must be greater than zero");
    return totalCoins / coinsPerLb;
  }

  deductCurrency(wallet, cost, allowHigherDenominationChange = true) {
    record(wallet);
    record(cost);

    const walletCp = this.toCopper(wallet);
    const costCp = this.toCopper(cost);

    if (walletCp < costCp) {
      return {
        ok: false,
        newWallet: copy(wallet),
        reason: "insufficient_funds"
      };
    }

    if (allowHigherDenominationChange) {
      const remainingCp = walletCp - costCp;
      const newWallet = this.fromCopper(remainingCp);
      return {
        ok: true,
        newWallet,
        changeGiven: true
      };
    }

    const w = {
      pp: integer(wallet.pp ?? 0, 0),
      gp: integer(wallet.gp ?? 0, 0),
      sp: integer(wallet.sp ?? 0, 0),
      cp: integer(wallet.cp ?? 0, 0)
    };
    const c = {
      pp: integer(cost.pp ?? 0, 0),
      gp: integer(cost.gp ?? 0, 0),
      sp: integer(cost.sp ?? 0, 0),
      cp: integer(cost.cp ?? 0, 0)
    };

    if (w.pp < c.pp || w.gp < c.gp || w.sp < c.sp || w.cp < c.cp) {
      return {
        ok: false,
        newWallet: copy(wallet),
        reason: "exact_change_unavailable"
      };
    }

    const newWallet = {
      pp: w.pp - c.pp,
      gp: w.gp - c.gp,
      sp: w.sp - c.sp,
      cp: w.cp - c.cp
    };

    return {
      ok: true,
      newWallet,
      changeGiven: false
    };
  }
}
