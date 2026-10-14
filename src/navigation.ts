// Where the viewpoint is, where it is going, and the clock of the step in progress.

import { GENS, inv, mul, type Gen } from './group';
import type { Step } from './scene';

const MAX_QUEUE = 400;
const MAX_HISTORY = 2000;
/** Pause between random-walk steps, ms. */
const WALK_PAUSE = 140;

export class Navigator {
  /** Element at the centre of the view. */
  cur: Gen[] = [];
  steps = 0;
  walking = false;
  /** Duration of a single step, ms (queued steps run faster). */
  duration: number;

  private fin: Gen[] = [];   // element after all queued moves
  private queue: Gen[] = [];
  private history: Gen[] = [];
  private anim: { g: Gen; start: number; dur: number } | null = null;

  constructor(
    duration: number,
    private readonly now: () => number = () => performance.now(),
    private readonly random: () => number = Math.random,
    /** Called whenever the centre, the queue or the walk changes. */
    public onChange: () => void = () => {},
  ) {
    this.duration = duration;
  }

  /** Steps queued or in progress. */
  get pending(): number {
    return this.queue.length + (this.anim ? 1 : 0);
  }

  get animating(): boolean {
    return this.anim !== null;
  }

  enqueue(i: Gen, record = true): void {
    if (this.queue.length > MAX_QUEUE) return;
    this.push(i, record);
    this.kick();
  }

  /** Queue the moves of a geodesic from the eventual position to target. */
  travelTo(target: readonly Gen[]): void {
    const fin = this.fin;
    let k = 0;
    while (k < fin.length && k < target.length && fin[k] === target[k]) k++;
    for (let j = fin.length - 1; j >= k; j--) this.enqueue(inv(fin[j]));
    for (let j = k; j < target.length; j++) this.enqueue(target[j]);
  }

  undo(): void {
    const last = this.history.pop();
    if (last !== undefined) this.enqueue(inv(last), false);
  }

  setWalking(on: boolean): void {
    this.walking = on;
    if (on && !this.anim && !this.queue.length) {
      this.pushRandom();
      this.kick();
    } else this.onChange();
  }

  /** Advance the clock to `now` and return the step in progress, or null at rest. */
  advance(now: number): Step | null {
    if (!this.anim) return null;
    const p = Math.min(1, Math.max(0, (now - this.anim.start) / this.anim.dur));
    if (p < 1) return { g: this.anim.g, t: p };
    this.cur = mul(this.cur, this.anim.g);
    this.steps++;
    this.anim = null;
    if (!this.queue.length && this.walking) this.pushRandom();
    const next = this.queue.length ? this.startNext(now, this.walking && this.queue.length === 1 ? WALK_PAUSE : 0) : null;
    this.onChange();
    return next && { g: next.g, t: 0 };
  }

  private push(i: Gen, record: boolean): void {
    this.queue.push(i);
    this.fin = mul(this.fin, i);
    if (record) {
      this.history.push(i);
      if (this.history.length > MAX_HISTORY) this.history.shift();
    }
  }

  /** Simple random walk: all four neighbours equally likely, so a quarter of steps backtrack. */
  private pushRandom(): void {
    this.push(GENS[Math.floor(this.random() * 4)], true);
  }

  private kick(): void {
    if (!this.anim && this.queue.length) this.startNext(this.now());
    this.onChange();
  }

  private startNext(now: number, pause = 0): { g: Gen } | null {
    const g = this.queue.shift();
    if (g === undefined) return null;
    // While more steps wait behind this one, run faster, down to 28% of the normal step time.
    const waiting = this.queue.length;
    const k = waiting > 1 ? Math.max(0.28, 2.2 / (waiting + 1.2)) : 1;
    this.anim = { g, start: now + pause, dur: this.duration * k };
    return this.anim;
  }
}
