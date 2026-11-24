import {state} from '../state';
import {$} from '../util';
import {matchingIds} from '../data/bulk';

export interface SelectHooks {
  /** The picked set or the mode changed: repaint what shows it. */
  onChange(): void;
  /** The user confirmed. */
  onDelete(ids: string[]): void;
}

let hooks: SelectHooks;
let confirming = false;

const count = (): number => state.picked.size;

function render(): void {
  const on = state.selecting;
  $('selbar').classList.toggle('hidden', !on);
  document.body.classList.toggle('selecting', on);
  $('selectBtn').classList.toggle('on', on);
  const n = count();
  $('selCount').textContent = `${n} selected`;
  $<HTMLButtonElement>('selDelete').disabled = n === 0;
  $<HTMLButtonElement>('selClear').disabled = n === 0;
  $('selActions').classList.toggle('hidden', confirming);
  $('selConfirm').classList.toggle('hidden', !confirming);
  $('selConfirmText').textContent = `Delete ${n} ${n === 1 ? 'book' : 'books'}? You can undo for a few seconds.`;
  hooks.onChange();
}

export const isSelecting = (): boolean => state.selecting;

export function enterSelect(first?: string): void {
  state.selecting = true;
  confirming = false;
  state.picked.clear();
  if (first) state.picked.add(first);
  render();
}

export function exitSelect(): void {
  state.selecting = false;
  confirming = false;
  state.picked.clear();
  render();
}

export function togglePick(id: string): void {
  if (state.picked.has(id)) state.picked.delete(id);
  else state.picked.add(id);
  confirming = false;
  render();
}

export function initSelect(h: SelectHooks): void {
  hooks = h;
  $('selectBtn').addEventListener('click', () => (state.selecting ? exitSelect() : enterSelect()));
  $('selectMenu').addEventListener('click', () => (state.selecting ? exitSelect() : enterSelect()));
  $('selAll').addEventListener('click', () => {
    for (const id of matchingIds(state.books, state.q, state.status)) state.picked.add(id);
    confirming = false;
    render();
  });
  $('selClear').addEventListener('click', () => {
    state.picked.clear();
    confirming = false;
    render();
  });
  $('selCancel').addEventListener('click', exitSelect);
  $('selDelete').addEventListener('click', () => {
    if (!count()) return;
    confirming = true;
    render();
  });
  $('selConfirmNo').addEventListener('click', () => {
    confirming = false;
    render();
  });
  $('selConfirmYes').addEventListener('click', () => {
    const ids = [...state.picked];
    exitSelect();
    h.onDelete(ids);
  });
}
