import type {Book} from '../types';

export interface Quote {
  text: string;
  /** Notes are shown in quotation marks; a summary is shown as plain text. */
  quoted: boolean;
}

/** Notes win, then the summary. Null when the book has neither, so the card drops the text block. */
export function cardQuote(b: Pick<Book, 'notes' | 'summary'>): Quote | null {
  const notes = b.notes.trim();
  if (notes) return {text: `“${notes}”`, quoted: true};
  const summary = b.summary.trim();
  return summary ? {text: summary, quoted: false} : null;
}

export interface FitInput {
  /** Top edge of the cover. */
  top: number;
  /** Lowest baseline the text may reach. */
  bottom: number;
  /** Height of everything between the cover and the quote (gaps, stars, title, author, rule). */
  fixedBelow: number;
  quoteLineH: number;
  /** Quote lines wanted; 0 when the book has no quote. */
  wantLines: number;
  minCover: number;
  idealCover: number;
  maxCover: number;
}

/**
 * Splits the vertical space between the cover and the quote. The cover keeps its ideal height when
 * it can; otherwise quote lines are given up first, and the cover shrinks only as a last resort.
 * With no quote left, the cover grows into the free space.
 */
export function fitCover(i: FitInput): {cover: number; quoteLines: number} {
  const space = (q: number) => i.bottom - i.top - i.fixedBelow - q * i.quoteLineH;
  for (const need of [i.idealCover, i.minCover]) {
    for (let q = i.wantLines; q >= 0; q--) {
      if (space(q) >= need) return {cover: Math.min(i.maxCover, space(q)), quoteLines: q};
    }
  }
  return {cover: i.minCover, quoteLines: 0};
}
