import {mapGenre} from '../shared/genres';
import {asRecord, isInt, isRecord, records, strings, text} from '../shared/untrusted';

/**
 * Cloudflare Worker: serves /api/search and /api/cover; everything else is static assets.
 *   GET /api/search?q=dune          candidate books (Open Library search.json)
 *   GET /api/search?work=OL893414W  summary + genre for one work (Open Library works, then Google Books)
 *   GET /api/cover?id=11481354      cover image from our own origin, numeric Open Library ids only
 * GOOGLE_BOOKS_API_KEY is a Worker secret. When unset, the Google Books fallback is skipped.
 */

export interface Env {
  ASSETS: {fetch(req: Request): Promise<Response>};
  GOOGLE_BOOKS_API_KEY?: string;
}
export interface Ctx {
  waitUntil(p: Promise<unknown>): void;
}

const OL = 'https://openlibrary.org';
const USER_AGENT = 'Verso/0.1 (personal bookshelf app)';
const MAX_SUMMARY = 500;
const MAX_COVER_BYTES = 4 * 1024 * 1024;
const COVER_SIZES = new Set(['S', 'M', 'L']);
// An allow-list, not startsWith('image/'): this is our own origin, so image/svg+xml could run script if opened directly.
const COVER_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

const CDN = 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800';
// A work with no summary anywhere is retried sooner, in case Google was only briefly unavailable.
const CDN_SHORT = 'public, max-age=300, s-maxage=3600';
// Counts the encoded string: a 150-character CJK title is 9 characters per letter. The per-field limits do the real work.
const MAX_QUERY_STRING = 2400;
// A cover id never changes its image, so a successful response is cacheable for good.
const COVER_CC = 'public, max-age=31536000, immutable';
// A missing cover may appear later; keep the miss short so the edge is not asked again on every view.
const COVER_MISS_CC = 'public, max-age=300, s-maxage=3600';
/** Medium is enough for the shelf; the export card asks for L. */
const DEFAULT_COVER_SIZE = 'M';

/* ---------- untrusted JSON ---------- */

// Everything an upstream sends is `unknown` until a helper from shared/untrusted.ts has checked it; the app never casts a reply.
/** The same rule /api/cover enforces on its id. */
const isCoverId = (v: unknown): v is number => isInt(v) && v > 0 && v < 1e12;

/* ---------- text helpers ---------- */

/** Cuts at a sentence end when one falls in the back half, else at a word, adding an ellipsis. */
export function truncate(s: string, max = MAX_SUMMARY): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const sentence = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  if (sentence > max * 0.5) return cut.slice(0, sentence + 1);
  // No space at all (CJK text): cut at the limit rather than dropping the last character.
  const space = cut.lastIndexOf(' ');
  return (space < 0 ? cut : cut.slice(0, space)).replace(/[\s,;:.]+$/, '') + '…';
}

/**
 * Open Library descriptions are free text: plain strings or {value}, often with markdown links,
 * "----------" separators and "([source][1])" tails. Returns a clean, length-capped summary.
 */
export function cleanDescription(raw: unknown): string {
  let s = typeof raw === 'string' ? raw : isRecord(raw) && typeof raw.value === 'string' ? raw.value : '';
  const tail = s.search(/\r?\n\s*(-{3,}|\*{3,}|_{3,})|\(\[?source\]?|\bAlso contained in\b|\bContains:|\bSee also:/i);
  if (tail >= 0) s = s.slice(0, tail);
  s = s
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[*_]{1,2}([^*_]+)[*_]{1,2}/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  return truncate(s);
}

/* ---------- http helpers ---------- */

function json(body: unknown, status = 200, cacheControl = 'no-store'): Response {
  return new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json', 'Cache-Control': cacheControl}});
}

/** Open Library can take ~17s on a cold request, so the per-attempt budget is generous. */
const UPSTREAM_TIMEOUT_MS = 12000;

/** GET with one retry on a timeout, network error or 5xx. Other statuses (404, 429) are returned as they are. */
async function fetchUpstream(url: string, headers: Record<string, string>): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(url, {headers: {'User-Agent': USER_AGENT, ...headers}, signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)});
      if (r.status < 500 || attempt === 1) return r;
      lastErr = new Error(`upstream ${r.status} for ${new URL(url).hostname}`);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

async function getJson(url: string): Promise<unknown> {
  const r = await fetchUpstream(url, {Accept: 'application/json'});
  if (!r.ok) throw new Error(`upstream ${r.status} for ${new URL(url).hostname}`);
  return r.json();
}

/** Workers Cache API in front of an upstream call. Only 200s are stored; the response's Cache-Control sets the TTL. */
async function withCache(keyUrl: string, ctx: Ctx, produce: () => Promise<Response>): Promise<Response> {
  // lib.dom's CacheStorage has no `default`; that member exists only in the Workers runtime.
  const cache = (caches as unknown as {default: Cache}).default;
  const key = new Request(keyUrl, {method: 'GET'});
  const hit = await cache.match(key);
  if (hit) return hit;
  const res = await produce();
  if (res.status === 200) ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}

/* ---------- /api/search ---------- */

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
  const data = asRecord(await getJson(`${OL}/search.json?q=${encodeURIComponent(q)}&limit=8&fields=${fields}`));
  const seen = new Set<string>();
  const out: SearchResult[] = [];
  for (const d of records(data.docs)) {
    const work = /^\/works\/(OL\d+W)$/.exec(typeof d.key === 'string' ? d.key : '')?.[1];
    // The reply is third-party JSON: every field is checked for its type before it reaches the app.
    const title = text(d.title, 150);
    if (!work || !title) continue;
    const first = strings(d.author_name)[0];
    const author = first ? first.slice(0, 100) : '';
    const dedupe = `${title.toLowerCase()}|${author.toLowerCase()}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    out.push({
      work,
      title,
      author,
      year: isInt(d.first_publish_year) ? d.first_publish_year : null,
      genre: mapGenre(strings(d.subject)),
      cover: isCoverId(d.cover_i) ? `/api/cover?id=${d.cover_i}` : null,
    });
  }
  return out;
}

async function googleSummary(title: string, author: string, key: string): Promise<string> {
  const q = `intitle:${title}${author ? `+inauthor:${author}` : ''}`;
  const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q).replace(/%2B/g, '+')}&maxResults=3&printType=books&fields=items(volumeInfo(description))&key=${encodeURIComponent(key)}`;
  const data = asRecord(await getJson(url));
  for (const it of records(data.items)) {
    const s = cleanDescription(asRecord(it.volumeInfo).description);
    if (s) return s;
  }
  return '';
}

/** First author's name from the Open Library work record, or '' when it cannot be resolved. */
async function authorName(work: Record<string, unknown>): Promise<string> {
  const key = asRecord(records(work.authors)[0]?.author).key;
  if (typeof key !== 'string' || !/^\/authors\/OL\d+A$/.test(key)) return '';
  try {
    return text(asRecord(await getJson(`${OL}${key}.json`)).name, 100);
  } catch (err) {
    // Title alone still finds most books, so a failed author lookup is not fatal.
    console.warn('author lookup failed', String(err));
    return '';
  }
}

/**
 * Everything here derives from the work id alone: the Google query uses the title and author from
 * Open Library's own record, never from the request, so the result is the same for every caller.
 */
async function workDetail(id: string, googleKey: string | undefined): Promise<WorkDetail> {
  const work = asRecord(await getJson(`${OL}/works/${id}.json`));
  const genre = mapGenre(strings(work.subjects));
  const summary = cleanDescription(work.description);
  if (summary) return {summary, genre, source: 'openlibrary'};
  // No key means no fallback, quietly: Open Library alone is a complete flow.
  const title = text(work.title, 150);
  if (!googleKey || !title) return {summary: '', genre, source: null};
  try {
    const g = await googleSummary(title, await authorName(work), googleKey);
    return {summary: g, genre, source: g ? 'google' : null};
  } catch (err) {
    // Best effort: a Google outage or quota must not break adding a book.
    console.warn('google books fallback failed', String(err));
    return {summary: '', genre, source: null};
  }
}

async function handleSearch(url: URL, env: Env, ctx: Ctx): Promise<Response> {
  const work = url.searchParams.get('work') ?? '';
  const q = (url.searchParams.get('q') ?? '').trim();
  try {
    if (work) {
      if (!/^OL\d+W$/.test(work)) return json({error: 'bad work id'}, 400);
      return await withCache(`${url.origin}/api/search?work=${work}`, ctx, async () => {
        const d = await workDetail(work, env.GOOGLE_BOOKS_API_KEY);
        return json(d, 200, d.summary ? CDN : CDN_SHORT);
      });
    }
    if (q.length < 2 || q.length > 120) return json({error: 'q must be 2-120 characters'}, 400);
    return await withCache(`${url.origin}/api/search?q=${encodeURIComponent(q.toLowerCase())}`, ctx, async () => json({results: await search(q)}, 200, CDN));
  } catch (err) {
    console.error('search failed', String(err));
    return json({error: 'upstream unavailable'}, 502);
  }
}

/* ---------- /api/covers ---------- */

export interface CoverChoice {
  /** Numeric Open Library cover id; the app loads it through /api/cover. */
  id: number;
  title: string;
  year: number | null;
}

const MAX_CHOICES = 8;
// Editions that are about the book rather than the book.
const GUIDE = /\b(study guides?|sparknotes|cliffs? ?notes|notes|summary|summaries|analysis|workbook|companion|teachers?|lesson|quiz|critical|essays?|commentary|reader'?s guide)\b/i;

const normTitle = (t: string): string => t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Orders edition covers for one book: an exact title match first, titles that contain it next, and
 * study guides and notes editions last. Only positive integer ids survive (the same rule /api/cover enforces).
 */
export function rankCovers(editions: readonly unknown[], bookTitle: string): CoverChoice[] {
  const want = normTitle(bookTitle);
  const seen = new Set<number>();
  const scored: {c: CoverChoice; score: number; order: number}[] = [];
  records(editions).forEach((e, order) => {
    const id = (Array.isArray(e.covers) ? e.covers : []).find(isCoverId);
    if (id === undefined || seen.has(id)) return;
    seen.add(id);
    const title = text(e.title, 150);
    const have = normTitle(title);
    let score = 0;
    if (have === want) score += 4;
    else if (want && have.includes(want)) score += 2;
    // "Notes from Underground" is the book itself: an exact match is never a guide.
    if (have !== want && GUIDE.test(title)) score -= 5;
    const year = Number(/\b(\d{4})\b/.exec(text(e.publish_date, 40))?.[1]);
    scored.push({c: {id, title, year: Number.isFinite(year) ? year : null}, score, order});
  });
  scored.sort((a, b) => b.score - a.score || a.order - b.order);
  return scored.slice(0, MAX_CHOICES).map((x) => x.c);
}

/**
 * The most-published works by the author carry the real editions. A search on the bare title can hit a
 * study guide or a translation under another title, so the search is free text and authors filter it.
 */
export function pickWorks(docs: readonly unknown[], author: string): string[] {
  const last = normTitle(author).split(' ').pop() ?? '';
  const withKey = records(docs).filter((d) => typeof d.key === 'string' && /^\/works\/OL\d+W$/.test(d.key));
  const byAuthor = last ? withKey.filter((d) => strings(d.author_name).some((n) => normTitle(n).includes(last))) : withKey;
  const editionCount = (d: Record<string, unknown>): number => (isInt(d.edition_count) ? d.edition_count : 0);
  return (byAuthor.length ? byAuthor : withKey)
    .sort((a, b) => editionCount(b) - editionCount(a))
    .slice(0, 2)
    .map((d) => text(d.key, 40).slice(7));
}

async function coverChoices(title: string, author: string): Promise<CoverChoice[]> {
  const fields = 'key,title,author_name,cover_i,edition_count';
  const found = asRecord(await getJson(`${OL}/search.json?q=${encodeURIComponent(`${title} ${author}`.trim())}&limit=8&fields=${fields}`));
  const works = pickWorks(Array.isArray(found.docs) ? found.docs : [], author);
  const lists = await Promise.allSettled(works.map((w) => getJson(`${OL}/works/${w}/editions.json?limit=100`)));
  const editions: unknown[] = [];
  for (const l of lists) if (l.status === 'fulfilled') editions.push(...records(asRecord(l.value).entries));
  if (!editions.length && lists.every((l) => l.status === 'rejected') && works.length) throw new Error('editions unavailable');
  return rankCovers(editions, title);
}

async function handleCovers(url: URL, ctx: Ctx): Promise<Response> {
  const title = (url.searchParams.get('title') ?? '').trim();
  const author = (url.searchParams.get('author') ?? '').trim();
  if (title.length < 2 || title.length > 150 || author.length > 100) return json({error: 'title must be 2-150 characters'}, 400);
  try {
    const key = `${url.origin}/api/covers?title=${encodeURIComponent(title.toLowerCase())}&author=${encodeURIComponent(author.toLowerCase())}`;
    return await withCache(key, ctx, async () => {
      const choices = await coverChoices(title, author);
      return json({choices: choices.map((c) => ({...c, cover: `/api/cover?id=${c.id}`}))}, 200, choices.length ? CDN : CDN_SHORT);
    });
  } catch (err) {
    console.error('cover choices failed', String(err));
    return json({error: 'upstream unavailable'}, 502);
  }
}

/* ---------- /api/cover ---------- */

/** The body of `r`, or null as soon as it is known to exceed `max` bytes (by its header, or while reading), so a huge reply is never held in memory. */
async function readCapped(r: Response, max: number): Promise<Uint8Array<ArrayBuffer> | null> {
  if (Number(r.headers.get('content-length')) > max) {
    await r.body?.cancel();
    return null;
  }
  const reader = r.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const {done, value} = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

/** Only numeric Open Library ids are accepted, so this is not an open proxy. */
async function handleCover(url: URL, ctx: Ctx): Promise<Response> {
  const rawId = url.searchParams.get('id') ?? '';
  const sizeParam = (url.searchParams.get('size') ?? '').toUpperCase();
  const size = COVER_SIZES.has(sizeParam) ? sizeParam : DEFAULT_COVER_SIZE;
  if (!/^\d{1,12}$/.test(rawId)) return json({error: 'bad cover id'}, 400);
  // Leading zeros would otherwise give every spelling of an id its own cache entry.
  const id = rawId.replace(/^0+(?=\d)/, '');
  try {
    return await withCache(`${url.origin}/api/cover?id=${id}&size=${size}`, ctx, async () => {
      // default=false makes Open Library answer 404 instead of a blank placeholder, so callers can fall back.
      const r = await fetchUpstream(`https://covers.openlibrary.org/b/id/${id}-${size}.jpg?default=false`, {});
      const type = (r.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
      if (r.status === 404) return json({error: 'no cover'}, 404, COVER_MISS_CC);
      // A 429 or 403 says nothing about the cover, so it must not be cached as a miss.
      if (!r.ok) throw new Error(`upstream ${r.status}`);
      if (!COVER_TYPES.has(type)) return json({error: 'no cover'}, 404, COVER_MISS_CC);
      const buf = await readCapped(r, MAX_COVER_BYTES);
      if (!buf) return json({error: 'cover too large'}, 502);
      return new Response(buf, {status: 200, headers: {'Content-Type': type, 'Cache-Control': COVER_CC, 'X-Content-Type-Options': 'nosniff'}});
    });
  } catch (err) {
    console.error('cover proxy failed', String(err));
    return json({error: 'upstream unavailable'}, 502);
  }
}

/* ---------- router ---------- */

export default {
  async fetch(req: Request, env: Env, ctx: Ctx): Promise<Response> {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);
    if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('Method not allowed', {status: 405, headers: {Allow: 'GET, HEAD'}});
    if (url.search.length > MAX_QUERY_STRING) return json({error: 'query string too long'}, 414);
    if (url.pathname === '/api/search') return handleSearch(url, env, ctx);
    if (url.pathname === '/api/cover') return handleCover(url, ctx);
    if (url.pathname === '/api/covers') return handleCovers(url, ctx);
    return json({error: 'not found'}, 404);
  },
};
