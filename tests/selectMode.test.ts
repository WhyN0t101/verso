import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {installFakeDom, type FakeDom} from './helpers/fakeDom';
import type {Book} from '../src/types';

let dom: FakeDom;
beforeEach(() => {
  vi.stubGlobal('localStorage', {getItem: () => null, setItem: () => undefined});
  dom = installFakeDom();
});
afterEach(() => vi.unstubAllGlobals());

const mk = (id: string, title: string, status?: Book['status']) => ({id, title, author: '', genre: 'G', status}) as Book;

async function setup() {
  const {state} = await import('../src/state');
  state.books = [mk('a', 'Alpha', 'reading'), mk('b', 'Beta'), mk('c', 'Alpine', 'reading')];
  state.q = '';
  state.status = '';
  state.section = null;
  state.picked.clear();
  state.selecting = false;
  const sel = await import('../src/ui/selectMode');
  const hooks = {onChange: vi.fn(), onDelete: vi.fn()};
  sel.initSelect(hooks);
  return {state, sel, hooks};
}

describe('select mode', () => {
  it('starts with the long-pressed book picked and shows the bar', async () => {
    const {state, sel} = await setup();
    sel.enterSelect('b');
    expect(state.selecting).toBe(true);
    expect([...state.picked]).toEqual(['b']);
    expect(dom.el('selbar').hidden()).toBe(false);
    expect(dom.el('selCount').textContent).toBe('1 selected');
  });

  it('toggles picks, and disables Delete and Clear when nothing is picked', async () => {
    const {sel} = await setup();
    sel.enterSelect();
    expect(dom.el('selDelete').disabled).toBe(true);
    sel.togglePick('a');
    expect(dom.el('selDelete').disabled).toBe(false);
    sel.togglePick('a');
    expect(dom.el('selClear').disabled).toBe(true);
  });

  it('"select all" picks only what matches the search and filter', async () => {
    const {state, sel} = await setup();
    state.q = 'alp';
    state.status = 'reading';
    sel.enterSelect();
    dom.el('selAll').click();
    expect([...state.picked].sort()).toEqual(['a', 'c']);
  });

  it('asks before deleting, and only the confirm hands the ids over and leaves select mode', async () => {
    const {state, sel, hooks} = await setup();
    sel.enterSelect('a');
    sel.togglePick('b');
    dom.el('selDelete').click();
    expect(dom.el('selConfirm').hidden()).toBe(false);
    expect(dom.el('selConfirmText').textContent).toBe('Delete 2 books? You can undo for a few seconds.');
    expect(hooks.onDelete).not.toHaveBeenCalled();
    dom.el('selConfirmNo').click();
    expect(dom.el('selConfirm').hidden()).toBe(true);
    dom.el('selDelete').click();
    dom.el('selConfirmYes').click();
    expect(hooks.onDelete).toHaveBeenCalledWith(['a', 'b']);
    expect(state.selecting).toBe(false);
    expect(state.picked.size).toBe(0);
  });

  it('uses the singular for one book and cancels a pending confirmation when the picks change', async () => {
    const {sel} = await setup();
    sel.enterSelect('a');
    dom.el('selDelete').click();
    expect(dom.el('selConfirmText').textContent).toMatch(/^Delete 1 book\?/);
    sel.togglePick('b');
    expect(dom.el('selConfirm').hidden()).toBe(true);
  });
});
