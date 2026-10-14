// Geometry of the drawing and of a single step.
//
// Units: the edges at the centre have length 1, and each generation further out is RATIO times
// shorter. The ray along any generator therefore ends at distance REACH = 1 + r + r² + … = 1/(1 − r).
//
// A step by g moves the viewpoint from w to w·g. The tree looks the same before and after, and the
// two ends of the axis through the centre in direction g (g^−∞ behind, g^+∞ ahead) sit at ∓REACH both
// times: the step is a translation along that axis, which, like a hyperbolic translation, fixes its
// two ends. So the animation scales the old centre's half of the tree about g^−∞ and the new centre's
// half about g^+∞. Every point moves in a straight line, and each half's position follows from its size.

export const RATIO = 0.48;
export const REACH = 1 / (1 - RATIO);

/** Quintic smootherstep: zero velocity and acceleration at both endpoints. */
export const ease = (p: number): number => 6 * p ** 5 - 15 * p ** 4 + 10 * p ** 3;
export const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

export interface StepPose {
  /** Size of the old centre's half: 1 → RATIO. */
  so: number;
  /** Size of the new centre's half: RATIO → 1. */
  sn: number;
  /** Signed distance of the old centre from the view centre along g: 0 → −1. */
  co: number;
  /** Signed distance of the new centre from the view centre along g: 1 → 0. */
  go: number;
}

/**
 * Pose of the two halves at time t ∈ [0, 1] of a step.
 * Interpolate reciprocal sizes on one quintic clock, so both halves move for the whole step and
 * start and finish with zero velocity and acceleration. For r < 1/2,
 * min(r·so + sn, so + r·sn) ≤ 2r < 1 keeps the opposing
 * side branches' bounding diamonds apart (see tests/motion.test.ts).
 */
export function stepPose(t: number): StepPose {
  const u = ease(clamp01(t));
  const so = RATIO / (RATIO + (1 - RATIO) * u);
  const sn = RATIO / (1 - (1 - RATIO) * u);
  // Scaling about g^−∞ = −REACH by so puts the old centre at −REACH·(1 − so); likewise about g^+∞.
  return { so, sn, co: -REACH * (1 - so), go: REACH * (1 - sn) };
}

/** Pixels per unit for a stage of the given size: the tree fills 94% of the shorter side. */
export const unitPx = (width: number, height: number): number => 0.47 * Math.min(width, height) * (1 - RATIO);

/** Drawn width of an edge whose drawn length is len px. */
export const edgeWidth = (len: number): number => Math.max(0.55, Math.min(3.2, len * 0.016));
