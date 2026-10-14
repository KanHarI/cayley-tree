// The side panel and the keyboard.

import { parseWord, wordHTML, type Gen } from './group';
import type { Navigator } from './navigation';

export interface Settings {
  labels: boolean;
  path: boolean;
  arrows: boolean;
}

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} is missing`);
  return el as T;
};

export function bindControls(nav: Navigator, settings: Settings, redraw: () => void): { update: () => void; fitWord: () => void } {
  const word = $('word');

  // When the word is kept to one line (phones), scroll it so the newest letters stay visible.
  const fitWord = () => {
    word.classList.toggle('clipped', word.scrollWidth > word.clientWidth + 1);
    word.scrollLeft = word.scrollWidth;
  };

  const update = () => {
    word.innerHTML = wordHTML(nav.cur);
    fitWord();
    $('len').textContent = String(nav.cur.length);
    $('steps').textContent = String(nav.steps);
    $('queued').textContent = String(nav.pending);
    $('walk').setAttribute('aria-pressed', String(nav.walking));
  };

  document.querySelectorAll<HTMLButtonElement>('.pad [data-g]').forEach(b =>
    b.addEventListener('click', () => nav.enqueue(Number(b.dataset.g) as Gen)));
  $('home').addEventListener('click', () => nav.travelTo([]));
  $('undo').addEventListener('click', () => nav.undo());
  $('walk').addEventListener('click', () => nav.setWalking(!nav.walking));

  const speed = $<HTMLInputElement>('speed');
  const showSpeed = () => { $('speedOut').textContent = (nav.duration / 1000).toFixed(2) + 's'; };
  speed.value = String(nav.duration);
  showSpeed();
  speed.addEventListener('input', () => { nav.duration = Number(speed.value); showSpeed(); });

  const labelButtons = document.querySelectorAll<HTMLButtonElement>('#labels button');
  labelButtons.forEach(b => b.addEventListener('click', () => {
    settings.labels = b.dataset.v === 'on';
    labelButtons.forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    redraw();
  }));
  const toggle = (id: string, key: 'path' | 'arrows') =>
    $(id).addEventListener('click', e => {
      settings[key] = !settings[key];
      (e.currentTarget as HTMLElement).setAttribute('aria-pressed', String(settings[key]));
      redraw();
    });
  toggle('pathBtn', 'path');
  toggle('arrowBtn', 'arrows');

  $('progForm').addEventListener('submit', e => {
    e.preventDefault();
    const r = parseWord($<HTMLInputElement>('prog').value);
    $('msg').textContent = 'error' in r ? r.error : '';
    if ('moves' in r) r.moves.forEach(m => nav.enqueue(m));
  });

  const keys: Record<string, Gen> = { ArrowRight: 0, ArrowUp: 1, ArrowLeft: 2, ArrowDown: 3, a: 0, b: 1, A: 2, B: 3 };
  document.addEventListener('keydown', e => {
    const target = e.target as HTMLElement | null;
    if (target?.closest('input, textarea, select')) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key in keys) {
      e.preventDefault();
      nav.enqueue(keys[e.key]);
    } else if (e.key === 'e' || e.key === 'E' || e.key === 'Home') {
      e.preventDefault();
      nav.travelTo([]);
    } else if (e.key === 'Backspace') {
      e.preventDefault();
      nav.undo();
    } else if (e.key === ' ' && !target?.closest('button')) {
      e.preventDefault();
      nav.setWalking(!nav.walking);
    }
  });

  // iOS only applies :active styles when a touchstart listener exists.
  document.addEventListener('touchstart', () => {}, { passive: true });

  return { update, fitWord };
}
