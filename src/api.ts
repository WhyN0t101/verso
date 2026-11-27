import type {SearchResult, WorkDetail} from './worker';

export type {SearchResult, WorkDetail};

/** Dev only: the Vite proxy could not reach the Worker. */
export class WorkerDownError extends Error {
  constructor() {
    super('The Worker is not running, so the API is unreachable. Start it with npm run dev (starts both) or npm run worker.');
  }
}

async function get<T>(params: Record<string, string>, signal: AbortSignal, path = '/api/search'): Promise<T> {
  const r = await fetch(`${path}?` + new URLSearchParams(params), {signal});
  if (import.meta.env.DEV && r.status === 503 && (await r.clone().json().catch(() => null))?.error === 'worker-down') throw new WorkerDownError();
  if (!r.ok) throw new Error(`search api ${r.status}`);
  // Our own Worker answers this and has already checked every upstream field, so the reply shape is trusted here.
  return r.json() as Promise<T>;
}

export interface CoverChoice {
  id: number;
  title: string;
  year: number | null;
  /** Same-origin proxy path. */
  cover: string;
}

/** Candidate covers from the editions of a book, best match first. */
export async function fetchCoverChoices(title: string, author: string, signal: AbortSignal): Promise<CoverChoice[]> {
  return (await get<{choices: CoverChoice[]}>({title, author}, signal, '/api/covers')).choices;
}

export async function searchBooks(q: string, signal: AbortSignal): Promise<SearchResult[]> {
  return (await get<{results: SearchResult[]}>({q}, signal)).results;
}

export const fetchWork = (r: SearchResult, signal: AbortSignal): Promise<WorkDetail> =>
  get<WorkDetail>({work: r.work}, signal);
