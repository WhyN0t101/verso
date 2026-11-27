import {vi} from 'vitest';

type Listener = (ev: FakeEvent) => unknown;
export interface FakeEvent {
  target: FakeElement;
  key?: string;
  stopPropagation(): void;
  preventDefault(): void;
}

/**
 * A just-enough DOM for the UI modules, so their logic is tested without a browser or a new dependency.
 * Every id asked for with getElementById exists, like the real page where index.html defines them all.
 */
export class FakeElement {
  readonly classes = new Set<string>();
  readonly attrs = new Map<string, string>();
  readonly style = {setProperty: (_k: string, _v: string) => undefined, background: ''};
  readonly dataset: Record<string, string> = {};
  readonly listeners = new Map<string, Listener[]>();
  children: FakeElement[] = [];
  textContent = '';
  value = '';
  disabled = false;
  className = '';
  type = '';
  title = '';
  src = '';
  alt = '';
  loading = '';
  max = '';
  constructor(readonly id = '') {}
  readonly classList = {
    add: (...c: string[]) => c.forEach((x) => this.classes.add(x)),
    remove: (...c: string[]) => c.forEach((x) => this.classes.delete(x)),
    toggle: (c: string, force?: boolean) => {
      const on = force ?? !this.classes.has(c);
      if (on) this.classes.add(c);
      else this.classes.delete(c);
      return on;
    },
    contains: (c: string) => this.classes.has(c),
  };
  setAttribute(k: string, v: string): void {
    this.attrs.set(k, v);
  }
  getAttribute(k: string): string | null {
    return this.attrs.get(k) ?? null;
  }
  removeAttribute(k: string): void {
    this.attrs.delete(k);
  }
  addEventListener(type: string, fn: Listener): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  removeEventListener(): void {}
  appendChild(c: FakeElement): FakeElement {
    this.children.push(c);
    return c;
  }
  append(...c: FakeElement[]): void {
    this.children.push(...c);
  }
  replaceChildren(...c: FakeElement[]): void {
    this.children = c;
  }
  focus(): void {}
  scrollIntoView(): void {}
  querySelector(): FakeElement | null {
    return null;
  }
  /** Fires the listeners of `type`; `target` defaults to this element. */
  fire(type: string, extra: Partial<FakeEvent> = {}): void {
    const ev: FakeEvent = {target: this, stopPropagation() {}, preventDefault() {}, ...extra};
    for (const fn of this.listeners.get(type) ?? []) fn(ev);
  }
  click(): void {
    this.fire('click');
  }
  hidden(): boolean {
    return this.classes.has('hidden');
  }
}

export interface FakeDom {
  el(id: string): FakeElement;
  /** Listeners registered on `document` itself. */
  document: FakeElement;
}

/** Installs `document` on the global object; call once per test and `vi.unstubAllGlobals()` afterwards. */
export function installFakeDom(): FakeDom {
  const byId = new Map<string, FakeElement>();
  const doc = new FakeElement('#document');
  const el = (id: string): FakeElement => {
    let e = byId.get(id);
    if (!e) byId.set(id, (e = new FakeElement(id)));
    return e;
  };
  vi.stubGlobal('document', {
    getElementById: el,
    createElement: () => new FakeElement(),
    createTextNode: (t: string) => Object.assign(new FakeElement(), {textContent: t}),
    addEventListener: doc.addEventListener.bind(doc),
    removeEventListener: () => undefined,
    body: new FakeElement('body'),
    fonts: {load: async () => []},
  });
  return {el, document: doc};
}
