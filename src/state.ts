import type {Book, Settings, Status} from './types';
import {load, save} from './data/storage';
import {toast} from './util';
import type {ThemeId} from './export/themes';

const stored = load();

export const state = {
  books: stored.books as Book[],
  settings: stored.settings as Settings,
  sel: null as string | null,
  q: '',
  /** Select mode for bulk removal, and the ids picked in it. */
  selecting: false,
  picked: new Set<string>(),
  status: '' as Status | '',
  fmt: 'post' as 'post' | 'story' | 'square',
  theme: 'classic' as ThemeId,
  editing: null as string | null,
  /** Demo books not yet saved: an import replaces them instead of merging into them. */
  seeded: !!stored.seeded,
};

let warned = false;
export function persist(): void {
  state.seeded = false;
  if (save({books: state.books, settings: state.settings})) {
    warned = false;
  } else if (!warned) {
    warned = true;
    toast('Could not save in this browser. Your changes last until you close the page.');
  }
}

export const findBook = (id: string | null): Book | undefined => (id ? state.books.find((b) => b.id === id) : undefined);
