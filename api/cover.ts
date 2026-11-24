import {first, USER_AGENT, type ApiReq, type ApiRes} from './_lib/http';

/**
 * GET /api/cover?id=<Open Library cover id>&size=S|M|L
 * Serves covers from our own origin so the browser can draw them to a canvas (and export it)
 * without cross-origin tainting. Only numeric Open Library ids are accepted, so this is not an open proxy.
 */

const MAX_BYTES = 4 * 1024 * 1024;
const SIZES = new Set(['S', 'M', 'L']);

export default async function handler(req: ApiReq, res: ApiRes): Promise<void> {
  const id = first(req.query.id);
  const sizeParam = first(req.query.size).toUpperCase();
  const size = SIZES.has(sizeParam) ? sizeParam : 'L';
  if (!/^\d{1,12}$/.test(id)) return void res.status(400).json({error: 'bad cover id'});
  try {
    // default=false makes Open Library answer 404 instead of a blank placeholder, so callers can fall back.
    const r = await fetch(`https://covers.openlibrary.org/b/id/${id}-${size}.jpg?default=false`, {
      headers: {'User-Agent': USER_AGENT},
      signal: AbortSignal.timeout(8000),
    });
    const type = r.headers.get('content-type') ?? '';
    if (r.status === 404 || !type.startsWith('image/')) {
      res.setHeader('Cache-Control', 'public, s-maxage=3600');
      return void res.status(404).json({error: 'no cover'});
    }
    if (!r.ok) throw new Error(`upstream ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > MAX_BYTES) return void res.status(502).json({error: 'cover too large'});
    res.setHeader('Content-Type', type);
    res.setHeader('Cache-Control', 'public, max-age=604800, s-maxage=2592000, immutable');
    res.status(200).send(buf);
  } catch (err) {
    console.error('cover proxy failed', String(err));
    res.setHeader('Cache-Control', 'no-store');
    res.status(502).json({error: 'upstream unavailable'});
  }
}
