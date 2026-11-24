import type {Book, BookDraft} from '../types';
import {$} from '../util';

type Input = HTMLInputElement | HTMLTextAreaElement;
const f = (id: string) => $<Input>(id);

export function initForm(onSave: (draft: BookDraft, editingId: string | null) => void): void {
  let editing: string | null = null;
  const modal = $('modal');

  $('fCancel').addEventListener('click', () => modal.classList.add('hidden'));
  $('form').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const title = f('fTitle').value.trim();
    if (!title) return;
    const year = Number.parseInt(f('fYear').value, 10);
    const draft: BookDraft = {
      title,
      author: f('fAuthor').value,
      genre: f('fGenre').value,
      summary: f('fSummary').value,
      ...(Number.isFinite(year) && year > 0 ? {year} : {}),
    };
    modal.classList.add('hidden');
    onSave(draft, editing);
  });

  openFormImpl = (b) => {
    editing = b ? b.id : null;
    $('formTitle').textContent = b ? 'Edit book' : 'Add a book';
    f('fTitle').value = b?.title ?? '';
    f('fAuthor').value = b?.author ?? '';
    f('fYear').value = b?.year ? String(b.year) : '';
    f('fGenre').value = b && b.genre !== 'Unsorted' ? b.genre : '';
    f('fSummary').value = b?.summary ?? '';
    modal.classList.remove('hidden');
    setTimeout(() => f('fTitle').focus(), 30);
  };
}

let openFormImpl: (b: Book | null) => void = () => undefined;
export const openForm = (b: Book | null): void => openFormImpl(b);

export function setGenreOptions(genres: string[]): void {
  const dl = $('genres');
  dl.replaceChildren();
  for (const g of genres) {
    const o = document.createElement('option');
    o.value = g;
    dl.appendChild(o);
  }
}
