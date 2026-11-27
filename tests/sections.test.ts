import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {installFakeDom, type FakeDom, type FakeElement} from './helpers/fakeDom';
import type {WallView} from '../src/scene/shelf';

let dom: FakeDom;
beforeEach(() => {
  vi.stubGlobal('localStorage', {getItem: () => null, setItem: () => undefined});
  dom = installFakeDom();
});
afterEach(() => vi.unstubAllGlobals());

const view = (over: Partial<WallView> = {}): WallView => ({
  caseIndex: 0,
  caseCount: 2,
  current: 'Fantasy',
  here: ['Fantasy'],
  sections: [
    {name: 'Fantasy', count: 3, firstCase: 0},
    {name: 'Poetry', count: 1, firstCase: 1},
  ],
  ...over,
});

/** The button of the n-th entry: li > div.section-row > button. */
const entry = (list: FakeElement, n: number): FakeElement => list.children[n]?.children[0]?.children[0] as FakeElement;

async function setup(grouped: boolean) {
  const {state} = await import('../src/state');
  if (grouped) state.settings.groupByGenre = true;
  else delete state.settings.groupByGenre;
  state.section = null;
  const mod = await import('../src/ui/sections');
  const go = vi.fn();
  const filter = vi.fn();
  mod.initSections(go, filter);
  return {state, mod, go, filter};
}

describe('jump list', () => {
  it('is hidden with a single section and shows "n of m" otherwise', async () => {
    const {mod} = await setup(true);
    mod.renderSections(view({sections: [{name: 'Bookcase 1', count: 4, firstCase: 0}]}));
    expect(dom.el('sections').hidden()).toBe(true);
    mod.renderSections(view());
    expect(dom.el('sections').hidden()).toBe(false);
    expect(dom.el('sectionCount').textContent).toBe('1 of 2');
  });

  it('marks the current and the picked entries for assistive tech', async () => {
    const {mod, state} = await setup(true);
    state.section = {name: 'Poetry', genres: ['Poetry']};
    mod.renderSections(view());
    const list = dom.el('sectionList');
    expect(entry(list, 0).getAttribute('aria-current')).toBe('true');
    expect(entry(list, 1).getAttribute('aria-pressed')).toBe('true');
  });

  it('when grouped, picking a genre jumps there and filters, and picking it again lets go without jumping', async () => {
    const {mod, state, go, filter} = await setup(true);
    mod.renderSections(view());
    entry(dom.el('sectionList'), 1).click();
    expect(state.section).toEqual({name: 'Poetry', genres: ['Poetry']});
    expect(go).toHaveBeenCalledWith(1);
    mod.renderSections(view());
    entry(dom.el('sectionList'), 1).click();
    expect(state.section).toBeNull();
    expect(go).toHaveBeenCalledTimes(1);
    expect(filter).toHaveBeenCalledTimes(2);
  });

  it('when not grouped, entries are bookcases: they jump but never filter', async () => {
    const {mod, state, go} = await setup(false);
    mod.renderSections(view({sections: [{name: 'Bookcase 1', count: 40, firstCase: 0}, {name: 'Bookcase 2', count: 9, firstCase: 1}]}));
    entry(dom.el('sectionList'), 1).click();
    expect(state.section).toBeNull();
    expect(go).toHaveBeenCalledWith(1);
  });

  it('"Other" lists its genres on demand and picking one filters on that genre alone', async () => {
    const {mod, state} = await setup(true);
    mod.renderSections(view({sections: [{name: 'Fantasy', count: 3, firstCase: 0}, {name: 'Other', count: 2, firstCase: 1, contains: [{name: 'Drama', count: 1}, {name: 'Comics', count: 1}]}]}));
    const li = dom.el('sectionList').children[1] as FakeElement;
    expect(li.children).toHaveLength(1);
    const toggle = li.children[0]?.children[1] as FakeElement;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    toggle.click();
    const opened = dom.el('sectionList').children[1] as FakeElement;
    expect(opened.children).toHaveLength(2);
    // opened.children[1] is the ul.section-sub; its items hold the genre buttons.
    const sub = opened.children[1] as FakeElement;
    (sub.children[1]?.children[0] as FakeElement).click();
    expect(state.section?.genres).toEqual(['Comics']);
  });

  it('Escape closes the phone sheet first and says whether it did', async () => {
    const {mod} = await setup(true);
    dom.el('sectionSheet').classList.add('hidden'); // index.html starts it hidden
    expect(mod.closeSectionSheet()).toBe(false);
    dom.el('sectionSheet').classList.remove('hidden');
    expect(mod.closeSectionSheet()).toBe(true);
    expect(dom.el('sectionSheet').hidden()).toBe(true);
  });
});
