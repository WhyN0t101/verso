import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {installFakeDom, type FakeDom} from './helpers/fakeDom';

const loadCover = vi.fn();
const fetchCoverChoices = vi.fn();
vi.mock('../src/covers', () => ({loadCover: (...a: unknown[]) => loadCover(...a), dominantTone: () => ({h: 1, s: 2, l: 3})}));
vi.mock('../src/api', () => ({
  WorkerDownError: class extends Error {},
  fetchCoverChoices: (...a: unknown[]) => fetchCoverChoices(...a),
  fetchWork: vi.fn(),
  searchBooks: vi.fn(),
}));

let dom: FakeDom;
beforeEach(() => {
  dom = installFakeDom();
  vi.stubGlobal('setTimeout', ((fn: () => void) => (typeof fn === 'function' ? 0 : 0)) as unknown as typeof setTimeout);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  loadCover.mockReset();
  fetchCoverChoices.mockResolvedValue([{id: 1, title: 'Dune', year: 1965, cover: '/api/cover?id=1'}]);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Opens the add dialog, types a title and picks a cover whose colour is still being read. */
async function startSaveWhileCoverLoads() {
  const {initForm, openForm} = await import('../src/ui/form');
  const onSave = vi.fn();
  initForm(onSave);
  openForm(null);
  dom.el('fTitle').value = 'Dune';
  const gate = {resolve: (_: unknown) => {}};
  loadCover.mockReturnValue(new Promise((r) => (gate.resolve = r)));
  dom.el('fCoverChange').click();
  await Promise.resolve();
  await Promise.resolve();
  dom.el('fCovers').children[0]?.click();
  dom.el('form').fire('submit');
  return {onSave, gate};
}

describe('add and edit dialog', () => {
  it('saves once the cover colour is known, with the cover and its tone', async () => {
    const {onSave, gate} = await startSaveWhileCoverLoads();
    gate.resolve({naturalWidth: 200, naturalHeight: 300});
    await new Promise((r) => setImmediate(r));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({title: 'Dune', cover: '/api/cover?id=1', tone: {h: 1, s: 2, l: 3}});
  });

  it('does not save a book when the dialog was cancelled while the cover loaded', async () => {
    const {onSave, gate} = await startSaveWhileCoverLoads();
    dom.el('fCancel').click();
    gate.resolve({naturalWidth: 200, naturalHeight: 300});
    await new Promise((r) => setImmediate(r));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('ignores a second submit while the first still waits, so a book is not added twice', async () => {
    const {onSave, gate} = await startSaveWhileCoverLoads();
    dom.el('form').fire('submit');
    gate.resolve({naturalWidth: 200, naturalHeight: 300});
    await new Promise((r) => setImmediate(r));
    expect(onSave).toHaveBeenCalledTimes(1);
  });
});
