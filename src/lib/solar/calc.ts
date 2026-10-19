/**
 * Solar savings calculator: future value of a monthly deposit (annuity due).
 * r = (1 + apy)^(1/12) - 1, n = years * 12, FV = P * ((1+r)^n - 1) / r * (1+r).
 */
export type FutureValueResult = {
  total: number;
  principal: number;
  interest: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function futureValue(monthly: number, apy = 0.05, years = 25): FutureValueResult {
  const p = Number.isFinite(monthly) && monthly > 0 ? monthly : 0;
  const y = Number.isFinite(years) && years > 0 ? years : 0;
  const n = Math.round(y * 12);
  const principal = p * n;
  const r = Number.isFinite(apy) ? Math.pow(1 + apy, 1 / 12) - 1 : 0;
  const total = r === 0 ? principal : (p * (Math.pow(1 + r, n) - 1)) / r * (1 + r);
  return {
    total: round2(total),
    principal: round2(principal),
    interest: round2(total - principal),
  };
}
