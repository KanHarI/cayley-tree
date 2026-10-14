# Cayley tree of F₂

An interactive walk through the Cayley graph of the free group on two generators, ⟨a, b⟩.
Every junction is a reduced word; a step multiplies by a generator and re-centres the view, and
because the tree looks the same from every junction, each step is a symmetry of the whole graph.

Live at **https://kanhari.github.io/cayley-tree/**

## Development

```sh
npm install
npm run dev        # local server with hot reload
npm test           # unit tests (Vitest)
npm run build      # type-check, then build to dist/
npm run preview    # serve the production build
```

## How it works

### The animation

Distances are measured in units of the edges at the centre; each generation further out is
`RATIO` = 0.48 times shorter, so the ray along any generator ends at `REACH` = 1/(1 − r).

A step by g moves the viewpoint from w to w·g. The picture before and after is the same, and the
two ends of the axis in direction g, g⁻∞ behind and g⁺∞ ahead, are at ∓`REACH` both times. The
step is a translation along that axis, which, like a hyperbolic translation, fixes its two ends. So
the old centre's half of the tree is scaled about g⁻∞ and the new centre's half about g⁺∞
(`stepPose` in `src/motion.ts`): every point moves in a straight line, one way only, and each half's
position follows from its size.

Both halves move throughout the whole step, starting and finishing together with zero velocity.
One sine ease-in-out clock, `u = (1 − cos πt)/2`, interpolates their reciprocal sizes:

```text
oldScale = r / (r + (1 − r)u)    // 1 → r
newScale = r / (1 − (1 − r)u)    // r → 1
```

This leaves room for the side branches to pass without intersecting. Beyond its first edge, each
side branch fits inside a diamond of radius `scale·r/(1 − r)`. The scales satisfy
`min(r·oldScale + newScale, oldScale + r·newScale) ≤ 2r < 1`, keeping the opposing diamonds apart;
the connecting edge remains at least one unit long. At the midpoint both scales are `2r/(1 + r)`
and the connecting edge stretches to about 1.351 units. `tests/motion.test.ts` checks fixed tips,
motion throughout the step, endpoint velocities, and clearance between the two halves.

### Rendering

The tree around a centre is built once (`src/tree.ts`) and uploaded to the GPU, grouped by the
first direction out of the centre. Every frame draws that same geometry: at rest as is, and during a
step once per half, under that half's scale and offset (`src/scene.ts`). Edges, junctions and
orientation chevrons are instanced quads shaded by signed distance (`src/render/shaders.ts`), which
gives round caps and one device pixel of antialiasing, and lets anything under a pixel fade out
rather than pop. Text and a few markers go on a 2D canvas above (`src/render/overlay.ts`).

| File | Purpose |
| --- | --- |
| `src/group.ts` | Words in F₂: reduction, formatting, parsing typed words |
| `src/motion.ts` | Units, easing, and the pose of the two halves during a step |
| `src/tree.ts` | The tree template that lives on the GPU |
| `src/scene.ts` | What to draw in a frame: pieces, the travelled edge, the way home to e |
| `src/navigation.ts` | The step queue, random walk, undo and the animation clock |
| `src/render/` | WebGL2 renderer, shaders and the 2D overlay |
| `src/controls.ts` | Side panel and keyboard |
| `tests/` | Unit tests, including the collision check for the animation |

## Deployment

`.github/workflows/deploy.yml` tests and builds every push to `main` and deploys `dist/` to GitHub
Pages. In the repository settings, Pages must use **GitHub Actions** as its source.
