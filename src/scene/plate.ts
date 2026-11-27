export interface PlateLayout {
  lines: string[];
  fontSize: number;
}

const MIN_FONT = 14;
/** One line is at most this share of the plate height; below one line's comfort size the text wraps instead of shrinking. */
const ONE_LINE = 0.62;
const ONE_LINE_FLOOR = 0.4;
const TWO_LINE = 0.4;

/**
 * Fits a sign's text on a plate: one line at a size that stays readable, else two balanced lines, else one
 * line shrunk as far as needed. `measure` returns the width of a string at a font size.
 */
export function layoutPlate(text: string, maxW: number, height: number, measure: (s: string, fontSize: number) => number): PlateLayout {
  for (let fs = height * ONE_LINE; fs >= height * ONE_LINE_FLOOR; fs -= 2) {
    if (measure(text, fs) <= maxW) return {lines: [text], fontSize: fs};
  }
  const words = text.split(' ');
  let best: string[] | null = null;
  let bestWidth = Infinity;
  const reference = height * TWO_LINE;
  for (let i = 1; i < words.length; i++) {
    const pair = [words.slice(0, i).join(' '), words.slice(i).join(' ')];
    const widest = Math.max(...pair.map((l) => measure(l, reference)));
    if (widest < bestWidth) {
      best = pair;
      bestWidth = widest;
    }
  }
  if (best) {
    const pair = best;
    for (let fs = reference; fs >= MIN_FONT; fs -= 2) {
      if (pair.every((l) => measure(l, fs) <= maxW)) return {lines: pair, fontSize: fs};
    }
  }
  let fs = height * ONE_LINE_FLOOR;
  while (measure(text, fs) > maxW && fs > MIN_FONT) fs -= 2;
  return {lines: [text], fontSize: fs};
}
