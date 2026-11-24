import './style.css';
import {fontsReady} from './fonts';
import {state, persist, findBook} from './state';
import {makeBook, updateBook} from './data/books';
import {matches} from './search';
import {$} from './util';
import {createShelf, type Shelf} from './scene/shelf';
import {initPanel, showPanel, hidePanel, fillPanel} from './ui/panel';
import {initForm, openForm, setGenreOptions} from './ui/form';
import {initExport, openExport, closeExport} from './ui/exportDialog';
import {renderList} from './ui/list';

await fontsReady;

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
  $('viewToggle').textContent = on ? 'Shelf' : 'List';
  shelf?.setVisible(!on);
  refresh();
}

shelf = createShelf($<HTMLCanvasElement>('gl'), {
  onPick(id) {
    if (id) {
      if (id !== state.sel) select(id);
    } else if (state.sel) deselect();
  },
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
  onChange: persist,
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
  shelf?.scrollToEnd();
  setTimeout(() => select(b.id), 350);
});

initExport();

$('add').addEventListener('click', () => openForm(null));
$('viewToggle').addEventListener('click', () => setListMode(!listMode));

$('q').addEventListener('input', (ev) => {
  state.q = (ev.target as HTMLInputElement).value.trim().toLowerCase();
  if (state.sel) deselect();
  if (listMode) renderList(select);
});
$('q').addEventListener('keydown', (ev) => {
  if (ev.key !== 'Enter' || !state.q) return;
  const first = state.books.find((b) => matches(b, state.q));
  if (!first) return;
  select(first.id);
  (ev.target as HTMLElement).blur();
});

addEventListener('keydown', (ev) => {
  if (ev.key !== 'Escape') return;
  if (!$('modal').classList.contains('hidden')) $('modal').classList.add('hidden');
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
