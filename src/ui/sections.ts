import {$} from '../util';
import type {WallView} from '../scene/shelf';

let onGo: (caseIndex: number) => void = () => undefined;
let last: WallView | null = null;

export function initSections(go: (caseIndex: number) => void): void {
  onGo = go;
  $('sectionCurrent').addEventListener('click', (ev) => {
    ev.stopPropagation();
    setSheet($('sectionSheet').classList.contains('hidden'));
  });
  document.addEventListener('click', () => setSheet(false));
  $('sectionSheet').addEventListener('click', (ev) => ev.stopPropagation());
}

function setSheet(open: boolean): void {
  $('sectionSheet').classList.toggle('hidden', !open);
  $('sectionCurrent').setAttribute('aria-expanded', String(open));
}

/** Escape closes the phone sheet first. Returns true when it did. */
export function closeSectionSheet(): boolean {
  if ($('sectionSheet').classList.contains('hidden')) return false;
  setSheet(false);
  return true;
}

function fill(list: HTMLElement, v: WallView): void {
  list.replaceChildren();
  for (const s of v.sections) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'section-item';
    const here = v.here.includes(s.name);
    if (here) btn.setAttribute('aria-current', 'true');
    const name = document.createElement('span');
    name.textContent = s.name;
    const count = document.createElement('span');
    count.className = 'section-count';
    count.textContent = String(s.count);
    btn.append(name, count);
    btn.addEventListener('click', () => {
      onGo(s.firstCase);
      setSheet(false);
    });
    li.appendChild(btn);
    list.appendChild(li);
  }
}

/** Jump list: a rail on wide screens, a bar with a sheet on narrow ones. Hidden when there is only one section. */
export function renderSections(v: WallView): void {
  last = v;
  const many = v.sections.length > 1;
  $('sections').classList.toggle('hidden', !many);
  $('sectionBar').classList.toggle('hidden', !many);
  if (!many) setSheet(false);
  fill($('sectionList'), v);
  fill($('sectionSheetList'), v);
  $('sectionName').textContent = v.current;
  $('sectionCount').textContent = `${v.caseIndex + 1} of ${v.caseCount}`;
  // Keep the current entry in view in a long rail.
  $('sectionList').querySelector('[aria-current]')?.scrollIntoView({block: 'nearest'});
}

export const currentView = (): WallView | null => last;
