import type {Book, BookDraft, Tone} from '../types';
import type {CoverChoice as Candidate} from '../api';
import {$} from '../util';
import {GENRES} from '../../shared/genres';
import {WorkerDownError, fetchCoverChoices, fetchWork, searchBooks, type SearchResult} from '../api';
import {dominantTone, loadCover} from '../covers';

type Input = HTMLInputElement | HTMLTextAreaElement;
const f = (id: string) => $<Input>(id);

const DEBOUNCE_MS = 300;

let onSaveCb: (draft: BookDraft, editingId: string | null) => void = () => undefined;
let editing: string | null = null;
let searchTimer = 0;
let searchCtl: AbortController | null = null;
let workCtl: AbortController | null = null;
let coversCtl: AbortController | null = null;
interface CoverChoice {
  url: string;
  tone?: Tone;
  /** Only set for a freshly picked cover; lets the 3D book take the cover's proportions. */
  aspect?: number;
}
let cover: CoverChoice | null = null;
/** Resolves when the picked cover's colour has been read. */
let coverReady: Promise<void> = Promise.resolve();

/** Fields the user typed in since the last pick; auto-fill never overwrites these. */
const touched = new Set<string>();

/** In dev the real cause (Worker not running) beats the generic wording. */
const why = (err: unknown, fallback: string): string => (err instanceof WorkerDownError ? err.message : fallback);

let retryFn: (() => void) | null = null;

/** `retry` shows a Retry button next to the message; any new status clears the previous one. */
function setStatus(msg: string, retry?: () => void): void {
  const el = $('fStatus');
  el.textContent = msg;
  el.classList.toggle('hidden', !msg);
  retryFn = retry ?? null;
  $('fRetry').classList.toggle('hidden', !retry);
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
    setStatus(why(err, 'Search is unavailable right now. Retry, or fill in the details by hand.'), () => void runSearch(q));
  }
}

function showCover(): void {
  // Editing always offers the cover controls, even for a book that has none yet.
  $('fCoverRow').classList.toggle('hidden', !cover && editing === null);
  $('fCoverImg').classList.toggle('hidden', !cover);
  $('fCoverRemove').classList.toggle('hidden', !cover);
  $('fCoverNote').textContent = cover ? 'The book on your shelf takes its colour from this cover.' : 'No cover. A generated one is used.';
  if (cover) $<HTMLImageElement>('fCoverImg').src = cover.url;
}

function renderCoverChoices(choices: Candidate[]): void {
  const box = $('fCovers');
  box.replaceChildren();
  box.classList.toggle('hidden', choices.length === 0);
  for (const c of choices) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cover-choice';
    btn.title = [c.title, c.year].filter(Boolean).join(', ');
    btn.setAttribute('aria-label', `Use cover of ${btn.title || 'this edition'}`);
    const img = document.createElement('img');
    img.src = c.cover; // medium: the small size is too soft for a thumbnail this big
    img.alt = '';
    img.loading = 'lazy';
    btn.appendChild(img);
    btn.addEventListener('click', () => {
      renderCoverChoices([]);
      setStatus('');
      pickCover(c.cover);
    });
    box.appendChild(btn);
  }
}

async function changeCover(): Promise<void> {
  const title = f('fTitle').value.trim();
  if (title.length < 2) return setStatus('Enter a title first, then choose a cover.');
  coversCtl?.abort();
  const ctl = (coversCtl = new AbortController());
  setStatus('Looking for covers…');
  try {
    const choices = await fetchCoverChoices(title, f('fAuthor').value.trim(), ctl.signal);
    renderCoverChoices(choices);
    setStatus(choices.length ? 'Choose a cover.' : 'No covers found for this book.');
  } catch (err) {
    if (ctl.signal.aborted) return;
    console.warn('cover choices failed', err);
    renderCoverChoices([]);
    setStatus(why(err, 'Could not load covers right now.'), () => void changeCover());
  }
}

function pickCover(url: string | null): void {
  cover = url ? {url} : null;
  showCover();
  if (!url) return;
  coverReady = loadCover(url).then((img) => {
    if (cover?.url !== url) return;
    if (!img) {
      cover = null;
      showCover();
      setStatus('That book has no usable cover. A generated one will be used.');
      return;
    }
    cover.tone = dominantTone(img);
    cover.aspect = img.naturalWidth / img.naturalHeight;
  });
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
  pickCover(r.cover);
  await lookupSummary(r);
}

async function lookupSummary(r: SearchResult): Promise<void> {
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
    setStatus(why(err, 'Could not load a summary. Retry, or write your own.'), () => void lookupSummary(r));
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

  $('fRetry').addEventListener('click', () => retryFn?.());
  $('fCancel').addEventListener('click', closeForm);
  $('fCoverRemove').addEventListener('click', () => {
    renderCoverChoices([]);
    pickCover(null);
  });
  $('fCoverChange').addEventListener('click', () => void changeCover());
  $('form').addEventListener('submit', (ev) => {
    ev.preventDefault();
    void submit();
  });
}

async function submit(): Promise<void> {
  const title = f('fTitle').value.trim();
  if (!title) return;
  await coverReady;
  const year = Number.parseInt(f('fYear').value, 10);
  const draft: BookDraft = {
    title,
    author: f('fAuthor').value,
    genre: f('fGenre').value,
    summary: f('fSummary').value,
    ...(Number.isFinite(year) && year > 0 ? {year} : {}),
    ...(cover ? {cover: cover.url, ...(cover.tone ? {tone: cover.tone} : {}), ...(cover.aspect ? {aspect: cover.aspect} : {})} : {}),
  };
  closeForm();
  onSaveCb(draft, editing);
}

export function closeForm(): void {
  searchCtl?.abort();
  workCtl?.abort();
  coversCtl?.abort();
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
  cover = b?.cover ? {url: b.cover, ...(b.tone ? {tone: b.tone} : {})} : null;
  coverReady = Promise.resolve();
  renderCoverChoices([]);
  showCover();
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
