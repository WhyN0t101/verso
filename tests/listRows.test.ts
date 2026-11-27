import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {installFakeDom, type FakeDom, type FakeElement} from './helpers/fakeDom';
import type {Book} from '../src/types';

let dom: FakeDom;
beforeEach(() => {
  vi.stubGlobal('localStorage', {getItem: () => null, setItem: () => undefined});
  dom = installFakeDom();
});
afterEach(() => vi.unstubAllGlobals());

const mk = (id: string, title: string) => ({id, title, author: '', genre: 'G', rating: 0}) as Book;

async function render() {
  const {state} = await import('../src/state');
  state.books = [mk('a', 'Alpha'), mk('b', 'Beta')];
  state.q = '';
  state.status = '';
  state.section = null;
  state.picked.clear();
  state.selecting = false;
  const {renderList} = await import('../src/ui/list');
  return {state, renderList};
}

/** The row button inside each listitem wrapper. */
const rows = (): FakeElement[] => dom.el('listView').children.map((item) => item.children[0] as FakeElement);

describe('list rows in select mode', () => {
  it('say whether each row is picked, so a screen reader hears what the colour shows', async () => {
    const {state, renderList} = await render();
    state.selecting = true;
    state.picked.add('b');
    renderList(() => undefined);
    expect(rows().map((r) => r.getAttribute('aria-pressed'))).toEqual(['false', 'true']);
  });

  it('carry no pressed state outside select mode, where a row is a plain button', async () => {
    const {renderList} = await render();
    renderList(() => undefined);
    expect(rows().map((r) => r.getAttribute('aria-pressed'))).toEqual([null, null]);
  });
});
