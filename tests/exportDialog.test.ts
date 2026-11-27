import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {installFakeDom, type FakeDom} from './helpers/fakeDom';
import type {Book} from '../src/types';

const drawCard = vi.fn();
const downloadBlob = vi.fn();
vi.mock('../src/fonts', () => ({fontsReady: Promise.resolve()}));
vi.mock('../src/covers', () => ({largeCover: (u: string) => u, loadCover: async () => null}));
vi.mock('../src/export/card', () => ({drawCard: (...a: unknown[]) => drawCard(...a)}));
vi.mock('../src/util', async (orig) => ({...(await orig<typeof import('../src/util')>()), downloadBlob: (...a: unknown[]) => downloadBlob(...a)}));

const book = {id: 'b1', title: 'Dune'} as Book;
const canvasOf = (blob: Blob | null) => ({toBlob: (cb: (b: Blob | null) => void) => cb(blob)});
const settle = () => new Promise((r) => setTimeout(r, 0));

let dom: FakeDom;
beforeEach(() => {
  vi.stubGlobal('localStorage', {getItem: () => null, setItem: () => undefined});
  vi.stubGlobal('navigator', {});
  dom = installFakeDom();
  drawCard.mockReset();
  downloadBlob.mockReset();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function open() {
  const mod = await import('../src/ui/exportDialog');
  mod.initExport();
  return mod;
}

describe('export dialog', () => {
  it('downloads the card that was drawn', async () => {
    drawCard.mockReturnValue(canvasOf(new Blob(['one'])));
    const {openExport} = await open();
    openExport(book);
    await settle();
    dom.el('exDownload').click();
    expect(downloadBlob).toHaveBeenCalledTimes(1);
  });

  it('cannot download the previous card while a new one is drawn or after drawing fails', async () => {
    drawCard.mockReturnValueOnce(canvasOf(new Blob(['one'])));
    const {openExport} = await open();
    openExport(book);
    await settle();
    drawCard.mockImplementation(() => {
      throw new Error('canvas blew up');
    });
    openExport(book);
    await settle();
    dom.el('exDownload').click();
    expect(downloadBlob).not.toHaveBeenCalled();
    expect(dom.el('exImg').getAttribute('src')).toBeNull();
  });

  it('replaces "Preparing" with an error when drawing fails or the canvas yields no image', async () => {
    const {openExport} = await open();
    drawCard.mockImplementation(() => {
      throw new Error('boom');
    });
    openExport(book);
    await settle();
    expect(dom.el('exMsg').textContent).toMatch(/Could not draw/);
    drawCard.mockReturnValue(canvasOf(null));
    openExport(book);
    await settle();
    expect(dom.el('exMsg').textContent).toMatch(/Could not draw/);
  });
});
