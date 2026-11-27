import type {Book} from '../types';
import {state} from '../state';
import {$, downloadBlob, slug} from '../util';
import {drawCard, type CardFormat} from '../export/card';
import {THEMES} from '../export/themes';
import {fontsReady} from '../fonts';
import {largeCover, loadCover} from '../covers';
import {createCardSlot} from './cardSlot';

const FORMATS: readonly CardFormat[] = ['post', 'story', 'square'];
const HELP = 'If a download is blocked here, press and hold the image (or right click it) and choose Save image.';
let book: Book | null = null;
const slot = createCardSlot();
let renderId = 0;

/** Draws the card for the open book. A failure is shown in the dialog instead of leaving "Preparing…" up for good. */
async function render(): Promise<void> {
  const id = ++renderId;
  // The previous card must not stay downloadable under the new name while this one is drawn, or if drawing fails.
  slot.clear();
  $<HTMLImageElement>('exImg').removeAttribute('src');
  updateShare();
  try {
    await draw(id);
  } catch (err) {
    console.warn('card export failed', err);
    if (id === renderId) $('exMsg').textContent = 'Could not draw the image. Close this and try again.';
  }
}

async function draw(id: number): Promise<void> {
  if (!book) return;
  $('exMsg').textContent = 'Preparing your image…';
  await fontsReady;
  // The large size is only worth its bytes here; fall back to the medium one the shelf already has.
  const cover = book.cover ? ((await loadCover(largeCover(book.cover))) ?? (await loadCover(book.cover))) : null;
  if (id !== renderId) return;
  const canvas = drawCard(book, state.fmt, cover, state.theme);
  const out = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
  if (id !== renderId) return;
  if (!out) throw new Error('canvas.toBlob returned no image');
  $<HTMLImageElement>('exImg').src = slot.set(out);
  $('exMsg').textContent = HELP;
  updateShare();
}

const fileName = () => `${slug(book?.title ?? 'book')}-${state.fmt}-${state.theme}.png`;
const asFile = (b: Blob) => new File([b], fileName(), {type: 'image/png'});

/** Share (the native sheet, with Instagram on phones) only appears where the browser can share files. */
function updateShare(): void {
  const {blob} = slot;
  const can = !!blob && typeof navigator.canShare === 'function' && navigator.canShare({files: [asFile(blob)]});
  $('exShare').classList.toggle('hidden', !can);
  $('exDownload').classList.toggle('primary', !can);
}

export function openExport(b: Book): void {
  book = b;
  $('export').classList.remove('hidden');
  void render();
}

export function initExport(): void {
  const themes = $('exThemes');
  for (const t of THEMES) {
    const btn = document.createElement('button');
    btn.className = 'btn' + (t.id === state.theme ? ' on' : '');
    btn.dataset.theme = t.id;
    btn.textContent = t.label;
    themes.appendChild(btn);
  }
  themes.addEventListener('click', (ev) => {
    const key = ev.target instanceof HTMLElement ? ev.target.dataset.theme : undefined;
    const id = THEMES.find((t) => t.id === key)?.id;
    if (!id) return;
    state.theme = id;
    for (const el of themes.children) el.classList.toggle('on', el instanceof HTMLElement && el.dataset.theme === id);
    void render();
  });
  $('exSeg').addEventListener('click', (ev) => {
    const key = ev.target instanceof HTMLElement ? ev.target.dataset.fmt : undefined;
    const fmt = FORMATS.find((f) => f === key);
    if (!fmt) return;
    state.fmt = fmt;
    for (const el of $('exSeg').children) el.classList.toggle('on', el instanceof HTMLElement && el.dataset.fmt === fmt);
    void render();
  });
  $('exClose').addEventListener('click', closeExport);
  $('exShare').addEventListener('click', async () => {
    const {blob} = slot;
    if (!blob || !book) return;
    try {
      await navigator.share({files: [asFile(blob)], title: book.title});
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      console.warn('share failed', err);
      $('exMsg').textContent = 'Sharing did not work here. Use Download PNG instead.';
    }
  });
  $('exDownload').addEventListener('click', () => {
    const {blob} = slot;
    if (!blob || !book) return;
    downloadBlob(blob, fileName());
    $('exMsg').textContent = 'Saved. You can now post it.';
  });
  $('exCopy').addEventListener('click', async () => {
    const {blob} = slot;
    if (!blob) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({'image/png': blob})]);
      $('exMsg').textContent = 'Image copied. Paste it into Instagram, Messages or any editor.';
    } catch (err) {
      console.warn('clipboard write failed', err);
      $('exMsg').textContent = 'Copy is blocked in this view. ' + HELP;
    }
  });
}

export function closeExport(): void {
  $('export').classList.add('hidden');
}
