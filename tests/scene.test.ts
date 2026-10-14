import { describe, expect, it } from 'vitest';
import { wordKey, type Gen } from '../src/group';
import { RATIO } from '../src/motion';
import { buildScene, homePoints, pathHome, visibleNodes } from '../src/scene';
import { buildTemplate } from '../src/tree';

const A: Gen = 0, B: Gen = 1, Ai: Gen = 2, Bi: Gen = 3;
const tpl = buildTemplate(7);

describe('buildScene', () => {
  it('draws the whole template around the centre at rest', () => {
    const s = buildScene([A, B], null);
    expect(s.pieces).toHaveLength(1);
    expect(s.pieces[0]).toMatchObject({ xform: { scale: 1, ox: 0, oy: 0 }, dirs: [0, 1, 2, 3], centre: [A, B] });
    expect(s.bridge).toBeNull();
    expect(s.home.path).toEqual([Bi, Ai]);
  });

  it('splits a step into the old half, the bridge and the new half', () => {
    const s = buildScene([B], { g: A, t: 0 });
    const [old, neu] = s.pieces;
    expect(old.dirs).toEqual([1, 2, 3]);
    expect(neu.dirs).toEqual([0, 1, 3]);
    expect(neu.centre).toEqual([B, A]);
    // at t = 0 this is exactly the resting picture: the new centre is the neighbour a, at size r
    expect(neu.xform.scale).toBeCloseTo(RATIO, 12);
    expect(neu.xform.ox).toBeCloseTo(1, 12);
    const b = s.bridge!;
    expect(b.gen).toBe(0);
    expect([b.x0, b.y0, b.x1, b.y1].map(v => +v.toFixed(12) + 0)).toEqual([0, 0, 1, 0]);   // + 0 turns −0 into 0
  });

  it('finds e behind the old centre when stepping away from it, and ahead of the new one otherwise', () => {
    const away = buildScene([B], { g: A, t: 0.5 });
    expect(away.home.piece).toBe(away.pieces[0]);
    expect(away.home.path).toEqual([Bi]);
    const back = buildScene([B, A], { g: Ai, t: 0.5 });
    expect(back.home.piece).toBe(back.pieces[1]);
    expect(back.home.path).toEqual([Bi]);
  });
});

describe('homePoints', () => {
  it('walks the geodesic back to e with shrinking edges', () => {
    const pts = homePoints(buildScene([A, A], null), 7);
    expect(pts.map(p => [p.x, p.y])).toEqual([[0, 0], [-1, 0], [-1 - RATIO, 0]]);
    expect(pathHome([A, B])).toEqual([Bi, Ai]);
  });
});

describe('visibleNodes', () => {
  it('names the junctions around the centre', () => {
    const nodes = visibleNodes(buildScene([A], null), tpl, 0.4);
    expect(nodes.map(n => wordKey(n.word)).sort()).toEqual(['', '0', '00', '01', '03'].sort());
  });

  it('includes both centres mid-step', () => {
    const nodes = visibleNodes(buildScene([], { g: B, t: 0.5 }), tpl, 0.6);
    expect(nodes.map(n => wordKey(n.word)).sort()).toEqual(['', '1']);
  });
});
