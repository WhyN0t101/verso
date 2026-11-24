import type {Book, Settings} from './types';
import {load, save} from './data/storage';
import {toast} from './util';

const stored = load();

export const state = {
  books: stored.books as Book[],
  settings: stored.settings as Settings,
  sel: null as string | null,
  q: '',
  fmt: 'post' as 'post' | 'story' | 'square',
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
