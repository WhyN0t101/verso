import type {Book} from '../types';
import {$} from '../util';

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
    const s = document.createElement('span');
    s.textContent = '★';
    if (i <= b.rating) s.className = 'on';
    s.addEventListener('click', () => {
      b.rating = b.rating === i ? 0 : i;
      hooks.onChange();
      renderStars(b);
    });
    box.appendChild(s);
  }
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
  current = b;
  $('pGenre').textContent = b.genre;
  $('pTitle').textContent = b.title;
  const by = b.author ? 'by ' + b.author : '';
  $('pAuthor').textContent = b.year ? (by ? `${by} · ${b.year}` : String(b.year)) : by;
  $('pSummary').textContent = b.summary || 'No summary yet. Use Edit details to add one.';
  $<HTMLTextAreaElement>('pNotes').value = b.notes;
  renderStars(b);
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
