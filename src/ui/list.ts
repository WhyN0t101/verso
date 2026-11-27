import type {Book} from '../types';
import {state} from '../state';
import {matches} from '../search';
import {$} from '../util';

/** Flat, cheap-to-render alternative to the 3D shelf: used without WebGL. */
export function renderList(onOpen: (id: string) => void): void {
  const ul = $('listView');
  ul.replaceChildren();
  const shown = state.books.filter((b) => matches(b, state.q, state.status, state.section?.genres ?? null));
  for (const b of shown) {
    // role=list needs listitem children, and a button must not take that role itself.
    const item = document.createElement('div');
    item.setAttribute('role', 'listitem');
    item.appendChild(row(b, onOpen));
    ul.appendChild(item);
  }
  if (!shown.length) {
    const p = document.createElement('p');
    p.className = 'list-empty';
    p.textContent = state.books.length ? 'No book matches your search.' : 'Your shelf is empty. Add your first book to start.';
    ul.appendChild(p);
  }
}

function row(b: Book, onOpen: (id: string) => void): HTMLElement {
  const li = document.createElement('button');
  li.className = 'list-row' + (state.picked.has(b.id) ? ' picked' : '');
  li.type = 'button';
  // Select mode ticks rows; the colour alone is not enough for a screen reader.
  if (state.selecting) li.setAttribute('aria-pressed', String(state.picked.has(b.id)));
  const title = document.createElement('span');
  title.className = 'list-title';
  title.textContent = b.title;
  const meta = document.createElement('span');
  meta.className = 'list-meta';
  meta.textContent = [b.author, b.genre].filter(Boolean).join(' · ');
  const stars = document.createElement('span');
  stars.className = 'list-stars';
  stars.textContent = b.rating ? '★'.repeat(b.rating) : '';
  if (b.rating) stars.setAttribute('aria-label', `${b.rating} ${b.rating === 1 ? 'star' : 'stars'}`);
  li.append(title, meta, stars);
  li.addEventListener('click', () => onOpen(b.id));
  return li;
}
