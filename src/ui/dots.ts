import {$} from '../util';

let onGo: (index: number) => void = () => undefined;

export function initDots(go: (index: number) => void): void {
  onGo = go;
}

/** One dot per bookcase; hidden when there is only one. Genre labels become tooltips when grouped. */
export function renderDots(active: number, labels: (string | null)[]): void {
  const box = $('dots');
  box.classList.toggle('hidden', labels.length < 2);
  box.replaceChildren();
  labels.forEach((label, i) => {
    const d = document.createElement('button');
    d.type = 'button';
    d.className = 'dot' + (i === active ? ' on' : '');
    d.setAttribute('aria-label', label ? `Bookcase ${i + 1}: ${label}` : `Bookcase ${i + 1}`);
    if (label) d.title = label;
    d.addEventListener('click', () => onGo(i));
    box.appendChild(d);
  });
}
