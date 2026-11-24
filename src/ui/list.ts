import type {Book} from '../types';
import {state} from '../state';
import {matches} from '../search';
import {$} from '../util';

/** Flat, cheap-to-render alternative to the 3D shelf: used without WebGL and as a fallback for big collections. */
export function renderList(onOpen: (id: string) => void): void {
  const ul = $('listView');
  ul.replaceChildren();
  const shown = state.books.filter((b) => matches(b, state.q));
  for (const b of shown) ul.appendChild(row(b, onOpen));
  if (!shown.length) {
    const p = document.createElement('p');
    p.className = 'list-empty';
    p.textContent = state.books.length ? 'No book matches your search.' : 'Your shelf is empty. Add your first book to start.';
    ul.appendChild(p);
  }
}

function row(b: Book, onOpen: (id: string) => void): HTMLElement {
  const li = document.createElement('button');
  li.className = 'list-row';
  li.type = 'button';
  const title = document.createElement('span');
  title.className = 'list-title';
  title.textContent = b.title;
  const meta = document.createElement('span');
  meta.className = 'list-meta';
  meta.textContent = [b.author, b.genre].filter(Boolean).join(' · ');
  const stars = document.createElement('span');
  stars.className = 'list-stars';
  stars.textContent = b.rating ? '★'.repeat(b.rating) : '';
  li.append(title, meta, stars);
  li.addEventListener('click', () => onOpen(b.id));
  return li;
}
