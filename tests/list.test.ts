import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {installFakeDom, type FakeDom, type FakeElement} from './helpers/fakeDom';
import {makeBook} from '../src/data/books';
import {state} from '../src/state';

let dom: FakeDom;
beforeEach(() => {
  dom = installFakeDom();
  state.q = '';
  state.status = '';
  state.section = null;
  state.selecting = false;
  state.picked = new Set();
});
afterEach(() => {
  vi.unstubAllGlobals();
  state.books = [];
});

const rows = (): FakeElement[] => dom.el('listView').children;

describe('list view accessibility', () => {
  it('wraps each row in a listitem, because role=list takes no other children', async () => {
    state.books = [makeBook({title: 'Dune'}), makeBook({title: 'Emma'})];
    const {renderList} = await import('../src/ui/list');
    renderList(() => undefined);
    expect(rows().map((r) => r.getAttribute('role'))).toEqual(['listitem', 'listitem']);
    expect(rows()[0]?.children[0]?.className).toContain('list-row');
  });

  it('names the stars with role=img and a count, and leaves an unrated book without any', async () => {
    const rated = {...makeBook({title: 'Dune'}), rating: 1};
    const rated3 = {...makeBook({title: 'Emma'}), rating: 3};
    const none = makeBook({title: 'Ulysses'});
    state.books = [rated, rated3, none];
    const {renderList} = await import('../src/ui/list');
    renderList(() => undefined);
    const starsOf = (i: number) => rows()[i]?.children[0]?.children[2] as FakeElement;
    expect([starsOf(0).getAttribute('role'), starsOf(0).getAttribute('aria-label')]).toEqual(['img', '1 star']);
    expect(starsOf(1).getAttribute('aria-label')).toBe('3 stars');
    expect(starsOf(2).getAttribute('role')).toBeNull();
    expect(starsOf(2).getAttribute('aria-label')).toBeNull();
  });

  it('makes the empty state a listitem too, with the message that fits', async () => {
    state.books = [];
    const {renderList} = await import('../src/ui/list');
    renderList(() => undefined);
    expect(rows()).toHaveLength(1);
    expect(rows()[0]?.getAttribute('role')).toBe('listitem');
    expect(rows()[0]?.textContent).toMatch(/empty/);
    state.books = [makeBook({title: 'Dune'})];
    state.q = 'zzz';
    renderList(() => undefined);
    expect(rows()[0]?.textContent).toMatch(/No book matches/);
  });
});
