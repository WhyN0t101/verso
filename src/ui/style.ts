import type {LightId, Settings, WoodId} from '../types';
import {state, persist} from '../state';
import {$, toast} from '../util';
import {BACKGROUNDS, LIGHTS, WOODS, imageBackgroundCss} from '../presets';
import {STUDY, encodeWithinLimit} from '../data/settings';

const MAX_IMAGE_SIDE = 1600;

export function applyBackground(bg: Settings['background']): void {
  const css = bg.kind === 'image' ? imageBackgroundCss(bg.data) : (BACKGROUNDS.find((b) => b.id === bg.id) ?? BACKGROUNDS[0])?.css;
  if (css) document.body.style.setProperty('--bg', css);
}

/** Downscales an uploaded photo so it fits localStorage next to the books. */
async function imageToDataUrl(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  const g = c.getContext('2d');
  if (!g) throw new Error('2D canvas unavailable');
  g.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return encodeWithinLimit((q) => c.toDataURL('image/jpeg', q));
}

function option(group: HTMLElement, id: string, label: string, swatchCss: string | null, on: boolean): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'opt' + (on ? ' on' : '');
  b.dataset.id = id;
  if (swatchCss) {
    const sw = document.createElement('span');
    sw.className = 'swatch';
    sw.style.background = swatchCss;
    b.appendChild(sw);
  }
  b.appendChild(document.createTextNode(label));
  group.appendChild(b);
  return b;
}

function renderGroups(): void {
  const s = state.settings;
  const wood = $('stWood');
  const light = $('stLight');
  const bg = $('stBg');
  $('stStudySwatch').style.background = BACKGROUNDS.find((b) => b.id === 'study')?.css ?? '';
  $('stStudy').classList.toggle('on', s.wood === STUDY.wood && s.light === STUDY.light && s.background.kind === 'preset' && s.background.id === STUDY.background.id);
  [wood, light, bg].forEach((g) => g.replaceChildren());
  for (const [id, w] of Object.entries(WOODS)) option(wood, id, w.label, w.base, s.wood === id);
  for (const [id, l] of Object.entries(LIGHTS)) option(light, id, l.label, `#${l.keyColor.toString(16).padStart(6, '0')}`, s.light === id);
  for (const b of BACKGROUNDS) option(bg, b.id, b.label, b.css, s.background.kind === 'preset' && s.background.id === b.id);
  if (s.background.kind === 'image') option(bg, 'image', 'Your image', `url("${s.background.data}") center / cover`, true);
  $('stRemoveImg').classList.toggle('hidden', s.background.kind !== 'image');
  $('stProps').classList.toggle('on', !!s.props);
  $('stProps').setAttribute('aria-pressed', String(!!s.props));
}

/** Applies the named Study look to wood, light and background. Grouping and everything else stay as they are. */
export function applyStudy(s: Settings): void {
  s.wood = STUDY.wood;
  s.light = STUDY.light;
  s.background = {...STUDY.background};
}

export function initStyle(onSettingsChange: () => void): void {
  const change = (mutate: (s: Settings) => void): void => {
    mutate(state.settings);
    persist();
    applyBackground(state.settings.background);
    onSettingsChange();
    renderGroups();
  };
  $('stWood').addEventListener('click', (ev) => {
    const id = (ev.target as HTMLElement).closest<HTMLElement>('.opt')?.dataset.id;
    if (id) change((s) => (s.wood = id as WoodId));
  });
  $('stLight').addEventListener('click', (ev) => {
    const id = (ev.target as HTMLElement).closest<HTMLElement>('.opt')?.dataset.id;
    if (id) change((s) => (s.light = id as LightId));
  });
  $('stBg').addEventListener('click', (ev) => {
    const id = (ev.target as HTMLElement).closest<HTMLElement>('.opt')?.dataset.id;
    // Picking the "Your image" swatch again is a no-op; presets replace the image until a new upload.
    if (id && id !== 'image') change((s) => (s.background = {kind: 'preset', id}));
  });
  $('stProps').addEventListener('click', () =>
    change((s) => {
      if (s.props) delete s.props;
      else s.props = true;
    }),
  );
  $('stRemoveImg').addEventListener('click', () => change((s) => (s.background = {...STUDY.background})));
  $('stStudy').addEventListener('click', () => change(applyStudy));
  $<HTMLInputElement>('stUpload').addEventListener('change', async (ev) => {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      const data = await imageToDataUrl(file);
      change((s) => (s.background = {kind: 'image', data}));
    } catch (err) {
      console.warn('background upload failed', err);
      toast('Could not read that image. Try a JPEG or PNG.');
    }
  });
  $('stClose').addEventListener('click', closeStyle);
  applyBackground(state.settings.background);
}

export function openStyle(): void {
  renderGroups();
  $('style').classList.remove('hidden');
}

export function closeStyle(): void {
  $('style').classList.add('hidden');
}
