import type {Book} from '../types';
import {state} from '../state';
import {$, downloadBlob, slug} from '../util';
import {drawCard, type CardFormat} from '../export/card';
import {THEMES, type ThemeId} from '../export/themes';
import {fontsReady} from '../fonts';
import {loadCover} from '../covers';

const HELP = 'If a download is blocked here, press and hold the image (or right click it) and choose Save image.';
let book: Book | null = null;
let blob: Blob | null = null;
let url: string | null = null;
let renderId = 0;

async function render(): Promise<void> {
  if (!book) return;
  const id = ++renderId;
  $('exMsg').textContent = 'Preparing your image…';
  await fontsReady;
  const cover = book.cover ? await loadCover(book.cover) : null;
  if (id !== renderId) return;
  const canvas = drawCard(book, state.fmt, cover, state.theme);
  const out = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
  if (id !== renderId || !out) return;
  blob = out;
  if (url) URL.revokeObjectURL(url);
  url = URL.createObjectURL(out);
  $<HTMLImageElement>('exImg').src = url;
  $('exMsg').textContent = HELP;
  updateShare();
}

const fileName = () => `${slug(book?.title ?? 'book')}-${state.fmt}-${state.theme}.png`;
const asFile = (b: Blob) => new File([b], fileName(), {type: 'image/png'});

/** Share (the native sheet, with Instagram on phones) only appears where the browser can share files. */
function updateShare(): void {
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
    const id = (ev.target as HTMLElement).dataset.theme as ThemeId | undefined;
    if (!id) return;
    state.theme = id;
    [...themes.children].forEach((el) => el.classList.toggle('on', (el as HTMLElement).dataset.theme === id));
    void render();
  });
  $('exSeg').addEventListener('click', (ev) => {
    const fmt = (ev.target as HTMLElement).dataset.fmt as CardFormat | undefined;
    if (!fmt) return;
    state.fmt = fmt;
    [...$('exSeg').children].forEach((el) => el.classList.toggle('on', (el as HTMLElement).dataset.fmt === fmt));
    void render();
  });
  $('exClose').addEventListener('click', closeExport);
  $('exShare').addEventListener('click', async () => {
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
    if (!blob || !book) return;
    downloadBlob(blob, fileName());
    $('exMsg').textContent = 'Saved. You can now post it.';
  });
  $('exCopy').addEventListener('click', async () => {
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
