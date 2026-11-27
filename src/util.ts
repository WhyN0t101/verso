export const TAU = Math.PI * 2;
export const hsl = (h: number, s: number, l: number, a?: number) =>
  a == null ? `hsl(${h},${s}%,${l}%)` : `hsla(${h},${s}%,${l}%,${a})`;
export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} missing from index.html`);
  // Callers name the element type they expect for this id; the document cannot say.
  return el as T;
}

export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function slug(s: string): string {
  // Letters and digits of any script: an ASCII-only rule turned every Cyrillic or Japanese title into "book".
  return s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'book';
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

let toastTimer = 0;
/** A toast with one action button, such as Undo. It stays clickable until it fades. */
export function toastAction(msg: string, label: string, onClick: () => void, ms = 8000): void {
  const el = $('toast');
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'toast-btn';
  btn.textContent = label;
  btn.addEventListener('click', () => {
    el.classList.remove('show', 'action');
    clearTimeout(toastTimer);
    onClick();
  });
  el.replaceChildren(document.createTextNode(msg + ' '), btn);
  el.classList.add('show', 'action');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove('show', 'action'), ms);
}

export function toast(msg: string): void {
  const el = $('toast');
  el.textContent = msg;
  el.classList.remove('action');
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove('show'), 3200);
}
