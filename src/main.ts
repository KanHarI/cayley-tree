import './styles.css';
import { bindControls, type Settings } from './controls';
import { wordKey } from './group';
import { unitPx } from './motion';
import { Navigator } from './navigation';
import { GLRenderer, type View } from './render/glRenderer';
import { hitNodes, Overlay } from './render/overlay';
import { buildScene, type Scene } from './scene';
import { onThemeChange, readTheme } from './theme';
import { buildTemplate, depthFor, type TreeTemplate } from './tree';

const stage = document.getElementById('stage') as HTMLElement;
const glCanvas = document.getElementById('gl') as HTMLCanvasElement;
const overlayCanvas = document.getElementById('cv') as HTMLCanvasElement;

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const settings: Settings = { labels: true, path: true, arrows: true };
const nav = new Navigator(reduceMotion ? 200 : 1000);

let renderer: GLRenderer | null = null;
try {
  renderer = new GLRenderer(glCanvas, () => requestRender());
} catch (err) {
  console.error(err);
  (document.getElementById('nogl') as HTMLElement).hidden = false;
}
const overlay = new Overlay(overlayCanvas);

let colours = readTheme();
renderer?.setPalette(colours.palette);

let template: TreeTemplate | null = null;
let view: View = { ox: 0, oy: 0, unit: 1 };
let scene: Scene = buildScene(nav.cur, null);
let hoverKey: string | null = null;

const controls = bindControls(nav, settings, () => requestRender());

// ---------- frame loop ----------
let rafId = 0;
function requestRender(): void {
  if (!rafId) rafId = requestAnimationFrame(frame);
}

function frame(now: number): void {
  rafId = 0;
  if (!template) return;
  scene = buildScene(nav.cur, nav.advance(now));
  renderer?.draw(scene, view, settings);
  overlay.draw(scene, template, view, colours.theme, { labels: settings.labels, hoverKey });
  if (nav.animating) requestRender();
}

nav.onChange = () => {
  controls.update();
  requestRender();
};

// ---------- size ----------
new ResizeObserver(() => {
  const r = stage.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  view = { ox: r.width / 2, oy: r.height / 2, unit: unitPx(r.width, r.height) };
  renderer?.resize(r.width, r.height, dpr);
  overlay.resize(r.width, r.height, dpr);
  const depth = depthFor(view.unit);
  if (template?.depth !== depth) {
    template = buildTemplate(depth);
    renderer?.setTemplate(template);
  }
  controls.fitWord();
  requestRender();
}).observe(stage);

// ---------- pointer ----------
let pointerKind = 'mouse';
overlayCanvas.addEventListener('pointerdown', ev => { pointerKind = ev.pointerType; });

function nearest(ev: MouseEvent) {
  if (!template) return null;
  const r = overlayCanvas.getBoundingClientRect();
  const x = ev.clientX - r.left;
  const y = ev.clientY - r.top;
  const reach = pointerKind === 'mouse' ? 18 : 30;   // fingers are less precise than a cursor
  let best = null;
  let bd = reach * reach;
  for (const n of hitNodes(scene, template, view)) {
    const d = (view.ox + view.unit * n.x - x) ** 2 + (view.oy + view.unit * n.y - y) ** 2;
    if (d < bd) {
      bd = d;
      best = n;
    }
  }
  return best;
}

overlayCanvas.addEventListener('pointermove', ev => {
  if (ev.pointerType !== 'mouse') return;
  const n = nearest(ev);
  overlayCanvas.style.cursor = n ? 'pointer' : 'default';
  const k = n ? wordKey(n.word) : null;
  if (k !== hoverKey) {
    hoverKey = k;
    requestRender();
  }
});
overlayCanvas.addEventListener('pointerleave', () => {
  if (hoverKey !== null) {
    hoverKey = null;
    requestRender();
  }
});
overlayCanvas.addEventListener('click', ev => {
  const n = nearest(ev);
  if (n) nav.travelTo(n.word);
});

// ---------- theme ----------
const retheme = () => {
  colours = readTheme();
  renderer?.setPalette(colours.palette);
  requestRender();
};
onThemeChange(retheme);
document.fonts?.ready.then(() => requestRender());

controls.update();
requestRender();
