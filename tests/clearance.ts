// Test helper: how close the two halves of the tree come to each other mid-step.
//
// Takes the step along a (to the right): the old half is centred at x = co with its up, left and
// down branches at size so; the new half is centred at x = go with its up, right and down branches at
// size sn. Returns the smallest distance between any edge of one half and any edge of the other, in
// units, exploring both trees by branch-and-bound on bounding boxes down to edges of length EPS.

import { DIRS, GENS, inv, type Gen } from '../src/group';
import { RATIO } from '../src/motion';

const EPS = 4e-4;

interface Node {
  px: number; py: number; qx: number; qy: number;
  i: Gen;
  len: number;
  leaf: boolean;
  x0: number; x1: number; y0: number; y1: number;
}

function subtree(px: number, py: number, i: Gen, len: number): Node {
  const qx = px + len * DIRS[i][0], qy = py + len * DIRS[i][1];
  const ext = (len * RATIO) / (1 - RATIO);   // how far the branches beyond q can reach
  return {
    px, py, qx, qy, i, len, leaf: false,
    x0: Math.min(px, qx - ext), x1: Math.max(px, qx + ext), y0: Math.min(py, qy - ext), y1: Math.max(py, qy + ext),
  };
}

const edgeOnly = (s: Node): Node => ({
  ...s, leaf: true, x0: Math.min(s.px, s.qx), x1: Math.max(s.px, s.qx), y0: Math.min(s.py, s.qy), y1: Math.max(s.py, s.qy),
});

const boxDist = (a: Node, b: Node) =>
  Math.hypot(Math.max(0, a.x0 - b.x1, b.x0 - a.x1), Math.max(0, a.y0 - b.y1, b.y0 - a.y1));

function parts(s: Node): Node[] | null {
  if (s.leaf || s.len < EPS) return null;
  return [edgeOnly(s), ...GENS.filter(j => j !== inv(s.i)).map(j => subtree(s.qx, s.qy, j, s.len * RATIO))];
}

export function clearance(co: number, so: number, go: number, sn: number): number {
  let best = Infinity;
  const visit = (a: Node, b: Node): void => {
    if (boxDist(a, b) >= best) return;
    const pa = parts(a), pb = parts(b);
    if (!pa && !pb) {
      best = Math.min(best, boxDist(edgeOnly(a), edgeOnly(b)));   // axis-aligned edges: box distance is exact
      return;
    }
    if (pa && (!pb || a.len >= b.len)) for (const e of pa) visit(e, b);
    else for (const e of pb!) visit(a, e);
  };
  for (const i of [1, 2, 3] as Gen[]) for (const j of [0, 1, 3] as Gen[]) visit(subtree(co, 0, i, so), subtree(go, 0, j, sn));
  return best;
}
