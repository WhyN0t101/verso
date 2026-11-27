import type {Book} from '../types';
import {$} from '../util';
import {STATUS_LABELS, applyStatus, isoDate, todayIso} from '../data/books';
import type {Status} from '../types';
import {spineLook} from '../textures/draw';

export interface PanelHooks {
  onClose(): void;
  onEdit(b: Book): void;
  onDelete(b: Book): void;
  onExport(b: Book): void;
  /** Notes or rating changed on the open book. */
  onChange(): void;
}

const panel = $('panel');
let hooks: PanelHooks;
let current: Book | null = null;
let delArm = false;
let delTimer = 0;
let saveTimer = 0;

function renderStars(b: Book): void {
  const box = $('pStars');
  box.replaceChildren();
  for (let i = 1; i <= 5; i++) {
    const s = document.createElement('button');
    s.type = 'button';
    s.textContent = '★';
    s.setAttribute('aria-label', `${i} ${i === 1 ? 'star' : 'stars'}`);
    s.setAttribute('aria-pressed', String(b.rating === i));
    if (i <= b.rating) s.className = 'on';
    s.addEventListener('click', () => {
      b.rating = b.rating === i ? 0 : i;
      hooks.onChange();
      renderStars(b);
    });
    box.appendChild(s);
  }
}

/** Chips double as the badge: the active one is lit, a second click clears it. */
function renderStatus(b: Book): void {
  const box = $('pStatus');
  box.replaceChildren();
  for (const id of Object.keys(STATUS_LABELS) as Status[]) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip' + (b.status === id ? ' on ' + id : '');
    const shape = document.createElement('span');
    shape.className = `shape ${id}`;
    shape.setAttribute('aria-hidden', 'true');
    chip.append(shape, document.createTextNode(STATUS_LABELS[id]));
    chip.setAttribute('aria-pressed', String(b.status === id));
    chip.addEventListener('click', () => {
      applyStatus(b, b.status === id ? undefined : id);
      hooks.onChange();
      renderStatus(b);
    });
    box.appendChild(chip);
  }
  const row = $('pFinishedRow');
  row.classList.toggle('hidden', b.status !== 'finished');
  const input = $<HTMLInputElement>('pFinished');
  input.max = todayIso();
  input.value = b.finishedOn ?? '';
}

function resetDelete(): void {
  delArm = false;
  clearTimeout(delTimer);
  $('pDelete').textContent = 'Delete';
}

export function initPanel(h: PanelHooks): void {
  hooks = h;
  $('close').addEventListener('click', h.onClose);
  $('pNotes').addEventListener('input', (ev) => {
    if (!current) return;
    current.notes = (ev.target as HTMLTextAreaElement).value;
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(h.onChange, 300);
  });
  $('pFinished').addEventListener('change', (ev) => {
    if (!current || current.status !== 'finished') return;
    const date = isoDate((ev.target as HTMLInputElement).value);
    if (date) current.finishedOn = date;
    else delete current.finishedOn;
    h.onChange();
  });
  $('pEdit').addEventListener('click', () => current && h.onEdit(current));
  $('pExport').addEventListener('click', () => current && h.onExport(current));
  $('pDelete').addEventListener('click', () => {
    if (!current) return;
    if (!delArm) {
      delArm = true;
      $('pDelete').textContent = 'Tap again to confirm';
      delTimer = window.setTimeout(resetDelete, 3000);
      return;
    }
    resetDelete();
    h.onDelete(current);
  });
}

export function fillPanel(b: Book): void {
  // An armed Delete belongs to the book it was armed on, not to whichever is opened next.
  if (current !== b) resetDelete();
  current = b;
  // The panel takes its colour from the book's spine, so the open book and the page about it match.
  const look = spineLook(b);
  panel.style.setProperty('--tint', `hsl(${look.h} ${look.s}% ${look.l}%)`);
  const cover = $<HTMLImageElement>('pCover');
  cover.classList.toggle('hidden', !b.cover);
  if (b.cover) cover.src = b.cover;
  $('pGenre').textContent = b.genre;
  $('pTitle').textContent = b.title;
  const by = b.author ? 'by ' + b.author : '';
  $('pAuthor').textContent = b.year ? (by ? `${by} · ${b.year}` : String(b.year)) : by;
  $('pSummary').textContent = b.summary || 'No summary yet. Use Edit details to add one.';
  $<HTMLTextAreaElement>('pNotes').value = b.notes;
  renderStars(b);
  renderStatus(b);
}

export function showPanel(b: Book): void {
  fillPanel(b);
  panel.classList.add('open');
}

export function hidePanel(): void {
  current = null;
  panel.classList.remove('open');
  resetDelete();
}
