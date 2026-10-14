// WebGL2 renderer for the tree. The template's geometry lives on the GPU; each frame only sets a
// scale and offset per piece and issues a few instanced draws, so the cost doesn't depend on how
// many edges are visible.

import { homePoints, type Piece, type Scene } from '../scene';
import { NODE_STRIDE, SEG_STRIDE, type TreeTemplate } from '../tree';
import { arrowFS, arrowVS, dotFS, dotVS, segmentFS, segmentVS } from './shaders';

export type RGB = [number, number, number];

export interface Palette {
  plate: RGB;
  ink: RGB;
  genA: RGB;
  genB: RGB;
  ident: RGB;
}

export interface View {
  /** Centre of the view, CSS px. */
  ox: number;
  oy: number;
  /** CSS px per unit. */
  unit: number;
}

export interface DrawOptions {
  arrows: boolean;
  path: boolean;
}

const GLOW_OPACITY = 0.32;
/** Room in the per-frame buffer for the geodesic glow and the bridge. */
const DYN_SEGS = 32;

type Uniforms = Record<string, WebGLUniformLocation | null>;

interface Program {
  prog: WebGLProgram;
  u: Uniforms;
}

export class GLRenderer {
  private gl: WebGL2RenderingContext;
  private tpl: TreeTemplate | null = null;
  private palette: Palette | null = null;
  private width = 1;
  private height = 1;
  private dpr = 1;
  private lost = false;

  // GPU resources, (re)created by init()
  private seg!: Program;
  private dot!: Program;
  private arrow!: Program;
  private quad!: WebGLBuffer;
  private segBuf!: WebGLBuffer;
  private nodeBuf!: WebGLBuffer;
  private dynSegBuf!: WebGLBuffer;
  private dynNodeBuf!: WebGLBuffer;
  private segVao!: WebGLVertexArrayObject;
  private nodeVao!: WebGLVertexArrayObject;
  private dynSegVao!: WebGLVertexArrayObject;
  private dynNodeVao!: WebGLVertexArrayObject;
  private dynSegs = new Float32Array(DYN_SEGS * SEG_STRIDE);
  private dynNodes = new Float32Array(2 * NODE_STRIDE);

  constructor(private readonly canvas: HTMLCanvasElement, private readonly onRestore: () => void) {
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, premultipliedAlpha: true, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL2 is not available');
    this.gl = gl;
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); this.lost = true; });
    canvas.addEventListener('webglcontextrestored', () => {
      this.lost = false;
      this.init();
      if (this.tpl) this.setTemplate(this.tpl);
      this.onRestore();
    });
    this.init();
  }

  private init(): void {
    const gl = this.gl;
    this.seg = this.program(segmentVS, segmentFS, ['u_view', 'u_res', 'u_xform', 'u_widthLen', 'u_widen', 'u_colA', 'u_colB', 'u_colFixed', 'u_useFixed', 'u_opacity']);
    this.dot = this.program(dotVS, dotFS, ['u_view', 'u_res', 'u_xform', 'u_color']);
    this.arrow = this.program(arrowVS, arrowFS, ['u_view', 'u_res', 'u_xform', 'u_colA', 'u_colB']);

    this.quad = this.buffer(new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    this.segBuf = this.buffer(new Float32Array(SEG_STRIDE), gl.STATIC_DRAW);
    this.nodeBuf = this.buffer(new Float32Array(NODE_STRIDE), gl.STATIC_DRAW);
    this.dynSegBuf = this.buffer(this.dynSegs, gl.DYNAMIC_DRAW);
    this.dynNodeBuf = this.buffer(this.dynNodes, gl.DYNAMIC_DRAW);
    this.segVao = this.vao(this.segBuf, SEG_STRIDE);
    this.nodeVao = this.vao(this.nodeBuf, NODE_STRIDE);
    this.dynSegVao = this.vao(this.dynSegBuf, SEG_STRIDE);
    this.dynNodeVao = this.vao(this.dynNodeBuf, NODE_STRIDE);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);   // premultiplied alpha
    gl.disable(gl.DEPTH_TEST);
  }

  setTemplate(tpl: TreeTemplate): void {
    this.tpl = tpl;
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.segBuf);
    gl.bufferData(gl.ARRAY_BUFFER, tpl.segs, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nodeBuf);
    gl.bufferData(gl.ARRAY_BUFFER, tpl.nodes, gl.STATIC_DRAW);
  }

  setPalette(p: Palette): void {
    this.palette = p;
  }

  resize(width: number, height: number, dpr: number): void {
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    this.canvas.width = Math.max(1, Math.round(width * dpr));
    this.canvas.height = Math.max(1, Math.round(height * dpr));
  }

  draw(scene: Scene, view: View, opts: DrawOptions): void {
    const { gl, tpl, palette: pal } = this;
    if (this.lost || !tpl || !pal) return;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(pal.plate[0], pal.plate[1], pal.plate[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Per-frame geometry, in units: the geodesic glow, then the bridge.
    const home = homePoints(scene, tpl.depth);
    let glowCount = 0;
    if (opts.path) {
      for (let k = 1; k < home.length && glowCount < DYN_SEGS - 1; k++, glowCount++)
        this.dynSegs.set([home[k - 1].x, home[k - 1].y, home[k].x, home[k].y, 0], glowCount * SEG_STRIDE);
    }
    const b = scene.bridge;
    if (b) this.dynSegs.set([b.x0, b.y0, b.x1, b.y1, b.gen], glowCount * SEG_STRIDE);
    const dynCount = glowCount + (b ? 1 : 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.dynSegBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.dynSegs, 0, Math.max(1, dynCount) * SEG_STRIDE);
    // The centre junction(s): the template starts at the first edges, not at the centre.
    scene.pieces.forEach((p, k) => this.dynNodes.set([p.xform.ox, p.xform.oy, p.xform.scale], k * NODE_STRIDE));
    gl.bindBuffer(gl.ARRAY_BUFFER, this.dynNodeBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.dynNodes);

    const viewU: [number, number, number, number] = [view.ox, view.oy, view.unit, this.dpr];
    const identity = { scale: 1, ox: 0, oy: 0 };

    // 1. geodesic glow
    const s = this.use(this.seg, viewU);
    gl.uniform3fv(s.u_colA, pal.genA);
    gl.uniform3fv(s.u_colB, pal.genB);
    gl.uniform3fv(s.u_colFixed, pal.ident);
    if (opts.path && (glowCount || b)) {
      gl.uniform1f(s.u_useFixed, 1);
      gl.uniform1f(s.u_opacity, GLOW_OPACITY);
      gl.uniform2f(s.u_widen, 3, 4);
      this.xform(s, identity);
      gl.bindVertexArray(this.dynSegVao);
      gl.uniform1f(s.u_widthLen, 0);
      if (glowCount) this.drawSegs(this.dynSegBuf, 0, glowCount);
      gl.uniform1f(s.u_widthLen, view.unit);
      if (b) this.drawSegs(this.dynSegBuf, glowCount, 1);
    }

    // 2. edges
    gl.uniform1f(s.u_useFixed, 0);
    gl.uniform1f(s.u_opacity, 1);
    gl.uniform2f(s.u_widen, 1, 0);
    gl.uniform1f(s.u_widthLen, 0);
    gl.bindVertexArray(this.segVao);
    this.eachRange(scene.pieces, s, tpl.segRange, (start, count) => this.drawSegs(this.segBuf, start, count));
    if (b) {
      this.xform(s, identity);
      gl.uniform1f(s.u_widthLen, view.unit);
      gl.bindVertexArray(this.dynSegVao);
      this.drawSegs(this.dynSegBuf, glowCount, 1);
    }

    // 3. chevrons
    if (opts.arrows) {
      const a = this.use(this.arrow, viewU);
      gl.uniform3fv(a.u_colA, pal.genA);
      gl.uniform3fv(a.u_colB, pal.genB);
      gl.bindVertexArray(this.segVao);
      const shallow = tpl.segRange.map((r, d) => ({ start: r.start, count: tpl.arrowCount[d] }));
      this.eachRange(scene.pieces, a, shallow, (start, count) => this.drawSegs(this.segBuf, start, count));
      if (b) {
        this.xform(a, identity);
        gl.bindVertexArray(this.dynSegVao);
        this.drawSegs(this.dynSegBuf, glowCount, 1);
      }
    }

    // 4. junction dots
    const d = this.use(this.dot, viewU);
    gl.uniform3fv(d.u_color, pal.ink);
    gl.bindVertexArray(this.nodeVao);
    this.eachRange(scene.pieces, d, tpl.nodeRange, (start, count) => this.drawNodes(this.nodeBuf, start, count));
    this.xform(d, identity);
    gl.bindVertexArray(this.dynNodeVao);
    this.drawNodes(this.dynNodeBuf, 0, scene.pieces.length);
    gl.bindVertexArray(null);
  }

  // ---------- helpers ----------

  /** Draw the given per-direction ranges of every piece under that piece's transform. */
  private eachRange(pieces: Piece[], u: Uniforms, ranges: { start: number; count: number }[], draw: (start: number, count: number) => void): void {
    for (const piece of pieces) {
      this.xform(u, piece.xform);
      let start = -1;
      let end = -1;
      for (const d of [...piece.dirs].sort((x, y) => x - y)) {
        const r = ranges[d];
        if (r.start === end) end += r.count;   // adjacent in the buffer: extend the current draw
        else {
          if (end > start) draw(start, end - start);
          start = r.start;
          end = r.start + r.count;
        }
      }
      if (end > start) draw(start, end - start);
    }
  }

  private drawSegs(buf: WebGLBuffer, start: number, count: number): void {
    if (count <= 0) return;
    const gl = this.gl;
    const stride = SEG_STRIDE * 4;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, stride, start * stride);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, start * stride + 16);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
  }

  private drawNodes(buf: WebGLBuffer, start: number, count: number): void {
    if (count <= 0) return;
    const gl = this.gl;
    const stride = NODE_STRIDE * 4;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, start * stride);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
  }

  private use(p: Program, view: [number, number, number, number]): Uniforms {
    const gl = this.gl;
    gl.useProgram(p.prog);
    gl.uniform4f(p.u.u_view, ...view);
    gl.uniform2f(p.u.u_res, this.width, this.height);
    return p.u;
  }

  private xform(u: Uniforms, x: { scale: number; ox: number; oy: number }): void {
    this.gl.uniform3f(u.u_xform, x.scale, x.ox, x.oy);
  }

  private buffer(data: Float32Array, usage: number): WebGLBuffer {
    const gl = this.gl;
    const buf = gl.createBuffer();
    if (!buf) throw new Error('Could not create a WebGL buffer');
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, usage);
    return buf;
  }

  /** A vertex array: the unit quad at location 0, and per-instance data at 1 (and 2 for segments). */
  private vao(instances: WebGLBuffer, stride: number): WebGLVertexArrayObject {
    const gl = this.gl;
    const vao = gl.createVertexArray();
    if (!vao) throw new Error('Could not create a WebGL vertex array');
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, instances);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribDivisor(1, 1);
    if (stride === SEG_STRIDE) {
      gl.vertexAttribPointer(1, 4, gl.FLOAT, false, stride * 4, 0);
      gl.enableVertexAttribArray(2);
      gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride * 4, 16);
      gl.vertexAttribDivisor(2, 1);
    } else {
      gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride * 4, 0);
    }
    gl.bindVertexArray(null);
    return vao;
  }

  private program(vs: string, fs: string, uniforms: string[]): Program {
    const gl = this.gl;
    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type);
      if (!sh) throw new Error('Could not create a shader');
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS) && !gl.isContextLost()) throw new Error(gl.getShaderInfoLog(sh) ?? 'shader error');
      return sh;
    };
    const prog = gl.createProgram();
    if (!prog) throw new Error('Could not create a program');
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS) && !gl.isContextLost()) throw new Error(gl.getProgramInfoLog(prog) ?? 'link error');
    const u: Uniforms = {};
    for (const name of uniforms) u[name] = gl.getUniformLocation(prog, name);
    return { prog, u };
  }
}
