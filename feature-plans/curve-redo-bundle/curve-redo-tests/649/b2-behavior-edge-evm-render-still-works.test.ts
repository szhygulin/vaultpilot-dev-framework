import { describe, it, expect } from "vitest";

describe("Edge: EVM cost preview unchanged after non-EVM extension", () => {
  it("renderCostPreviewBlock still produces ETH output for EVM input", async () => {
    const m: any = await import("../src/signing/render-verification.js");
    const fn = m.renderCostPreviewBlock;
    expect(typeof fn).toBe("function");
    const invocations: Array<() => any> = [
      () => fn("0.00114", 3000),
      () => fn("0.00114", "ETH", 3000),
      () => fn("0.00114", 3000, "ETH"),
      () => fn({ feeNative: "0.00114", symbol: "ETH", usdPrice: 3000 }),
      () => fn({ gasCostNative: "0.00114", usdPrice: 3000 }),
    ];
    let outAny: any = undefined;
    for (const inv of invocations) {
      try {
        const r = inv();
        if (typeof r === "string" && r.toUpperCase().includes("ETH")) {
          outAny = r;
          break;
        }
      } catch {}
    }
    expect(typeof outAny).toBe("string");
    expect(String(outAny).toUpperCase()).toContain("ETH");
  });

  it("undefined fee for EVM is silent (preserves baseline UX)", async () => {
    const m: any = await import("../src/signing/render-verification.js");
    const fn = m.renderCostPreviewBlock;
    expect(typeof fn).toBe("function");
    let result: any = "NOT_CALLED";
    const invocations: Array<() => any> = [
      () => fn(undefined, 3000),
      () => fn(undefined, "ETH", 3000),
      () => fn({ feeNative: undefined, symbol: "ETH", usdPrice: 3000 }),
      () => fn({ gasCostNative: undefined, usdPrice: 3000 }),
    ];
    for (const inv of invocations) {
      try { result = inv(); break; } catch {}
    }
    const isSilent = result === null || result === undefined || result === "";
    expect(isSilent).toBe(true);
  });
});
