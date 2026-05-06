import type { CurveSample } from "./types.js";

/**
 * Result of an ordinary-least-squares polynomial regression. Coefficients are
 * stored in NORMALIZED x-space (x' = (x - mean) / std) for numerical
 * conditioning — bytes-scale x values produce ill-conditioned Vandermonde
 * matrices at degree ≥ 2. evaluatePolynomial() reverses the normalization at
 * call time, so callers always pass raw bytes.
 *
 * Layout: coefficients[i] is the coefficient for x'^i, so
 *   y = c0 + c1*x' + c2*x'^2 + ...
 */
export interface PolynomialRegression {
  degree: number;
  /** Per-degree coefficients in NORMALIZED x-space, indexed [c0, c1, c2, ...]. */
  coefficients: ReadonlyArray<number>;
  /** Mean of training x values. Used to normalize at evaluate time. */
  xMean: number;
  /** Std (population, not sample) of training x values. Zero if all x's identical (caller error). */
  xStd: number;
  /** Number of samples the fit was trained on. */
  n: number;
  /** Residual sum of squares (Σ(y_i − ŷ_i)²). */
  rss: number;
  /** Total sum of squares (Σ(y_i − ȳ)²). */
  tss: number;
  /** Coefficient of determination, 1 − rss/tss. NaN if tss=0 (all y identical). */
  rSquared: number;
}

/**
 * Solve a small dense linear system A x = b via Gaussian elimination with
 * partial pivoting. n is small (≤ 5 typically), so we keep this inline rather
 * than depend on a numerics library. Mutates A and b.
 */
function solveLinearSystem(A: number[][], b: number[]): number[] {
  const n = b.length;
  for (let i = 0; i < n; i++) {
    let pivot = i;
    let pivotAbs = Math.abs(A[i][i]);
    for (let k = i + 1; k < n; k++) {
      const v = Math.abs(A[k][i]);
      if (v > pivotAbs) {
        pivotAbs = v;
        pivot = k;
      }
    }
    if (pivotAbs < 1e-12) {
      throw new Error("solveLinearSystem: singular matrix (collinear samples? insufficient distinct x values for the chosen degree?)");
    }
    if (pivot !== i) {
      [A[i], A[pivot]] = [A[pivot], A[i]];
      [b[i], b[pivot]] = [b[pivot], b[i]];
    }
    for (let k = i + 1; k < n; k++) {
      const factor = A[k][i] / A[i][i];
      for (let j = i; j < n; j++) {
        A[k][j] -= factor * A[i][j];
      }
      b[k] -= factor * b[i];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = b[i];
    for (let j = i + 1; j < n; j++) {
      s -= A[i][j] * x[j];
    }
    x[i] = s / A[i][i];
  }
  return x;
}

/**
 * Fit y ~ polynomial(x) of given degree by OLS. Returns the regression in
 * normalized x-space — see PolynomialRegression for the storage convention.
 *
 * Requires `samples.length > degree`; throws otherwise (under-determined).
 */
export function fitPolynomialRegression(
  samples: ReadonlyArray<CurveSample>,
  degree: number = 2,
): PolynomialRegression {
  if (samples.length <= degree) {
    throw new Error(
      `fitPolynomialRegression: need >${degree} samples for degree-${degree} fit, got ${samples.length}`,
    );
  }
  const n = samples.length;
  const xs = samples.map((s) => s.xBytes);
  const ys = samples.map((s) => s.factor);
  const xMean = xs.reduce((a, b) => a + b, 0) / n;
  const xVar = xs.reduce((a, x) => a + (x - xMean) ** 2, 0) / n;
  const xStd = Math.sqrt(xVar);
  if (xStd < 1e-12) {
    throw new Error("fitPolynomialRegression: zero variance in x (all samples at the same byte size)");
  }
  const xn = xs.map((x) => (x - xMean) / xStd);

  // Build normal equations: (X^T X) β = X^T y, where X has columns [1, x', x'², ..., x'^degree]
  const m = degree + 1;
  const XtX: number[][] = Array.from({ length: m }, () => new Array<number>(m).fill(0));
  const XtY: number[] = new Array<number>(m).fill(0);
  for (let i = 0; i < n; i++) {
    const powers: number[] = new Array(m);
    powers[0] = 1;
    for (let k = 1; k < m; k++) powers[k] = powers[k - 1] * xn[i];
    for (let r = 0; r < m; r++) {
      for (let c = 0; c < m; c++) {
        XtX[r][c] += powers[r] * powers[c];
      }
      XtY[r] += powers[r] * ys[i];
    }
  }
  const coefficients = solveLinearSystem(XtX, XtY);

  // Compute residuals + R²
  let rss = 0;
  let yMean = 0;
  for (const y of ys) yMean += y;
  yMean /= n;
  let tss = 0;
  for (let i = 0; i < n; i++) {
    let yhat = 0;
    let pw = 1;
    for (let k = 0; k < m; k++) {
      yhat += coefficients[k] * pw;
      pw *= xn[i];
    }
    rss += (ys[i] - yhat) ** 2;
    tss += (ys[i] - yMean) ** 2;
  }
  const rSquared = tss === 0 ? Number.NaN : 1 - rss / tss;
  return { degree, coefficients, xMean, xStd, n, rss, tss, rSquared };
}

/** Evaluate the regression at raw `xBytes`. Reverses internal normalization. */
export function evaluatePolynomial(reg: PolynomialRegression, xBytes: number): number {
  const xn = (xBytes - reg.xMean) / reg.xStd;
  let y = 0;
  let pw = 1;
  for (let k = 0; k < reg.coefficients.length; k++) {
    y += reg.coefficients[k] * pw;
    pw *= xn;
  }
  return y;
}
