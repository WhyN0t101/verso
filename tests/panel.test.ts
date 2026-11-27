import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {installFakeDom, type FakeDom, type FakeElement} from './helpers/fakeDom';
import {makeBook} from '../src/data/books';
import type {Book} from '../src/types';

vi.mock('../src/textures/draw', () => ({spineLook: () => ({h: 10, s: 20, l: 30})}));

let dom: FakeDom;
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('window', globalThis);
  dom = installFakeDom();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function setup(b: Book = makeBook({title: 'Dune', author: 'Frank Herbert', summary: 'Sand.'})) {
  const mod = await import('../src/ui/panel');
  const hooks = {onClose: vi.fn(), onEdit: vi.fn(), onDelete: vi.fn(), onExport: vi.fn(), onChange: vi.fn()};
  mod.initPanel(hooks);
  mod.showPanel(b);
  return {mod, hooks, b};
}

const star = (n: number): FakeElement => dom.el('pStars').children[n - 1] as FakeElement;
const chip = (i: number): FakeElement => dom.el('pStatus').children[i] as FakeElement;

describe('book panel', () => {
  it('shows the book and opens', async () => {
    await setup();
    expect(dom.el('pTitle').textContent).toBe('Dune');
    expect(dom.el('pAuthor').textContent).toBe('by Frank Herbert');
    expect(dom.el('panel').classes.has('open')).toBe(true);
  });

  it('says there is no summary instead of showing a blank', async () => {
    await setup(makeBook({title: 'X'}));
    expect(dom.el('pSummary').textContent).toMatch(/No summary yet/);
  });

  it('sets the rating, clears it on a second click, and reports each change', async () => {
    const {b, hooks} = await setup();
    star(4).click();
    expect(b.rating).toBe(4);
    star(4).click();
    expect(b.rating).toBe(0);
    expect(hooks.onChange).toHaveBeenCalledTimes(2);
    expect(star(1).getAttribute('aria-label')).toBe('1 star');
    expect(star(2).getAttribute('aria-label')).toBe('2 stars');
  });

  it('stamps today when a book is marked finished, shows the date row, and drops it when the status is cleared', async () => {
    vi.setSystemTime(new Date(2026, 3, 9, 12));
    const {b} = await setup();
    chip(2).click();
    expect(b.status).toBe('finished');
    expect(b.finishedOn).toBe('2026-04-09');
    expect(dom.el('pFinishedRow').hidden()).toBe(false);
    chip(2).click();
    expect(b.status).toBeUndefined();
    expect(b.finishedOn).toBeUndefined();
    expect(dom.el('pFinishedRow').hidden()).toBe(true);
  });

  it('keeps only a real date typed into the finished field', async () => {
    const {b} = await setup();
    chip(2).click();
    const input = dom.el('pFinished');
    input.value = '2025-02-30';
    input.fire('change');
    expect(b.finishedOn).toBeUndefined();
    input.value = '2025-02-28';
    input.fire('change');
    expect(b.finishedOn).toBe('2025-02-28');
  });

  it('stores notes at once but saves after a short pause, once for a burst of typing', async () => {
    const {b, hooks} = await setup();
    const notes = dom.el('pNotes');
    for (const v of ['a', 'ab', 'abc']) {
      notes.value = v;
      notes.fire('input', {target: notes});
    }
    expect(b.notes).toBe('abc');
    expect(hooks.onChange).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    expect(hooks.onChange).toHaveBeenCalledTimes(1);
  });

  it('needs two clicks to delete, and the first one expires', async () => {
    const {b, hooks} = await setup();
    const del = dom.el('pDelete');
    del.click();
    expect(hooks.onDelete).not.toHaveBeenCalled();
    expect(del.textContent).toBe('Tap again to confirm');
    vi.advanceTimersByTime(3000);
    expect(del.textContent).toBe('Delete');
    del.click();
    expect(hooks.onDelete).not.toHaveBeenCalled();
    del.click();
    expect(hooks.onDelete).toHaveBeenCalledWith(b);
  });

  it('does not carry an armed delete over to the next book that is opened', async () => {
    const {mod, hooks} = await setup();
    dom.el('pDelete').click();
    mod.showPanel(makeBook({title: 'Another'}));
    expect(dom.el('pDelete').textContent).toBe('Delete');
    dom.el('pDelete').click();
    expect(hooks.onDelete).not.toHaveBeenCalled();
  });

  it('does nothing for edit, export and delete once the panel is hidden', async () => {
    const {mod, hooks} = await setup();
    mod.hidePanel();
    dom.el('pEdit').click();
    dom.el('pExport').click();
    dom.el('pDelete').click();
    expect(hooks.onEdit).not.toHaveBeenCalled();
    expect(hooks.onExport).not.toHaveBeenCalled();
    expect(hooks.onDelete).not.toHaveBeenCalled();
  });
});
