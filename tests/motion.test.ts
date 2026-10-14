import { describe, expect, it } from 'vitest';
import { ease, RATIO, REACH, stepPose } from '../src/motion';
import { clearance } from './clearance';

const samples = (n: number) => Array.from({ length: n + 1 }, (_, k) => k / n);

describe('ease', () => {
  it('is the quintic smootherstep curve', () => {
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBeCloseTo(1, 12);
    expect(ease(0.5)).toBeCloseTo(0.5, 12);
    expect(ease(0.25)).toBeCloseTo(0.103515625, 12);
  });
});

describe('stepPose', () => {
  it('starts with the old centre in the middle and the new one a unit ahead', () => {
    const p = stepPose(0);
    expect(p.so).toBeCloseTo(1, 12);
    expect(p.sn).toBeCloseTo(RATIO, 12);
    expect(p.co).toBeCloseTo(0, 12);
    expect(p.go).toBeCloseTo(1, 12);
  });

  it('ends with the new centre in the middle and the old one a unit behind', () => {
    const p = stepPose(1);
    expect(p.so).toBeCloseTo(RATIO, 12);
    expect(p.sn).toBeCloseTo(1, 12);
    expect(p.co).toBeCloseTo(-1, 12);
    expect(p.go).toBeCloseTo(0, 12);
  });

  it('keeps both ends of the axis fixed', () => {
    for (const t of samples(50)) {
      const { so, sn, co, go } = stepPose(t);
      expect(co - so * REACH).toBeCloseTo(-REACH, 12);   // far end of the old half, behind
      expect(go + sn * REACH).toBeCloseTo(REACH, 12);    // far end of the new half, ahead
    }
  });

  it('keeps both halves moving throughout the step, without pauses or reversals', () => {
    let prev = stepPose(0);
    for (const t of samples(200).slice(1)) {
      const p = stepPose(t);
      expect(p.so).toBeLessThan(prev.so);
      expect(p.sn).toBeGreaterThan(prev.sn);
      expect(p.co).toBeLessThan(prev.co);
      expect(p.go).toBeLessThan(prev.go);
      prev = p;
    }
  });

  it('starts and finishes both halves with zero velocity', () => {
    const h = 1e-5;
    const start = stepPose(0), justAfter = stepPose(h);
    const justBefore = stepPose(1 - h), end = stepPose(1);
    for (const key of ['so', 'sn', 'co', 'go'] as const) {
      expect(Math.abs((justAfter[key] - start[key]) / h)).toBeLessThan(1e-4);
      expect(Math.abs((end[key] - justBefore[key]) / h)).toBeLessThan(1e-4);
    }
  });

  it('starts and finishes both halves with zero acceleration', () => {
    const h = 1e-4;
    for (const endpoint of [0, 1]) {
      const dt = endpoint === 0 ? h : -h;
      const p0 = stepPose(endpoint), p1 = stepPose(endpoint + dt), p2 = stepPose(endpoint + 2 * dt);
      for (const key of ['so', 'sn', 'co', 'go'] as const) {
        // One-sided finite difference near the endpoint; cosine retains nonzero acceleration here.
        const acceleration = (p2[key] - 2 * p1[key] + p0[key]) / (h * h);
        expect(Math.abs(acceleration)).toBeLessThan(0.02);
      }
    }
  });

  it('exchanges the two halves when time is reversed', () => {
    for (const t of samples(50)) {
      const forward = stepPose(t), backward = stepPose(1 - t);
      expect(forward.so).toBeCloseTo(backward.sn, 12);
      expect(forward.sn).toBeCloseTo(backward.so, 12);
      expect(forward.co).toBeCloseTo(-backward.go, 12);
      expect(forward.go).toBeCloseTo(-backward.co, 12);
    }
  });

  it('holds the endpoint poses outside the step interval', () => {
    expect(stepPose(-0.1)).toEqual(stepPose(0));
    expect(stepPose(1.1)).toEqual(stepPose(1));
  });
});

describe('the two halves during a step', () => {
  const restGap = (() => { const p = stepPose(0); return clearance(p.co, p.so, p.go, p.sn); })();
  it('never come closer than they are at rest', () => {
    expect(restGap).toBeGreaterThan(0.1);
    for (const t of samples(60)) {
      const p = stepPose(t);
      expect(clearance(p.co, p.so, p.go, p.sn)).toBeGreaterThanOrEqual(restGap * 0.999);
    }
  }, 15_000);

  it('keeps the opposing side-branch bounds apart and the bridge at least one unit long', () => {
    expect(RATIO).toBeLessThan(0.5);
    for (const t of samples(200)) {
      const { so, sn, co, go } = stepPose(t);
      expect(Math.min(RATIO * so + sn, so + RATIO * sn)).toBeLessThanOrEqual(2 * RATIO + 1e-12);
      expect(go - co).toBeGreaterThanOrEqual(1 - 1e-12);
    }
  });
});
