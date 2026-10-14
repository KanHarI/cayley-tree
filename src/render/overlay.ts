// A 2D canvas over the WebGL one for the few things that are text or need it: labels, the marker
// on e, the dashed viewpoint ring and the hover tooltip.

import { runs, runText, wordKey, wordText, type Word } from '../group';
import { clamp01 } from '../motion';
import { homePoints, visibleNodes, type NodeView, type Scene } from '../scene';
import type { TreeTemplate } from '../tree';
import type { View } from './glRenderer';

export interface Theme {
  plate: string;
  ink: string;
  muted: string;
  ident: string;
  fontMath: string;
}

export interface OverlayOptions {
  labels: boolean;
  hoverKey: string | null;
}

export class Overlay {
  private ctx: CanvasRenderingContext2D;
  private width = 1;
  private height = 1;
  private dpr = 1;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available');
    this.ctx = ctx;
  }

  resize(width: number, height: number, dpr: number): void {
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    this.canvas.width = Math.max(1, Math.round(width * dpr));
    this.canvas.height = Math.max(1, Math.round(height * dpr));
  }

  draw(scene: Scene, tpl: TreeTemplate, view: View, theme: Theme, opts: OverlayOptions): void {
    const { ctx } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    const px = (x: number, y: number): [number, number] => [view.ox + view.unit * x, view.oy + view.unit * y];

    // marker on e, when it is close enough to be drawn
    const home = homePoints(scene, tpl.depth);
    if (scene.home.path.length < home.length) {
      const e = home[home.length - 1];
      const sz = e.size * view.unit;
      if (sz >= 1.6) {
        const [x, y] = px(e.x, e.y);
        ctx.fillStyle = theme.ident;
        ctx.beginPath();
        ctx.arc(x, y, Math.max(3, Math.min(11, sz * 0.06)), 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = theme.plate;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    // fixed viewpoint ring
    ctx.strokeStyle = theme.muted;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.arc(view.ox, view.oy, 18, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // labels, fading in and out with the size of their junction
    if (opts.labels) {
      const labelMin = Math.min(58, view.unit * 0.4);
      ctx.textBaseline = 'alphabetic';
      ctx.lineJoin = 'round';
      for (const n of visibleNodes(scene, tpl, (labelMin * 0.8) / view.unit)) {
        const sz = n.size * view.unit;
        const fs = Math.max(13, Math.min(25, sz * 0.12));
        ctx.font = `italic ${fs}px ${theme.fontMath}`;
        const [x, y] = px(n.x, n.y);
        const label = this.fitLabel(n.word, sz - 12);   // stop short of the next junction to the right
        ctx.globalAlpha = clamp01((sz - labelMin * 0.8) / (labelMin * 0.2));
        ctx.strokeStyle = theme.plate;
        ctx.lineWidth = 4;
        ctx.strokeText(label, x + 7, y - 7);
        ctx.fillStyle = n.word.length ? theme.ink : theme.ident;
        ctx.fillText(label, x + 7, y - 7);
      }
      ctx.globalAlpha = 1;
    }

    // hover ring and tooltip
    if (opts.hoverKey !== null) {
      const h = hitNodes(scene, tpl, view).find(n => wordKey(n.word) === opts.hoverKey);
      if (h) {
        const [x, y] = px(h.x, h.y);
        ctx.strokeStyle = theme.ink;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, y, 10, 0, Math.PI * 2);
        ctx.stroke();
        const txt = wordText(h.word);
        ctx.font = `italic 15px ${theme.fontMath}`;
        const tw = ctx.measureText(txt).width;
        let bx = x + 14;
        let by = y + 14;
        if (bx + tw + 14 > this.width) bx = x - tw - 26;
        if (by + 26 > this.height) by = y - 40;
        ctx.fillStyle = theme.ink;
        ctx.fillRect(bx, by, tw + 14, 24);
        ctx.fillStyle = theme.plate;
        ctx.fillText(txt, bx + 7, by + 17);
      }
    }
  }

  /** The label for w that fits maxW px in the current font, dropping leading runs behind an ellipsis. */
  private fitLabel(w: Word, maxW: number): string {
    const { ctx } = this;
    const full = wordText(w);
    if (ctx.measureText(full).width <= maxW) return full;
    let rs = runs(w).slice(-40);
    let s = '…' + rs.map(runText).join('');
    while (rs.length > 1 && ctx.measureText(s).width > maxW) {
      rs = rs.slice(1);
      s = '…' + rs.map(runText).join('');
    }
    return s;
  }
}

/** Junctions big enough to click (7 px and up). */
export const hitNodes = (scene: Scene, tpl: TreeTemplate, view: View): NodeView[] => visibleNodes(scene, tpl, 7 / view.unit);
