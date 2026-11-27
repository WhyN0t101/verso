import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {FakeElement, installFakeDom, type FakeDom} from './helpers/fakeDom';

vi.mock('../src/fonts', () => ({fontsReady: Promise.resolve()}));
vi.mock('../src/covers', () => ({largeCover: (u: string) => u, loadCover: async () => null}));
vi.mock('../src/export/card', () => ({drawCard: () => ({toBlob: (cb: (b: Blob | null) => void) => cb(null)})}));

let dom: FakeDom;
beforeEach(() => {
  vi.stubGlobal('localStorage', {getItem: () => null, setItem: () => undefined});
  vi.stubGlobal('navigator', {});
  // The dialog tells its own buttons apart with `instanceof HTMLElement`.
  vi.stubGlobal('HTMLElement', FakeElement);
  dom = installFakeDom();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const pressed = (box: FakeElement) => box.children.map((b) => b.getAttribute('aria-pressed'));

describe('export dialog toggles', () => {
  it('exposes the chosen theme and format with aria-pressed, one at a time', async () => {
    const {initExport} = await import('../src/ui/exportDialog');
    const formats = ['post', 'story', 'square'].map((f, i) => {
      const b = new FakeElement();
      b.dataset.fmt = f;
      b.setAttribute('aria-pressed', String(i === 0));
      return b;
    });
    dom.el('exSeg').append(...formats);
    initExport();
    const themes = dom.el('exThemes');
    expect(themes.children.length).toBeGreaterThan(1);
    expect(pressed(themes).filter((v) => v === 'true')).toHaveLength(1);
    expect(themes.children[0]?.getAttribute('aria-pressed')).toBe('true'); // the default theme, classic

    const bold = themes.children.find((b) => b.dataset.theme === 'bold') as FakeElement;
    themes.fire('click', {target: bold});
    expect(bold.getAttribute('aria-pressed')).toBe('true');
    expect(pressed(themes).filter((v) => v === 'true')).toHaveLength(1);

    dom.el('exSeg').fire('click', {target: formats[2] as FakeElement});
    expect(pressed(dom.el('exSeg'))).toEqual(['false', 'false', 'true']);
  });
});
