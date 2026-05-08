// Map a 1-indexed rank position within a list of `total` items to a 0–10 score
// via an inverse-normal-CDF transform, so the middle of the list is ~5 and tails
// reach the extremes — matches the user's "songs should be normally distributed"
// requirement.

// Acklam's algorithm for the inverse standard normal CDF.
function invNormCdf(p: number): number {
  if (p <= 0 || p >= 1) {
    if (p <= 0) return -Infinity;
    return Infinity;
  }

  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
    1.38357751867269e2, -3.066479806614716e1, 2.506628277459239,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
    6.680131188771972e1, -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
    -2.549732539343734, 4.374664141464968, 2.938163982698783,
  ];
  const d = [
    7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996,
    3.754408661907416,
  ];

  const pLow = 0.02425;
  const pHigh = 1 - pLow;

  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }
  if (p <= pHigh) {
    const q = p - 0.5;
    const r = q * q;
    return (
      ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) *
        q) /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
    );
  }
  const q = Math.sqrt(-2 * Math.log(1 - p));
  return -(
    (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
    ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  );
}

const Z_SCALE = 1.5;

export function rankToScore(position: number, total: number): number {
  if (total <= 0) return 5;
  if (total === 1) return 5;
  // Map position 1 → highest percentile (best song); use (N - i + 0.5) / N
  const percentile = (total - position + 0.5) / total;
  const z = invNormCdf(percentile);
  const score = 5 + z * Z_SCALE;
  return Math.max(0, Math.min(10, score));
}

export function formatScore(score: number): string {
  return score.toFixed(1);
}

// Score is mapped via inverse-normal CDF with stdev = 1.5 (see Z_SCALE
// above). So 1 stdev above the mean = 6.5, 1 below = 3.5. Color bands
// follow that: green for ≥1σ above, yellow within ±1σ, red below.
export function scoreClasses(score: number): { text: string; border: string; bg: string } {
  if (score >= 6.5)
    return {
      text: "text-emerald-400",
      border: "border-emerald-500/40",
      bg: "bg-emerald-500/10",
    };
  if (score >= 3.5)
    return {
      text: "text-amber-300",
      border: "border-amber-400/40",
      bg: "bg-amber-400/10",
    };
  return {
    text: "text-rose-400",
    border: "border-rose-500/40",
    bg: "bg-rose-500/10",
  };
}
