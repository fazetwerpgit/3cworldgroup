import { describe, expect, it } from "vitest";
import { futureValue } from "./calc";

describe("futureValue", () => {
  it("matches the deck for $150/mo", () => {
    const r = futureValue(150);
    expect(r.total).toBe(88218.13);
    expect(r.principal).toBe(45000);
    expect(r.interest).toBe(43218.13);
  });

  it("matches the deck for $250/mo", () => {
    expect(futureValue(250).total).toBe(147030.22);
    expect(futureValue(250).principal).toBe(75000);
  });

  it("handles a zero rate and bad input", () => {
    expect(futureValue(100, 0, 1)).toEqual({ total: 1200, principal: 1200, interest: 0 });
    expect(futureValue(-5).total).toBe(0);
    expect(futureValue(Number.NaN).total).toBe(0);
  });
});
