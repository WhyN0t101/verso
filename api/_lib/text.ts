const MAX_SUMMARY = 500;

/** Cuts at a sentence end when one falls in the back half, else at a word, adding an ellipsis. */
export function truncate(s: string, max = MAX_SUMMARY): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const sentence = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  if (sentence > max * 0.5) return cut.slice(0, sentence + 1);
  return cut.slice(0, cut.lastIndexOf(' ')).replace(/[\s,;:.]+$/, '') + '…';
}

/**
 * Open Library descriptions are free text: plain strings or {value}, often with markdown links,
 * "----------" separators and "([source][1])" tails. Returns a clean, length-capped summary.
 */
export function cleanDescription(raw: unknown): string {
  let s = typeof raw === 'string' ? raw : raw && typeof raw === 'object' && typeof (raw as {value?: unknown}).value === 'string' ? (raw as {value: string}).value : '';
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
