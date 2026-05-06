import { test } from "node:test";
import assert from "node:assert/strict";
import {
  evaluatePolynomial,
  fitPolynomialRegression,
} from "./regression.js";
import type { CurveSample } from "./types.js";

test("fitPolynomialRegression: degree-1 fit recovers a known line", () => {
  // y = 2x + 3, sampled noiselessly
  const samples: CurveSample[] = [
    { xBytes: 1000, factor: 2003 },
    { xBytes: 2000, factor: 4003 },
    { xBytes: 3000, factor: 6003 },
    { xBytes: 4000, factor: 8003 },
  ];
  const reg = fitPolynomialRegression(samples, 1);
  for (const s of samples) {
    const yhat = evaluatePolynomial(reg, s.xBytes);
    assert.ok(Math.abs(yhat - s.factor) < 1e-6, `at ${s.xBytes}: ${yhat} vs ${s.factor}`);
  }
  assert.ok(reg.rSquared > 0.99999);
});

test("fitPolynomialRegression: degree-2 fit recovers a known quadratic", () => {
  // y = 0.5 x² − 2 x + 1 sampled at six points
  const f = (x: number): number => 0.5 * x * x - 2 * x + 1;
  const xs = [10, 20, 30, 40, 50, 60];
  const samples: CurveSample[] = xs.map((x) => ({ xBytes: x, factor: f(x) }));
  const reg = fitPolynomialRegression(samples, 2);
  for (const s of samples) {
    const yhat = evaluatePolynomial(reg, s.xBytes);
    assert.ok(Math.abs(yhat - s.factor) < 1e-6, `at ${s.xBytes}: ${yhat} vs ${s.factor}`);
  }
  assert.ok(reg.rSquared > 0.99999);
});

test("fitPolynomialRegression: noisy data still produces a usable fit", () => {
  // y = x² + small noise; expect monotone-increasing prediction
  const xs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const samples: CurveSample[] = xs.map((x) => ({
    xBytes: x,
    factor: x * x + (((x * 7919) % 11) - 5) * 0.05, // deterministic pseudo-noise
  }));
  const reg = fitPolynomialRegression(samples, 2);
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

test("fitPolynomialRegression: handles bytes-scale x without numerical blowup", () => {
  // x in tens of thousands of bytes; check coefficients evaluate finite
  const samples: CurveSample[] = [
    { xBytes: 6144, factor: 1.0 },
    { xBytes: 18432, factor: 1.5 },
    { xBytes: 32768, factor: 2.4 },
    { xBytes: 49152, factor: 4.0 },
    { xBytes: 65536, factor: 6.5 },
  ];
  const reg = fitPolynomialRegression(samples, 2);
  for (let x = 6000; x <= 70000; x += 2000) {
    const y = evaluatePolynomial(reg, x);
    assert.ok(Number.isFinite(y), `inf at x=${x}`);
  }
  assert.ok(reg.rSquared > 0.95, `R²=${reg.rSquared}`);
});
