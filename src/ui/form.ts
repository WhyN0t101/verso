import type {Book, BookDraft} from '../types';
import {$} from '../util';
import {GENRES} from '../../shared/genres';
import {fetchWork, searchBooks, type SearchResult} from '../api';

type Input = HTMLInputElement | HTMLTextAreaElement;
const f = (id: string) => $<Input>(id);

const DEBOUNCE_MS = 300;

let onSaveCb: (draft: BookDraft, editingId: string | null) => void = () => undefined;
let editing: string | null = null;
let searchTimer = 0;
let searchCtl: AbortController | null = null;
let workCtl: AbortController | null = null;
/** Fields the user typed in since the last pick; auto-fill never overwrites these. */
const touched = new Set<string>();

function setStatus(msg: string): void {
  const el = $('fStatus');
  el.textContent = msg;
  el.classList.toggle('hidden', !msg);
}

function renderResults(results: SearchResult[]): void {
  const ul = $('fResults');
  ul.replaceChildren();
  ul.classList.toggle('hidden', results.length === 0);
  for (const r of results) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    const t = document.createElement('span');
    t.className = 'res-title';
    t.textContent = r.title;
    const m = document.createElement('span');
    m.className = 'res-meta';
    m.textContent = [r.author, r.year].filter(Boolean).join(' · ');
    btn.append(t, m);
    btn.addEventListener('click', () => void pick(r));
    li.appendChild(btn);
    ul.appendChild(li);
  }
}

async function runSearch(q: string): Promise<void> {
  searchCtl?.abort();
  const ctl = (searchCtl = new AbortController());
  setStatus('Searching Open Library…');
  try {
    const results = await searchBooks(q, ctl.signal);
    renderResults(results);
    setStatus(results.length ? '' : 'No matches. Fill in the details by hand.');
  } catch (err) {
    if (ctl.signal.aborted) return;
    console.warn('book search failed', err);
    renderResults([]);
    setStatus('Search is unavailable right now. You can still fill in the details by hand.');
  }
}

/** Fills a field unless the user already edited it. */
function fill(id: string, value: string): void {
  if (value && !touched.has(id)) f(id).value = value;
}

async function pick(r: SearchResult): Promise<void> {
  renderResults([]);
  $<HTMLInputElement>('fSearch').value = '';
  touched.clear();
  f('fTitle').value = r.title;
  f('fAuthor').value = r.author;
  f('fYear').value = r.year ? String(r.year) : '';
  f('fGenre').value = r.genre;
  f('fSummary').value = '';
  workCtl?.abort();
  const ctl = (workCtl = new AbortController());
  setStatus('Looking up the summary…');
  try {
    const d = await fetchWork(r, ctl.signal);
    fill('fSummary', d.summary);
    // The work record lists subjects more fully than search results, so a specific genre there wins over a generic one.
    const generic = ['', 'Fiction', 'Non-fiction'].includes(f('fGenre').value);
    if (generic && d.genre) fill('fGenre', d.genre);
    setStatus(d.summary ? '' : 'No summary found. You can write your own.');
  } catch (err) {
    if (ctl.signal.aborted) return;
    console.warn('summary lookup failed', err);
    setStatus('Could not load a summary. You can write your own.');
  }
}

export function initForm(onSave: (draft: BookDraft, editingId: string | null) => void): void {
  onSaveCb = onSave;

  $('fSearch').addEventListener('input', (ev) => {
    const q = (ev.target as HTMLInputElement).value.trim();
    clearTimeout(searchTimer);
    if (q.length < 2) {
      searchCtl?.abort();
      renderResults([]);
      setStatus('');
      return;
    }
    searchTimer = window.setTimeout(() => void runSearch(q), DEBOUNCE_MS);
  });
  for (const id of ['fTitle', 'fAuthor', 'fYear', 'fGenre', 'fSummary']) f(id).addEventListener('input', () => touched.add(id));

  $('fCancel').addEventListener('click', closeForm);
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
    closeForm();
    onSaveCb(draft, editing);
  });
}

export function closeForm(): void {
  searchCtl?.abort();
  workCtl?.abort();
  clearTimeout(searchTimer);
  $('modal').classList.add('hidden');
}

export function openForm(b: Book | null): void {
  editing = b ? b.id : null;
  touched.clear();
  $('formTitle').textContent = b ? 'Edit book' : 'Add a book';
  $<HTMLInputElement>('fSearch').value = '';
  renderResults([]);
  setStatus('');
  f('fTitle').value = b?.title ?? '';
  f('fAuthor').value = b?.author ?? '';
  f('fYear').value = b?.year ? String(b.year) : '';
  f('fGenre').value = b && b.genre !== 'Unsorted' ? b.genre : '';
  f('fSummary').value = b?.summary ?? '';
  $('modal').classList.remove('hidden');
  setTimeout(() => f(b ? 'fTitle' : 'fSearch').focus(), 30);
}

/** The fixed genre list, plus any custom genres already on the shelf. */
export function setGenreOptions(onShelf: string[]): void {
  const dl = $('genres');
  dl.replaceChildren();
  const all = new Set<string>([...GENRES, ...onShelf]);
  for (const g of all) {
    const o = document.createElement('option');
    o.value = g;
    dl.appendChild(o);
  }
}
