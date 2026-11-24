import type {SearchResult, WorkDetail} from './worker';

export type {SearchResult, WorkDetail};

async function get<T>(params: Record<string, string>, signal: AbortSignal, path = '/api/search'): Promise<T> {
  const r = await fetch(`${path}?` + new URLSearchParams(params), {signal});
  if (!r.ok) throw new Error(`search api ${r.status}`);
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
