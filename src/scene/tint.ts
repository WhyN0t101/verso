/** Colour multiplier for a book: dimmed behind a pulled-out book or when it misses the search and filter. */
export function tintFor(o: {isSelected: boolean; anySelected: boolean; filtering: boolean; matches: boolean}): number {
  // The pulled-out book is never dimmed, whatever the search or filter says about it.
  if (o.isSelected) return 0xffffff;
  if (o.anySelected) return 0x5e564d;
  if (o.filtering && !o.matches) return 0x4d4740;
  return 0xffffff;
}
