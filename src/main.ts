import './style.css';
import {fontsReady} from './fonts';
import {clothReady} from './textures/draw';
import {state, persist, findBook} from './state';
import {makeBook, updateBook} from './data/books';
import {matches} from './search';
import type {Status} from './types';
import {$, downloadBlob, toast, toastAction} from './util';
import {createShelf, type Shelf} from './scene/shelf';
import {initPanel, showPanel, hidePanel, fillPanel} from './ui/panel';
import {initForm, openForm, closeForm, setGenreOptions} from './ui/form';
import {initExport, openExport, closeExport} from './ui/exportDialog';
import {renderList} from './ui/list';
import {closeSectionSheet, currentView, initSections, renderSections} from './ui/sections';
import {enterSelect, exitSelect, initSelect, togglePick} from './ui/selectMode';
import {removeBooks, restoreBooks} from './data/bulk';
import {createToneQueue} from './toneQueue';
import {dominantTone, loadCover} from './covers';
import {initStyle, openStyle, closeStyle, applyBackground, applyStudy} from './ui/style';
import {STORAGE_KEY} from './data/storage';
import {buildBackup,mergeBooks, parseBackup} from './data/backup';

// Books drawn before the cloth photo arrives stay plain, so it gets a moment, but never holds the page up.
await Promise.all([fontsReady, Promise.race([clothReady, new Promise((r) => setTimeout(r, 1500))])]);

// Dev only: `?books=150` swaps in generated books (memory only until something persists).
if (import.meta.env.DEV) {
  const n = Number(new URLSearchParams(location.search).get('books'));
  if (n > 0) {
    const {generateBooks} = await import('./dev/seedBooks');
    state.books = generateBooks(Math.min(n, 1000), new URLSearchParams(location.search).has('covers'));
    state.seeded = false;
  }
}

const hint = $('hint');
const tip = $('tip');
let shelf: Shelf | null = null;
let listMode = false;

function select(id: string): void {
  const b = findBook(id);
  if (!b) return;
  state.sel = id;
  showPanel(b);
  hint.style.opacity = '0';
  tip.style.opacity = '0';
  document.body.classList.add('book-open');
}

/** A click or tap on a book: opens it, or in Select mode ticks it. */
function activate(id: string): void {
  if (state.selecting) togglePick(id);
  else select(id);
}

function deselect(): void {
  state.sel = null;
  hidePanel();
  hint.style.opacity = '1';
  document.body.classList.remove('book-open');
}

/** Everything that depends on the book list: shelf geometry, count, empty state, list rows, genre suggestions. */
function refresh(): void {
  const n = state.books.length;
  $('count').textContent = n + (n === 1 ? ' book' : ' books');
  $('empty').classList.toggle('hidden', n > 0 || listMode);
  setGenreOptions([...new Set(state.books.map((b) => b.genre))].sort());
  shelf?.rebuild();
  renderStatusChips();
  if (listMode) renderList(activate);
}

function setListMode(on: boolean): void {
  listMode = on;
  if (state.sel) deselect();
  $('listView').classList.toggle('hidden', !on);
  $('hint').classList.toggle('hidden', on);
  document.body.classList.toggle('list-mode', on);
  $('viewToggle').textContent = on ? 'Shelf view' : 'List view';
  shelf?.setVisible(!on);
  refresh();
}

shelf = createShelf($<HTMLCanvasElement>('gl'), {
  onPick(id) {
    if (id) {
      if (id !== state.sel || state.selecting) activate(id);
    } else if (state.sel) deselect();
  },
  onLongPress: (id) => enterSelect(id),
  onView: renderSections,
  onHover(title, x, y) {
    if (title === null) {
      tip.style.opacity = '0';
      return;
    }
    tip.textContent = title;
    tip.style.left = x + 'px';
    tip.style.top = y + 'px';
    tip.style.opacity = '1';
  },
});

initPanel({
  onClose: deselect,
  onEdit: (b) => openForm(b),
  onExport: (b) => openExport(b),
  onChange() {
    persist();
    // A status edit changes the chip counts and can move the book in or out of the active filter.
    renderStatusChips();
    if (listMode && state.status) renderList(activate);
  },
  onDelete(b) {
    deselect();
    state.books = state.books.filter((x) => x.id !== b.id);
    persist();
    refresh();
  },
});

initSelect({
  onChange() {
    if (state.selecting && state.sel) deselect();
    if (listMode) renderList(activate);
  },
  onDelete(ids) {
    const {books, removed} = removeBooks(state.books, new Set(ids));
    if (!removed.length) return;
    state.books = books;
    persist();
    refresh();
    toastAction(`Deleted ${removed.length} ${removed.length === 1 ? 'book' : 'books'}.`, 'Undo', () => {
      state.books = restoreBooks(state.books, removed);
      persist();
      refresh();
    });
  },
});

initForm((draft, editingId) => {
  if (editingId) {
    const b = findBook(editingId);
    if (b) {
      updateBook(b, draft);
      persist();
      refresh();
      if (state.sel === b.id) fillPanel(b);
    }
    return;
  }
  const b = makeBook(draft);
  state.books.push(b);
  persist();
  if (state.sel) deselect();
  $<HTMLInputElement>('q').value = '';
  state.q = '';
  refresh();
  shelf?.focusBook(b.id);
  setTimeout(() => select(b.id), 350);
});

// Books that have a cover but no stored tone (imports, old backups) get one in the background.
let toneSave = 0;
const tones = createToneQueue({
  load: (url) => loadCover(url, {background: true}),
  analyse: dominantTone,
  concurrency: 1,
  onTone(b) {
    if (!state.books.includes(b)) return;
    shelf?.retone(b);
    clearTimeout(toneSave);
    toneSave = window.setTimeout(persist, 1500);
  },
});
initExport();
initSections(
  (i) => shelf?.focusCase(i),
  () => {
    if (state.sel) deselect();
    if (listMode) renderList(activate);
    const view = currentView();
    if (view) renderSections(view);
  },
);
initStyle(() => shelf?.applySettings());

const menu = $('menu');
const setMenu = (open: boolean): void => {
  menu.classList.toggle('hidden', !open);
  $('menuBtn').setAttribute('aria-expanded', String(open));
};
$('menuBtn').addEventListener('click', (ev) => {
  ev.stopPropagation();
  setMenu(menu.classList.contains('hidden'));
});
menu.addEventListener('click', () => setMenu(false));
document.addEventListener('click', () => setMenu(false));
$('openStyle').addEventListener('click', openStyle);
$('resetLook').addEventListener('click', () => {
  applyStudy(state.settings);
  persist();
  applyBackground(state.settings.background);
  shelf?.applySettings();
  toast('Appearance reset to Study.');
});
const showGroup = (): void => {
  $('groupToggle').textContent = `Group by genre: ${state.settings.groupByGenre ? 'on' : 'off'}`;
};
showGroup();
$('groupToggle').addEventListener('click', () => {
  if (state.sel) deselect();
  state.section = null;
  if (state.settings.groupByGenre) delete state.settings.groupByGenre;
  else state.settings.groupByGenre = true;
  persist();
  showGroup();
  refresh();
  shelf?.focusCase(0);
});

$('exportBackup').addEventListener('click', () => {
  const name = `verso-backup-${new Date().toISOString().slice(0, 10)}.json`;
  downloadBlob(new Blob([buildBackup(state.books, state.settings)], {type: 'application/json'}), name);
  toast(`Backed up ${state.books.length} books.`);
});
$('importBackup').addEventListener('click', () => $('importFile').click());
$<HTMLInputElement>('importFile').addEventListener('change', async (ev) => {
  const input = ev.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  try {
    const parsed = parseBackup(await file.text());
    const ok = confirm(`Import ${parsed.books.length} books? Books with the same id on this shelf will be overwritten.`);
    if (!ok) return;
    if (state.sel) deselect();
    const merged = mergeBooks(state.seeded ? [] : state.books, parsed.books);
    state.books = merged.books;
    if (parsed.settings) state.settings = parsed.settings;
    persist();
    applyBackground(state.settings.background);
    showGroup();
    shelf?.applySettings();
    refresh();
    tones.add(state.books);
    const skipped = parsed.skipped ? `, skipped ${parsed.skipped} unreadable` : '';
    toast(`Imported: ${merged.added} new, ${merged.updated} updated${skipped}.`);
  } catch (err) {
    toast(err instanceof Error ? err.message : 'Could not import that file.');
  }
});

$('add').addEventListener('click', () => {
  if (state.selecting) exitSelect();
  openForm(null);
});
$('viewToggle').addEventListener('click', () => setListMode(!listMode));

$('q').addEventListener('input', (ev) => {
  state.q = (ev.target as HTMLInputElement).value.trim().toLowerCase();
  if (state.sel) deselect();
  if (listMode) renderList(activate);
  shelf?.revealMatch();
});
function renderStatusChips(): void {
  const box = $('statusChips');
  box.replaceChildren();
  const count = (st: Status): number => state.books.filter((b) => b.status === st).length;
  const entries: [Status | '', string, number][] = [['', 'All', state.books.length], ['wishlist', 'Wishlist', count('wishlist')], ['reading', 'Reading', count('reading')], ['finished', 'Finished', count('finished')]];
  for (const [value, label, n] of entries) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'statuschip';
    btn.setAttribute('aria-pressed', String(state.status === value));
    if (value) {
      const shape = document.createElement('span');
      shape.className = `shape ${value}`;
      shape.setAttribute('aria-hidden', 'true');
      btn.appendChild(shape);
    }
    const text = document.createElement('span');
    text.textContent = label;
    const num = document.createElement('span');
    num.className = 'n';
    num.textContent = String(n);
    btn.append(text, num);
    btn.addEventListener('click', () => {
      state.status = value;
      renderStatusChips();
      if (state.sel) deselect();
      if (listMode) renderList(activate);
      shelf?.revealMatch();
    });
    box.appendChild(btn);
  }
}

$('q').addEventListener('keydown', (ev) => {
  if (ev.key !== 'Enter' || !(state.q || state.status || state.section)) return;
  const first = state.books.find((b) => matches(b, state.q, state.status, state.section?.genres ?? null));
  if (!first) return;
  shelf?.focusBook(first.id);
  activate(first.id);
  (ev.target as HTMLElement).blur();
});

addEventListener('keydown', (ev) => {
  if (ev.key !== 'Escape') return;
  if (state.selecting) exitSelect();
  else if (closeSectionSheet()) return;
  else if (!menu.classList.contains('hidden')) setMenu(false);
  else if (!$('style').classList.contains('hidden')) closeStyle();
  else if (!$('modal').classList.contains('hidden')) closeForm();
  else if (!$('export').classList.contains('hidden')) closeExport();
  else if (state.sel) deselect();
  else if (state.section) {
    state.section = null;
    if (listMode) renderList(activate);
    const view = currentView();
    if (view) renderSections(view);
  } else if (state.q) {
    $<HTMLInputElement>('q').value = '';
    state.q = '';
    if (listMode) renderList(activate);
  }
});

// Every save writes the whole shelf, so a tab that kept editing would erase what another tab saved.
addEventListener('storage', (ev) => {
  if (ev.key === STORAGE_KEY) toastAction('The shelf was changed in another tab.', 'Reload', () => location.reload(), 60_000);
});

// The hint teaches the gesture once; any first interaction retires it for good.
const HINT_KEY = 'verso.hintSeen';
const hintSeen = (): boolean => {
  try {
    return localStorage.getItem(HINT_KEY) === '1';
  } catch {
    return false;
  }
};
if (hintSeen()) hint.classList.add('gone');
else {
  const dismiss = (): void => {
    hint.classList.add('gone');
    try {
      localStorage.setItem(HINT_KEY, '1');
    } catch {
      // Private mode: the hint just comes back next visit.
    }
    for (const ev of ['pointerdown', 'keydown', 'wheel']) removeEventListener(ev, dismiss, true);
  };
  for (const ev of ['pointerdown', 'keydown', 'wheel']) addEventListener(ev, dismiss, {capture: true, passive: true});
}

// After the first frames are on screen, so the queue never competes with startup.
const startTones = (): void => tones.add(state.books);
if ('requestIdleCallback' in window) requestIdleCallback(startTones, {timeout: 3000});
else setTimeout(startTones, 1500);

// Without WebGL the flat list is the whole app.
setListMode(!shelf);
if (!shelf) $('viewToggle').classList.add('hidden');
