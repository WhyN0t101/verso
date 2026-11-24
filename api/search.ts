import {first, getJson, TtlCache, type ApiReq, type ApiRes} from './_lib/http';
import {cleanDescription} from './_lib/text';
import {mapGenre} from '../shared/genres';

/**
 * One endpoint, two modes:
 *   GET /api/search?q=dune            -> candidate books (Open Library search.json)
 *   GET /api/search?work=OL893415W    -> summary + genre for one pick (Open Library works, then Google Books)
 * GOOGLE_BOOKS_API_KEY stays here on the server and is never sent to the browser.
 */

const OL = 'https://openlibrary.org';
const HOUR = 3600_000;
const cache = new TtlCache<unknown>();

interface OlDoc {
  key?: string;
  title?: string;
  author_name?: string[];
  first_publish_year?: number;
  subject?: string[];
  cover_i?: number;
}

export interface SearchResult {
  work: string;
  title: string;
  author: string;
  year: number | null;
  genre: string;
  cover: string | null;
}

export interface WorkDetail {
  summary: string;
  genre: string;
  source: 'openlibrary' | 'google' | null;
}

async function search(q: string): Promise<SearchResult[]> {
  const fields = 'key,title,author_name,first_publish_year,subject,cover_i';
  const data = (await getJson(`${OL}/search.json?q=${encodeURIComponent(q)}&limit=8&fields=${fields}`)) as {docs?: OlDoc[]};
  const seen = new Set<string>();
  const out: SearchResult[] = [];
  for (const d of data.docs ?? []) {
    const work = /^\/works\/(OL\d+W)$/.exec(d.key ?? '')?.[1];
    if (!work || !d.title) continue;
    const author = d.author_name?.[0] ?? '';
    const dedupe = `${d.title.toLowerCase()}|${author.toLowerCase()}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    out.push({
      work,
      title: d.title,
      author,
      year: d.first_publish_year ?? null,
      genre: mapGenre(d.subject ?? []),
      cover: d.cover_i ? `/api/cover?id=${d.cover_i}` : null,
    });
  }
  return out;
}

async function googleSummary(title: string, author: string): Promise<string> {
  const key = process.env.GOOGLE_BOOKS_API_KEY;
  const q = `intitle:${title}${author ? `+inauthor:${author}` : ''}`;
  const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q).replace(/%2B/g, '+')}&maxResults=3&printType=books&fields=items(volumeInfo(description))${key ? `&key=${encodeURIComponent(key)}` : ''}`;
  const data = (await getJson(url)) as {items?: {volumeInfo?: {description?: string}}[]};
  for (const it of data.items ?? []) {
    const s = cleanDescription(it.volumeInfo?.description);
    if (s) return s;
  }
  return '';
}

async function workDetail(id: string, title: string, author: string): Promise<WorkDetail> {
  const work = (await getJson(`${OL}/works/${id}.json`)) as {description?: unknown; subjects?: string[]};
  const genre = mapGenre(work.subjects ?? []);
  const summary = cleanDescription(work.description);
  if (summary) return {summary, genre, source: 'openlibrary'};
  if (!title) return {summary: '', genre, source: null};
  try {
    const g = await googleSummary(title, author);
    return {summary: g, genre, source: g ? 'google' : null};
  } catch (err) {
    // The fallback is best effort: a Google outage or quota must not break adding a book.
    console.warn('google books fallback failed', String(err));
    return {summary: '', genre, source: null};
  }
}

const CDN = 'public, s-maxage=86400, stale-while-revalidate=604800';

export default async function handler(req: ApiReq, res: ApiRes): Promise<void> {
  const q = first(req.query.q).trim();
  const work = first(req.query.work);
  try {
    let key: string;
    let load: () => Promise<unknown>;
    if (work) {
      if (!/^OL\d+W$/.test(work)) return void res.status(400).json({error: 'bad work id'});
      const title = first(req.query.title).slice(0, 150);
      const author = first(req.query.author).slice(0, 100);
      key = `w:${work}`;
      load = () => workDetail(work, title, author);
    } else {
      if (q.length < 2 || q.length > 120) return void res.status(400).json({error: 'q must be 2-120 characters'});
      key = `q:${q.toLowerCase()}`;
      load = async () => ({results: await search(q)});
    }
    let body = cache.get(key);
    if (!body) {
      body = await load();
      // A work with no summary is retried sooner, in case Google was only briefly unavailable.
      const empty = work && !(body as WorkDetail).summary;
      cache.set(key, body, empty ? HOUR : 24 * HOUR);
      res.setHeader('Cache-Control', empty ? 'public, s-maxage=3600' : CDN);
    } else {
      res.setHeader('Cache-Control', CDN);
    }
    res.status(200).json(body);
  } catch (err) {
    console.error('search failed', String(err));
    res.setHeader('Cache-Control', 'no-store');
    res.status(502).json({error: 'upstream unavailable'});
  }
}
