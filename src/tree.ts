// The drawing of the tree around a centre, built once and uploaded to the GPU.
//
// Every frame draws this same template: at rest once as is, and during a step once per half under
// that half's scaling (see motion.ts). Only which of the four first branches are drawn, and the
// scale and offset applied to them, change from frame to frame.

import { DIRS, GENS, inv, type Gen } from './group';
import { RATIO } from './motion';

/** Floats per segment: x0, y0, x1, y1, gen (0 = a-edge, 1 = b-edge). */
export const SEG_STRIDE = 5;
/** Floats per node: x, y, size (the length of the edges leaving the node). */
export const NODE_STRIDE = 3;
/** Edges within this many generations of the centre get orientation chevrons. */
export const ARROW_DEPTH = 6;
/** Nodes within this many generations keep their path, for labels and hit testing. */
export const SHALLOW_DEPTH = 6;

export interface Range {
  start: number;
  count: number;
}

export interface ShallowNode {
  x: number;
  y: number;
  size: number;
  /** Generators from the centre to this node. */
  path: Gen[];
}

export interface TreeTemplate {
  depth: number;
  /** Segments, grouped by the first direction out of the centre, and by generation within a group. */
  segs: Float32Array;
  nodes: Float32Array;
  segRange: Range[];
  nodeRange: Range[];
  /** Per first direction, the number of leading segments that are within ARROW_DEPTH generations. */
  arrowCount: number[];
  shallow: ShallowNode[][];
}

/** Generations needed for the smallest edges to be under half a pixel, when 1 unit is `unit` px. */
export function depthFor(unit: number): number {
  return Math.max(6, Math.min(10, Math.ceil(1 + Math.log(0.5 / unit) / Math.log(RATIO))));
}

/** Number of edges (and of nodes) in one first-direction branch, to the given depth. */
export const branchSize = (depth: number): number => (3 ** depth - 1) / 2;

export function buildTemplate(depth: number): TreeTemplate {
  const per = branchSize(depth);
  const segs = new Float32Array(4 * per * SEG_STRIDE);
  const nodes = new Float32Array(4 * per * NODE_STRIDE);
  const segRange: Range[] = [];
  const nodeRange: Range[] = [];
  const shallow: ShallowNode[][] = [];
  let s = 0;
  let n = 0;
  const pushSeg = (x0: number, y0: number, x1: number, y1: number, g: Gen) => {
    segs.set([x0, y0, x1, y1, g & 1], s * SEG_STRIDE);
    s++;
  };

  for (const first of GENS) {
    segRange.push({ start: s, count: per });
    nodeRange.push({ start: n, count: per });
    const near: ShallowNode[] = [];
    shallow.push(near);

    // Breadth first, so each generation is contiguous. The frontier holds the nodes of generation k.
    let xs = [DIRS[first][0]];
    let ys = [DIRS[first][1]];
    let ds: Gen[] = [first];
    let paths: Gen[][] = [[first]];
    pushSeg(0, 0, xs[0], ys[0], first);
    for (let k = 1; k <= depth; k++) {
      const len = RATIO ** k;   // nodes of generation k are this size, and so are the edges leaving them
      for (let j = 0; j < xs.length; j++) {
        nodes.set([xs[j], ys[j], len], n * NODE_STRIDE);
        n++;
        if (k <= SHALLOW_DEPTH) near.push({ x: xs[j], y: ys[j], size: len, path: paths[j] });
      }
      if (k === depth) break;
      const nx: number[] = [], ny: number[] = [], nd: Gen[] = [], np: Gen[][] = [];
      for (let j = 0; j < xs.length; j++) {
        for (const c of GENS) {
          if (c === inv(ds[j])) continue;
          const cx = xs[j] + len * DIRS[c][0];
          const cy = ys[j] + len * DIRS[c][1];
          pushSeg(xs[j], ys[j], cx, cy, c);
          nx.push(cx); ny.push(cy); nd.push(c);
          if (k < SHALLOW_DEPTH) np.push([...paths[j], c]);
        }
      }
      xs = nx; ys = ny; ds = nd; paths = np;
    }
  }

  const arrowCount = GENS.map(() => branchSize(Math.min(ARROW_DEPTH, depth)));
  return { depth, segs, nodes, segRange, nodeRange, arrowCount, shallow };
}
