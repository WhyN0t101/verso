import './style.css';
import {fontsReady} from './fonts';
import {state, persist, findBook} from './state';
import {makeBook, updateBook} from './data/books';
import {matches} from './search';
import type {Status} from './types';
import {$, downloadBlob, toast} from './util';
import {createShelf, type Shelf} from './scene/shelf';
import {initPanel, showPanel, hidePanel, fillPanel} from './ui/panel';
import {initForm, openForm, closeForm, setGenreOptions} from './ui/form';
import {initExport, openExport, closeExport} from './ui/exportDialog';
import {renderList} from './ui/list';
import {initDots, renderDots} from './ui/dots';
import {initStyle, openStyle, closeStyle, applyBackground} from './ui/style';
import {buildBackup, mergeBooks, parseBackup} from './data/backup';

await fontsReady;

// Dev only: `?books=150` swaps in generated books (memory only until something persists).
if (import.meta.env.DEV) {
  const n = Number(new URLSearchParams(location.search).get('books'));
  if (n > 0) {
    const {generateBooks} = await import('./dev/seedBooks');
    state.books = generateBooks(Math.min(n, 1000));
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
}

function deselect(): void {
  state.sel = null;
  hidePanel();
  hint.style.opacity = '1';
}

/** Everything that depends on the book list: shelf geometry, count, empty state, list rows, genre suggestions. */
function refresh(): void {
  const n = state.books.length;
  $('count').textContent = n + (n === 1 ? ' book' : ' books');
  $('empty').classList.toggle('hidden', n > 0 || listMode);
  setGenreOptions([...new Set(state.books.map((b) => b.genre))].sort());
  shelf?.rebuild();
  if (listMode) renderList(select);
}

function setListMode(on: boolean): void {
  listMode = on;
  if (state.sel) deselect();
  $('listView').classList.toggle('hidden', !on);
  $('hint').classList.toggle('hidden', on);
  $('dots').style.display = on ? 'none' : '';
  $('viewToggle').textContent = on ? 'Shelf view' : 'List view';
  shelf?.setVisible(!on);
  refresh();
}

shelf = createShelf($<HTMLCanvasElement>('gl'), {
  onPick(id) {
    if (id) {
      if (id !== state.sel) select(id);
    } else if (state.sel) deselect();
  },
  onView: renderDots,
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
    // A status edit can move the book in or out of the active filter.
    if (listMode && state.status) renderList(select);
  },
  onDelete(b) {
    deselect();
    state.books = state.books.filter((x) => x.id !== b.id);
    persist();
    refresh();
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

initExport();
initDots((i) => shelf?.focusCase(i));
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
    shelf?.applySettings();
    refresh();
    const skipped = parsed.skipped ? `, skipped ${parsed.skipped} unreadable` : '';
    toast(`Imported: ${merged.added} new, ${merged.updated} updated${skipped}.`);
  } catch (err) {
    toast(err instanceof Error ? err.message : 'Could not import that file.');
  }
});

$('add').addEventListener('click', () => openForm(null));
$('viewToggle').addEventListener('click', () => setListMode(!listMode));

$('q').addEventListener('input', (ev) => {
  state.q = (ev.target as HTMLInputElement).value.trim().toLowerCase();
  if (state.sel) deselect();
  if (listMode) renderList(select);
  shelf?.revealMatch();
});
$<HTMLSelectElement>('statusFilter').addEventListener('change', (ev) => {
  const sel = ev.target as HTMLSelectElement;
  state.status = sel.value as Status | '';
  sel.classList.toggle('active', !!state.status);
  if (state.sel) deselect();
  if (listMode) renderList(select);
  shelf?.revealMatch();
});
$('q').addEventListener('keydown', (ev) => {
  if (ev.key !== 'Enter' || !(state.q || state.status)) return;
  const first = state.books.find((b) => matches(b, state.q, state.status));
  if (!first) return;
  shelf?.focusBook(first.id);
  select(first.id);
  (ev.target as HTMLElement).blur();
});

addEventListener('keydown', (ev) => {
  if (ev.key !== 'Escape') return;
  if (!menu.classList.contains('hidden')) setMenu(false);
  else if (!$('style').classList.contains('hidden')) closeStyle();
  else if (!$('modal').classList.contains('hidden')) closeForm();
  else if (!$('export').classList.contains('hidden')) closeExport();
  else if (state.sel) deselect();
  else if (state.q) {
    $<HTMLInputElement>('q').value = '';
    state.q = '';
    if (listMode) renderList(select);
  }
});

// Without WebGL the flat list is the whole app.
setListMode(!shelf);
if (!shelf) $('viewToggle').classList.add('hidden');
