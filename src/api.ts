import type {SearchResult, WorkDetail} from '../api/search';

export type {SearchResult, WorkDetail};

async function get<T>(params: Record<string, string>, signal: AbortSignal): Promise<T> {
  const r = await fetch('/api/search?' + new URLSearchParams(params), {signal});
  if (!r.ok) throw new Error(`search api ${r.status}`);
  return r.json() as Promise<T>;
}

export async function searchBooks(q: string, signal: AbortSignal): Promise<SearchResult[]> {
  return (await get<{results: SearchResult[]}>({q}, signal)).results;
}

export const fetchWork = (r: SearchResult, signal: AbortSignal): Promise<WorkDetail> =>
  get<WorkDetail>({work: r.work, title: r.title, author: r.author}, signal);
