import { describe, expect, it } from 'vitest';
import type { Gen } from '../src/group';
import { Navigator } from '../src/navigation';

const A: Gen = 0, B: Gen = 1, Ai: Gen = 2, Bi: Gen = 3;

/** A navigator on a fake clock that runs every queued step to completion. */
function setup(random = () => 0) {
  let now = 0;
  const nav = new Navigator(100, () => now, random);
  const run = (limit = 1000) => {
    while (nav.animating && limit-- > 0) {
      now += 10;
      nav.advance(now);
    }
  };
  return { nav, run, tick: (ms: number) => { now += ms; return nav.advance(now); } };
}

describe('Navigator', () => {
  it('animates a step and lands on the product', () => {
    const { nav, tick } = setup();
    nav.enqueue(A);
    expect(tick(50)).toEqual({ g: A, t: 0.5 });
    expect(nav.cur).toEqual([]);
    expect(tick(50)).toBeNull();
    expect(nav.cur).toEqual([A]);
    expect(nav.steps).toBe(1);
  });

  it('runs queued steps in order, reducing as it goes', () => {
    const { nav, run } = setup();
    [A, B, Bi, B].forEach(g => nav.enqueue(g));
    expect(nav.pending).toBe(4);
    run();
    expect(nav.cur).toEqual([A, B]);
    expect(nav.steps).toBe(4);
  });

  it('travels along the geodesic to a target', () => {
    const { nav, run } = setup();
    [A, B].forEach(g => nav.enqueue(g));
    run();
    const moves: Gen[] = [];
    const orig = nav.enqueue.bind(nav);
    nav.enqueue = (g: Gen, record?: boolean) => { moves.push(g); orig(g, record); };
    nav.travelTo([A, Bi]);
    expect(moves).toEqual([Bi, Bi]);   // back to a, then on to ab⁻¹
    run();
    expect(nav.cur).toEqual([A, Bi]);
  });

  it('undoes steps one at a time', () => {
    const { nav, run } = setup();
    [A, B].forEach(g => nav.enqueue(g));
    run();
    nav.undo();
    run();
    expect(nav.cur).toEqual([A]);
    nav.undo();
    nav.undo();   // nothing left to undo
    run();
    expect(nav.cur).toEqual([]);
  });

  it('keeps walking at random until stopped', () => {
    const seq = [0.1, 0.3, 0.6, 0.9];   // → a, b, a⁻¹, b⁻¹
    let k = 0;
    const { nav, tick } = setup(() => seq[k++ % seq.length]);
    nav.setWalking(true);
    for (let i = 0; i < 400 && nav.steps < 3; i++) tick(10);
    expect(nav.steps).toBe(3);
    expect(nav.cur).toEqual([A, B, Ai]);
    nav.setWalking(false);
    for (let i = 0; i < 100; i++) tick(10);
    expect(nav.animating).toBe(false);
    expect(nav.cur).toEqual([A, B, Ai, Bi]);   // the step under way when stopped still finishes
  });
});
