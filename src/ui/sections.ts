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

/** Whether the Other entry shows the genres inside it. Kept across redraws. */
let otherOpen = false;

function fill(list: HTMLElement, v: WallView): void {
  list.replaceChildren();
  for (const s of v.sections) {
    const li = document.createElement('li');
    const row = document.createElement('div');
    row.className = 'section-row';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'section-item';
    if (v.here.includes(s.name)) btn.setAttribute('aria-current', 'true');
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
    row.appendChild(btn);
    li.appendChild(row);
    if (s.contains?.length) {
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'section-toggle';
      toggle.setAttribute('aria-expanded', String(otherOpen));
      toggle.setAttribute('aria-label', `Genres in ${s.name}`);
      toggle.textContent = otherOpen ? '\u25be' : '\u25b8';
      toggle.addEventListener('click', (ev) => {
        ev.stopPropagation();
        otherOpen = !otherOpen;
        if (last) renderSections(last);
      });
      row.appendChild(toggle);
      if (otherOpen) {
        const sub = document.createElement('ul');
        sub.className = 'section-sub';
        for (const g of s.contains) {
          const item = document.createElement('li');
          const gb = document.createElement('button');
          gb.type = 'button';
          gb.className = 'section-item section-subitem';
          const gn = document.createElement('span');
          gn.textContent = g.name;
          const gc = document.createElement('span');
          gc.className = 'section-count';
          gc.textContent = String(g.count);
          gb.append(gn, gc);
          gb.addEventListener('click', () => {
            onGo(s.firstCase);
            setSheet(false);
          });
          item.appendChild(gb);
          sub.appendChild(item);
        }
        li.appendChild(sub);
      }
    }
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
