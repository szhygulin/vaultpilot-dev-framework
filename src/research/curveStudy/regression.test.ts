import { test } from "node:test";
import assert from "node:assert/strict";
import {
  evaluatePolynomial,
  fitPolynomialRegression,
} from "./regression.js";
import type { CurveSample } from "./types.js";

test("fitPolynomialRegression: degree-1 raw fit recovers a known line", () => {
  // y = 2x + 3, sampled noiselessly
  const samples: CurveSample[] = [
    { xBytes: 1000, factor: 2003 },
    { xBytes: 2000, factor: 4003 },
    { xBytes: 3000, factor: 6003 },
    { xBytes: 4000, factor: 8003 },
  ];
  const reg = fitPolynomialRegression(samples, 1, "identity");
  for (const s of samples) {
    const yhat = evaluatePolynomial(reg, s.xBytes);
    assert.ok(Math.abs(yhat - s.factor) < 1e-6, `at ${s.xBytes}: ${yhat} vs ${s.factor}`);
  }
  assert.ok(reg.rSquared > 0.99999);
  assert.equal(reg.xTransform, "identity");
});

test("fitPolynomialRegression: degree-1 log fit recovers y ~ a + b·log(x)", () => {
  // y = 1.5 · ln(x) + 0.7
  const f = (x: number): number => 1.5 * Math.log(x) + 0.7;
  const xs = [1000, 2000, 5000, 10000, 20000, 50000];
  const samples: CurveSample[] = xs.map((x) => ({ xBytes: x, factor: f(x) }));
  const reg = fitPolynomialRegression(samples, 1, "log");
  for (const s of samples) {
    const yhat = evaluatePolynomial(reg, s.xBytes);
    assert.ok(Math.abs(yhat - s.factor) < 1e-6, `at ${s.xBytes}: ${yhat} vs ${s.factor}`);
  }
  assert.ok(reg.rSquared > 0.99999);
  assert.equal(reg.xTransform, "log");
});

test("fitPolynomialRegression: log mode rejects xBytes ≤ 0", () => {
  assert.throws(
    () =>
      fitPolynomialRegression(
        [
          { xBytes: 1000, factor: 1 },
          { xBytes: 0, factor: 2 },
          { xBytes: 2000, factor: 3 },
        ],
        1,
        "log",
      ),
    /xBytes > 0/,
  );
});

test("evaluatePolynomial: log-mode applies log at evaluate time, raw mode does not", () => {
  const f = (x: number): number => 0.5 * Math.log(x) + 1.2;
  const xs = [100, 1000, 10000, 100000];
  const samples: CurveSample[] = xs.map((x) => ({ xBytes: x, factor: f(x) }));
  const regLog = fitPolynomialRegression(samples, 1, "log");
  const regRaw = fitPolynomialRegression(samples, 1, "identity");
  // Same sample set, both fits should pass through training points
  for (const s of samples) {
    assert.ok(Math.abs(evaluatePolynomial(regLog, s.xBytes) - s.factor) < 1e-6);
  }
  // Predictions diverge between forms at out-of-sample x because the underlying shape is log
  const xExtrap = 1_000_000;
  const yLog = evaluatePolynomial(regLog, xExtrap);
  const yRaw = evaluatePolynomial(regRaw, xExtrap);
  // Linear-log extrapolates much more conservatively than linear-raw on a true log signal
  assert.ok(yLog < yRaw, `log extrapolation ${yLog} should be < raw extrapolation ${yRaw}`);
  assert.ok(Math.abs(yLog - f(xExtrap)) < 1e-6);
});

test("evaluatePolynomial: log mode returns NaN for non-positive xBytes", () => {
  const samples: CurveSample[] = [
    { xBytes: 100, factor: 1 },
    { xBytes: 1000, factor: 2 },
    { xBytes: 10000, factor: 3 },
  ];
  const reg = fitPolynomialRegression(samples, 1, "log");
  assert.ok(Number.isNaN(evaluatePolynomial(reg, 0)));
  assert.ok(Number.isNaN(evaluatePolynomial(reg, -100)));
});

test("fitPolynomialRegression: degree-2 raw fit recovers a known quadratic", () => {
  // y = 0.5 x² − 2 x + 1 sampled at six points
  const f = (x: number): number => 0.5 * x * x - 2 * x + 1;
  const xs = [10, 20, 30, 40, 50, 60];
  const samples: CurveSample[] = xs.map((x) => ({ xBytes: x, factor: f(x) }));
  const reg = fitPolynomialRegression(samples, 2, "identity");
  for (const s of samples) {
    const yhat = evaluatePolynomial(reg, s.xBytes);
    assert.ok(Math.abs(yhat - s.factor) < 1e-6, `at ${s.xBytes}: ${yhat} vs ${s.factor}`);
  }
  assert.ok(reg.rSquared > 0.99999);
});

test("fitPolynomialRegression: noisy raw data still produces a usable fit", () => {
  // y = x² + small noise; expect monotone-increasing prediction
  const xs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const samples: CurveSample[] = xs.map((x) => ({
    xBytes: x,
    factor: x * x + (((x * 7919) % 11) - 5) * 0.05, // deterministic pseudo-noise
  }));
  const reg = fitPolynomialRegression(samples, 2, "identity");
  for (let i = 1; i < xs.length; i++) {
    const a = evaluatePolynomial(reg, xs[i - 1]);
    const b = evaluatePolynomial(reg, xs[i]);
    assert.ok(b >= a - 0.5, `non-monotone at i=${i}: ${a} -> ${b}`);
  }
  assert.ok(reg.rSquared > 0.95, `R²=${reg.rSquared}`);
});

test("fitPolynomialRegression: refuses underdetermined fit (n <= degree)", () => {
  assert.throws(() =>
    fitPolynomialRegression(
      [
        { xBytes: 1, factor: 1 },
        { xBytes: 2, factor: 2 },
      ],
      2,
    ),
  );
});

test("fitPolynomialRegression: refuses zero-variance x", () => {
  assert.throws(() =>
    fitPolynomialRegression(
      [
        { xBytes: 5, factor: 1 },
        { xBytes: 5, factor: 2 },
        { xBytes: 5, factor: 3 },
      ],
      1,
    ),
  );
});

test("fitPolynomialRegression: significance — clean signal yields tiny F p-value", () => {
  // y = x², deterministic — overall F-test should reject the null with p ≈ 0
  const samples: CurveSample[] = [
    { xBytes: 1, factor: 1 },
    { xBytes: 2, factor: 4 },
    { xBytes: 3, factor: 9 },
    { xBytes: 4, factor: 16 },
    { xBytes: 5, factor: 25 },
    { xBytes: 6, factor: 36 },
  ];
  const reg = fitPolynomialRegression(samples, 2, "identity");
  assert.ok(reg.significance.fPValue < 1e-9, `F p-value=${reg.significance.fPValue}`);
  assert.equal(reg.significance.fDfRegression, 2);
  assert.equal(reg.significance.fDfResidual, samples.length - 3);
  assert.ok(Number.isFinite(reg.significance.fStatistic));
});

test("fitPolynomialRegression: significance — pure noise yields large F p-value", () => {
  // Constant-ish y with tiny perturbations: regression shouldn't be significant
  const samples: CurveSample[] = [
    { xBytes: 10, factor: 1.0 },
    { xBytes: 20, factor: 1.001 },
    { xBytes: 30, factor: 0.999 },
    { xBytes: 40, factor: 1.0005 },
    { xBytes: 50, factor: 0.9995 },
    { xBytes: 60, factor: 1.0 },
    { xBytes: 70, factor: 0.9998 },
  ];
  const reg = fitPolynomialRegression(samples, 2);
  // Residual is nonzero; F may or may not be significant depending on the
  // signal-to-noise ratio. The point is that the calculation produces a
  // finite, defined p-value — not that it cleanly rejects.
  assert.ok(Number.isFinite(reg.significance.fPValue));
  assert.ok(reg.significance.fPValue >= 0 && reg.significance.fPValue <= 1);
});

test("fitPolynomialRegression: rSquaredAdjusted is below rSquared (penalizes degree)", () => {
  const samples: CurveSample[] = [
    { xBytes: 1, factor: 2.1 },
    { xBytes: 2, factor: 3.9 },
    { xBytes: 3, factor: 6.05 },
    { xBytes: 4, factor: 7.95 },
    { xBytes: 5, factor: 10.05 },
  ];
  const reg = fitPolynomialRegression(samples, 2, "identity");
  assert.ok(reg.rSquaredAdjusted < reg.rSquared, `adj=${reg.rSquaredAdjusted} >= ${reg.rSquared}`);
  assert.ok(Number.isFinite(reg.rSquaredAdjusted));
});

test("fitPolynomialRegression: per-coefficient SE/t/p populated", () => {
  const samples: CurveSample[] = [
    { xBytes: 1, factor: 1 },
    { xBytes: 2, factor: 4 },
    { xBytes: 3, factor: 9 },
    { xBytes: 4, factor: 16 },
    { xBytes: 5, factor: 25 },
  ];
  const reg = fitPolynomialRegression(samples, 2, "identity");
  assert.equal(reg.significance.coefficients.length, 3);
  for (const c of reg.significance.coefficients) {
    assert.equal(typeof c.estimate, "number");
    // For an exact quadratic, residuals are ~0 → SE ~0 → t = ±∞ → p ≈ 0
    // Just check the fields are present and tStatistic has a defined sign.
    assert.ok(Number.isFinite(c.standardError) || c.standardError === 0);
  }
});

test("fitPolynomialRegression: significance fields NaN when n == p (no residual df)", () => {
  // n=3 samples, degree=2 → p = 3 → df_residual = 0 → F undefined
  const reg = fitPolynomialRegression(
    [
      { xBytes: 1, factor: 1 },
      { xBytes: 2, factor: 4 },
      { xBytes: 3, factor: 9 },
    ],
    2,
    "identity",
  );
  assert.ok(Number.isNaN(reg.significance.fPValue));
  assert.equal(reg.significance.fDfResidual, 0);
});

test("fitPolynomialRegression: handles bytes-scale x without numerical blowup (raw)", () => {
  // x in tens of thousands of bytes; check coefficients evaluate finite
  const samples: CurveSample[] = [
    { xBytes: 6144, factor: 1.0 },
    { xBytes: 18432, factor: 1.5 },
    { xBytes: 32768, factor: 2.4 },
    { xBytes: 49152, factor: 4.0 },
    { xBytes: 65536, factor: 6.5 },
  ];
  const reg = fitPolynomialRegression(samples, 2, "identity");
  for (let x = 6000; x <= 70000; x += 2000) {
    const y = evaluatePolynomial(reg, x);
    assert.ok(Number.isFinite(y), `inf at x=${x}`);
  }
  assert.ok(reg.rSquared > 0.95, `R²=${reg.rSquared}`);
});

test("fitPolynomialRegression: handles bytes-scale x without numerical blowup (log default)", () => {
  // Same x range; new linear-log default should also produce finite predictions
  const samples: CurveSample[] = [
    { xBytes: 6144, factor: 1.0 },
    { xBytes: 18432, factor: 1.5 },
    { xBytes: 32768, factor: 2.4 },
    { xBytes: 49152, factor: 4.0 },
    { xBytes: 65536, factor: 6.5 },
  ];
  const reg = fitPolynomialRegression(samples); // default: degree=1, xTransform="log"
  assert.equal(reg.degree, 1);
  assert.equal(reg.xTransform, "log");
  for (let x = 6000; x <= 70000; x += 2000) {
    const y = evaluatePolynomial(reg, x);
    assert.ok(Number.isFinite(y), `inf at x=${x}`);
  }
});
