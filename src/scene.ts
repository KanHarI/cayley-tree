// What to draw in one frame, in tree units (see motion.ts), independent of how it is drawn.

import { DIRS, GENS, inv, mul, mulWord, type Gen, type Word } from './group';
import { RATIO, stepPose } from './motion';
import type { TreeTemplate } from './tree';

/** Similarity applied to the template: p ↦ (ox, oy) + scale·p. */
export interface Xform {
  scale: number;
  ox: number;
  oy: number;
}

/** The template (or three of its four branches) placed around one centre. */
export interface Piece {
  xform: Xform;
  /** First directions of the template to draw. */
  dirs: Gen[];
  /** Group element at the template's centre. */
  centre: Word;
}

export interface Seg {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface Scene {
  pieces: Piece[];
  /** During a step, the edge being travelled. It joins the two centres and is not in the template. */
  bridge: (Seg & { gen: 0 | 1 }) | null;
  /** The piece containing e and its geodesic from that piece's centre (the bridge is on it too, if any). */
  home: { piece: Piece; path: Gen[] };
}

export interface Step {
  g: Gen;
  t: number;
}

export const apply = (x: Xform, px: number, py: number): [number, number] => [x.ox + x.scale * px, x.oy + x.scale * py];

/** Generators leading from w back to e: the letters of w, inverted, last first. */
export const pathHome = (w: Word): Gen[] => w.map(inv).reverse();

export function buildScene(cur: Word, step: Step | null): Scene {
  if (!step) {
    const piece: Piece = { xform: { scale: 1, ox: 0, oy: 0 }, dirs: [...GENS], centre: cur };
    return { pieces: [piece], bridge: null, home: { piece, path: pathHome(cur) } };
  }
  const { g, t } = step;
  const { so, sn, co, go } = stepPose(t);
  const [dx, dy] = DIRS[g];
  const next = mul(cur, g);
  const old: Piece = { xform: { scale: so, ox: co * dx, oy: co * dy }, dirs: GENS.filter(i => i !== g), centre: cur };
  const neu: Piece = { xform: { scale: sn, ox: go * dx, oy: go * dy }, dirs: GENS.filter(i => i !== inv(g)), centre: next };
  const bridge = { x0: old.xform.ox, y0: old.xform.oy, x1: neu.xform.ox, y1: neu.xform.oy, gen: (g & 1) as 0 | 1 };
  // e lies behind the old centre when the step leads away from it, and ahead of the new one otherwise.
  const home = next.length > cur.length ? { piece: old, path: pathHome(cur) } : { piece: neu, path: pathHome(next) };
  return { pieces: [old, neu], bridge, home };
}

/** Points along the geodesic from e's piece centre towards e, in tree units, up to `depth` edges. */
export function homePoints(scene: Scene, depth: number): { x: number; y: number; size: number }[] {
  const { piece, path } = scene.home;
  const pts = [{ x: piece.xform.ox, y: piece.xform.oy, size: piece.xform.scale }];
  let x = 0, y = 0, len = 1;
  for (let k = 0; k < Math.min(path.length, depth); k++) {
    x += len * DIRS[path[k]][0];
    y += len * DIRS[path[k]][1];
    len *= RATIO;
    const [px, py] = apply(piece.xform, x, y);
    pts.push({ x: px, y: py, size: len * piece.xform.scale });
  }
  return pts;
}

export interface NodeView {
  x: number;
  y: number;
  /** Length of the edges leaving the node, in units: 1 at the centre. */
  size: number;
  word: Gen[];
}

/** Nodes at least `minSize` units big, with their group elements (shallow nodes only). */
export function visibleNodes(scene: Scene, tpl: TreeTemplate, minSize: number): NodeView[] {
  const out: NodeView[] = [];
  for (const piece of scene.pieces) {
    const { scale, ox, oy } = piece.xform;
    if (scale >= minSize) out.push({ x: ox, y: oy, size: scale, word: piece.centre.slice() });
    for (const d of piece.dirs) {
      for (const n of tpl.shallow[d]) {
        const size = n.size * scale;
        if (size < minSize) break;   // breadth-first order: everything after is no bigger
        out.push({ x: ox + scale * n.x, y: oy + scale * n.y, size, word: mulWord(piece.centre, n.path) });
      }
    }
  }
  return out;
}
