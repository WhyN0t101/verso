import type {Book, Tone} from './types';

export interface ToneQueueDeps {
  /** Resolves the decoded cover, or null when it is missing or unusable. */
  load(url: string): Promise<HTMLImageElement | null>;
  analyse(img: HTMLImageElement): Tone;
  /** Called after a tone was stored on the book. */
  onTone(b: Book, tone: Tone): void;
  /** How many covers are fetched at once. Background work stays at 1 or 2. */
  concurrency?: number;
  /** Lets the page paint and animate between jobs. */
  breathe?(): Promise<void>;
}

export interface ToneQueue {
  /** Queues books that have a cover but no stored tone. A book is tried at most once per queue. */
  add(books: Book[]): void;
  /** Resolves when nothing is queued or running. */
  idle(): Promise<void>;
}

const defaultBreathe = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 30));

/** Fills in the missing `tone` of books with covers (for example imported ones) without ever blocking the UI. */
export function createToneQueue(deps: ToneQueueDeps): ToneQueue {
  const limit = Math.min(Math.max(deps.concurrency ?? 1, 1), 2);
  const breathe = deps.breathe ?? defaultBreathe;
  const tried = new Set<string>();
  const waiting: Book[] = [];
  let running = 0;
  let waiters: (() => void)[] = [];

  async function work(): Promise<void> {
    for (let b = waiting.shift(); b; b = waiting.shift()) {
      if (b.tone || !b.cover) continue;
      try {
        const img = await deps.load(b.cover);
        // The book may have gained a tone (the add form) while its cover was loading.
        if (img && !b.tone) {
          const tone = deps.analyse(img);
          b.tone = tone;
          deps.onTone(b, tone);
        }
      } catch (err) {
        console.warn('tone skipped for', b.id, err);
      }
      await breathe();
    }
  }

  function pump(): void {
    while (running < limit && waiting.length) {
      running++;
      void work().finally(() => {
        running--;
        if (!running && !waiting.length) {
          waiters.forEach((w) => w());
          waiters = [];
        } else pump();
      });
    }
  }

  return {
    add(books) {
      for (const b of books) {
        if (!b.cover || b.tone || tried.has(b.id)) continue;
        tried.add(b.id);
        waiting.push(b);
      }
      pump();
    },
    idle: () => (running || waiting.length ? new Promise((resolve) => waiters.push(resolve)) : Promise.resolve()),
  };
}
