import { describe, expect, it } from 'vitest';
import { DIRS, GENS } from '../src/group';
import { RATIO, REACH } from '../src/motion';
import { ARROW_DEPTH, branchSize, buildTemplate, depthFor, NODE_STRIDE, SEG_STRIDE, SHALLOW_DEPTH } from '../src/tree';

describe('buildTemplate', () => {
  const depth = 7;
  const tpl = buildTemplate(depth);

  it('has 4 branches of (3^depth − 1) / 2 edges and nodes each, back to back', () => {
    const per = (3 ** depth - 1) / 2;
    expect(tpl.segs.length).toBe(4 * per * SEG_STRIDE);
    expect(tpl.nodes.length).toBe(4 * per * NODE_STRIDE);
    GENS.forEach(d => {
      expect(tpl.segRange[d]).toEqual({ start: d * per, count: per });
      expect(tpl.nodeRange[d]).toEqual({ start: d * per, count: per });
    });
  });

  it('starts each branch with its first edge, of length 1, and orders edges by generation', () => {
    GENS.forEach(d => {
      const o = tpl.segRange[d].start * SEG_STRIDE;
      expect([...tpl.segs.slice(o, o + 5)]).toEqual([0, 0, DIRS[d][0], DIRS[d][1], d & 1]);
      let prev = Infinity;
      for (let k = 0; k < tpl.segRange[d].count; k++) {
        const s = (tpl.segRange[d].start + k) * SEG_STRIDE;
        const len = Math.hypot(tpl.segs[s + 2] - tpl.segs[s], tpl.segs[s + 3] - tpl.segs[s + 1]);
        expect(len).toBeLessThanOrEqual(prev + 1e-6);   // positions are float32: ~1e-7 rounding
        prev = len;
      }
    });
  });

  it('stays within the reach of the axes', () => {
    for (let k = 0; k < tpl.nodes.length; k += NODE_STRIDE) {
      expect(Math.abs(tpl.nodes[k]) + Math.abs(tpl.nodes[k + 1])).toBeLessThan(REACH);
    }
  });

  it('records paths of shallow nodes that lead to their positions', () => {
    GENS.forEach(d => {
      expect(tpl.shallow[d].length).toBe(branchSize(SHALLOW_DEPTH));
      for (const n of tpl.shallow[d]) {
        let x = 0, y = 0, len = 1;
        for (const g of n.path) { x += len * DIRS[g][0]; y += len * DIRS[g][1]; len *= RATIO; }
        expect(x).toBeCloseTo(n.x, 5);
        expect(y).toBeCloseTo(n.y, 5);
        expect(n.size).toBeCloseTo(len, 9);
      }
    });
  });

  it('marks the edges near the centre for chevrons', () => {
    expect(tpl.arrowCount).toEqual(GENS.map(() => branchSize(ARROW_DEPTH)));
  });
});

describe('depthFor', () => {
  it('goes deep enough that the smallest edges are under half a pixel', () => {
    for (const unit of [40, 90, 200, 300]) {
      const d = depthFor(unit);
      expect(unit * RATIO ** (d - 1)).toBeLessThan(0.5);
    }
  });
});
