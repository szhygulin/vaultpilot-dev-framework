import type { CurveSample } from "./types.js";
import { fRightTailPValue, tTwoSidedPValue } from "./stats.js";

/**
 * Optional pre-fit transform applied to xBytes. "log" linearizes monotonic
 * size→factor relationships that aren't well-modeled by a low-degree raw
 * polynomial (#179 leg-1 finding: linear-log fit beat poly2-raw on both
 * curves at n=18, accuracy p=0.097 vs 0.111).
 */
export type XTransform = "identity" | "log";

/**
 * Result of an ordinary-least-squares polynomial regression. Coefficients are
 * stored in NORMALIZED transformed-x space (x' = (T(x) - mean) / std), where
 * T is the optional transform (identity or log). Normalization handles the
 * ill-conditioning of bytes-scale x values at degree ≥ 2; the log transform
 * is independent — applied to raw x BEFORE normalization. evaluatePolynomial
 * reverses both at call time, so callers always pass raw bytes.
 *
 * Layout: coefficients[i] is the coefficient for x'^i, so
 *   y = c0 + c1*x' + c2*x'^2 + ...
 */
export interface PolynomialRegression {
  degree: number;
  /** Optional transform applied to xBytes before fitting. */
  xTransform: XTransform;
  /** Per-degree coefficients in NORMALIZED transformed-x space, indexed [c0, c1, c2, ...]. */
  coefficients: ReadonlyArray<number>;
  /** Mean of T(x) over training samples. Used to normalize at evaluate time. */
  xMean: number;
  /** Std (population, not sample) of T(x). Zero if all transformed x's identical (caller error). */
  xStd: number;
  /** Number of samples the fit was trained on. */
  n: number;
  /** Residual sum of squares (Σ(y_i − ŷ_i)²). */
  rss: number;
  /** Total sum of squares (Σ(y_i − ȳ)²). */
  tss: number;
  /** Coefficient of determination, 1 − rss/tss. NaN if tss=0 (all y identical). */
  rSquared: number;
  /** Adjusted R² = 1 − (rss/(n−p)) / (tss/(n−1)), p = degree+1. NaN when n ≤ p. */
  rSquaredAdjusted: number;
  /** Statistical significance of the fit — overall F-test + per-coefficient t-tests. */
  significance: RegressionSignificance;
}

export interface RegressionSignificance {
  /** Overall F-statistic vs intercept-only null model. */
  fStatistic: number;
  /** F-test numerator df = degree (number of non-intercept regressors). */
  fDfRegression: number;
  /** F-test denominator df = n − degree − 1. */
  fDfResidual: number;
  /** Right-tail F p-value. NaN when df ≤ 0 or tss = 0. */
  fPValue: number;
  /** Per-coefficient inference. Index i corresponds to coefficients[i] (the x'^i term). */
  coefficients: ReadonlyArray<{
    estimate: number;
    standardError: number;
    tStatistic: number;
    /** Two-sided t p-value. NaN when residual df ≤ 0. */
    pValue: number;
  }>;
  /** Residual standard error, σ̂ = √(rss / (n − p)). NaN when n ≤ p. */
  residualStdError: number;
}

/** Deep copy of a square matrix for in-place algorithms that don't want to mutate the input. */
function cloneMatrix(A: ReadonlyArray<ReadonlyArray<number>>): number[][] {
  return A.map((row) => [...row]);
}

/**
 * Inverse of a small square matrix via Gauss–Jordan elimination with partial
 * pivoting. Used to extract Var(β̂) = σ̂² · (XᵀX)⁻¹ for coefficient SEs.
 */
function inverseMatrix(A: ReadonlyArray<ReadonlyArray<number>>): number[][] {
  const n = A.length;
  const M = cloneMatrix(A);
  const I: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
  );
  for (let i = 0; i < n; i++) {
    let pivot = i;
    let pivotAbs = Math.abs(M[i][i]);
    for (let k = i + 1; k < n; k++) {
      const v = Math.abs(M[k][i]);
      if (v > pivotAbs) {
        pivotAbs = v;
        pivot = k;
      }
    }
    if (pivotAbs < 1e-12) {
      throw new Error("inverseMatrix: singular");
    }
    if (pivot !== i) {
      [M[i], M[pivot]] = [M[pivot], M[i]];
      [I[i], I[pivot]] = [I[pivot], I[i]];
    }
    const div = M[i][i];
    for (let j = 0; j < n; j++) {
      M[i][j] /= div;
      I[i][j] /= div;
    }
    for (let k = 0; k < n; k++) {
      if (k === i) continue;
      const factor = M[k][i];
      if (factor === 0) continue;
      for (let j = 0; j < n; j++) {
        M[k][j] -= factor * M[i][j];
        I[k][j] -= factor * I[i][j];
      }
    }
  }
  return I;
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
  degree: number = 1,
  xTransform: XTransform = "log",
): PolynomialRegression {
  if (samples.length <= degree) {
    throw new Error(
      `fitPolynomialRegression: need >${degree} samples for degree-${degree} fit, got ${samples.length}`,
    );
  }
  if (xTransform === "log") {
    for (const s of samples) {
      if (!(s.xBytes > 0)) {
        throw new Error(
          `fitPolynomialRegression: xTransform="log" requires xBytes > 0, got ${s.xBytes}`,
        );
      }
    }
  }
  const n = samples.length;
  const xs = samples.map((s) => (xTransform === "log" ? Math.log(s.xBytes) : s.xBytes));
  const ys = samples.map((s) => s.factor);
  const xMean = xs.reduce((a, b) => a + b, 0) / n;
  const xVar = xs.reduce((a, x) => a + (x - xMean) ** 2, 0) / n;
  const xStd = Math.sqrt(xVar);
  if (xStd < 1e-12) {
    throw new Error(
      `fitPolynomialRegression: zero variance in ${xTransform === "log" ? "log(xBytes)" : "xBytes"} (all samples at the same byte size)`,
    );
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
  // Snapshot XtX BEFORE solveLinearSystem mutates it — we need it for SE(β̂).
  const XtXFrozen: number[][] = XtX.map((r) => [...r]);
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
  const dfResidual = n - m;
  const rSquaredAdjusted =
    dfResidual <= 0 || tss === 0
      ? Number.NaN
      : 1 - (rss / dfResidual) / (tss / (n - 1));

  // Significance:
  //   F-test: F = ((tss − rss)/degree) / (rss/(n − degree − 1))
  //   t-test: SE_i = √(σ̂² · (XᵀX)⁻¹_ii); t_i = β̂_i / SE_i
  let fStatistic = Number.NaN;
  let fPValue = Number.NaN;
  let residualStdError = Number.NaN;
  let coefStats: RegressionSignificance["coefficients"] = coefficients.map((est) => ({
    estimate: est,
    standardError: Number.NaN,
    tStatistic: Number.NaN,
    pValue: Number.NaN,
  }));
  if (dfResidual > 0 && tss > 0) {
    const sigmaSq = rss / dfResidual;
    residualStdError = Math.sqrt(sigmaSq);
    if (degree >= 1) {
      fStatistic = ((tss - rss) / degree) / sigmaSq;
      fPValue = fRightTailPValue(fStatistic, degree, dfResidual);
    }
    try {
      const inv = inverseMatrix(XtXFrozen);
      coefStats = coefficients.map((est, i) => {
        const variance = sigmaSq * inv[i][i];
        const se = variance > 0 ? Math.sqrt(variance) : Number.NaN;
        const tStat = se > 0 && Number.isFinite(se) ? est / se : Number.NaN;
        const pValue = Number.isFinite(tStat)
          ? tTwoSidedPValue(tStat, dfResidual)
          : Number.NaN;
        return { estimate: est, standardError: se, tStatistic: tStat, pValue };
      });
    } catch {
      // Singular XtX (collinear regressors at this degree) — leave SEs as NaN
    }
  }
  const significance: RegressionSignificance = {
    fStatistic,
    fDfRegression: degree,
    fDfResidual: Math.max(0, dfResidual),
    fPValue,
    coefficients: coefStats,
    residualStdError,
  };

  return {
    degree,
    xTransform,
    coefficients,
    xMean,
    xStd,
    n,
    rss,
    tss,
    rSquared,
    rSquaredAdjusted,
    significance,
  };
}

/** Evaluate the regression at raw `xBytes`. Reverses internal transform + normalization. */
export function evaluatePolynomial(reg: PolynomialRegression, xBytes: number): number {
  if (reg.xTransform === "log" && !(xBytes > 0)) {
    return Number.NaN;
  }
  const x = reg.xTransform === "log" ? Math.log(xBytes) : xBytes;
  const xn = (x - reg.xMean) / reg.xStd;
  let y = 0;
  let pw = 1;
  for (let k = 0; k < reg.coefficients.length; k++) {
    y += reg.coefficients[k] * pw;
    pw *= xn;
  }
  return y;
}
