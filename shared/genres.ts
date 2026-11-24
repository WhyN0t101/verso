/** The fixed genre list the add dialog offers and the API maps noisy subjects onto. */
export const GENRES = [
  'Fantasy',
  'Science fiction',
  'Dystopian',
  'Horror',
  'Gothic',
  'Mystery',
  'Thriller',
  'Romance',
  'Historical fiction',
  'Adventure',
  'Classic',
  'Fiction',
  'Young adult',
  'Children',
  'Comics',
  'Poetry',
  'Drama',
  'Philosophy',
  'Psychology',
  'Biography',
  'History',
  'Science',
  'Self-help',
  'Business',
  'Non-fiction',
] as const;

export type Genre = (typeof GENRES)[number];

// Ordered: specific genres first, so "Science fiction" is not swallowed by the generic "Fiction" rule.
const RULES: [Genre, RegExp][] = [
  ['Gothic', /gothic/],
  ['Horror', /horror|vampire|ghost|zombie|supernatural|haunted/],
  ['Dystopian', /dystopi|utopia|totalitarian/],
  ['Science fiction', /science fiction|sci-?fi|space (opera|travel|flight)|extraterrestrial|cyberpunk|time travel|robots?\b|androids?/],
  ['Fantasy', /fantasy|dragon|wizard|magic|elves|fairy tale|mythical|sword and sorcery/],
  ['Mystery', /mystery|mysteries|detective|crime fiction|murder|whodunit|private investigator/],
  ['Thriller', /thriller|suspense|espionage|\bspies\b|\bspy\b/],
  ['Romance', /romance|love stor|courtship|man-woman relationships/],
  ['Historical fiction', /historical fiction/],
  ['Adventure', /adventure|sea stories|whaling|voyages/],
  ['Young adult', /young adult|teen/],
  ['Children', /juvenile|children|picture books|readers\b/],
  ['Comics', /comic|graphic novel|manga/],
  ['Poetry', /poetry|poems|poets\b/],
  ['Drama', /^drama$|\bplays\b|theat(er|re)/],
  ['Philosophy', /philosoph|ethics|stoic/],
  ['Psychology', /psycholog|psychiatr|mental health/],
  ['Biography', /biograph|memoir|diaries|autobiograph/],
  ['History', /\bhistory\b(?! and criticism)|histories|military|ancient (rome|greece)/],
  ['Science', /^science$|physics|biology|chemistry|mathematic|astronomy|evolution/],
  ['Self-help', /self-help|self help|self-improvement|motivation|habits|happiness/],
  ['Business', /business|economics|management|leadership|finance|entrepreneur|marketing|investing/],
  ['Classic', /classic|(18|19)th century/],
  ['Fiction', /fiction|novel|stories/],
  ['Non-fiction', /non-?fiction|essays|reference/],
];

/** Picks the fixed genre that most subjects point to. Returns '' when nothing matches, so the user chooses. */
export function mapGenre(subjects: readonly string[]): string {
  const score = new Map<Genre, number>();
  for (const raw of subjects) {
    const s = raw.toLowerCase().trim();
    const hit = RULES.find(([, re]) => re.test(s));
    if (hit) score.set(hit[0], (score.get(hit[0]) ?? 0) + 1);
  }
  let best = '';
  let bestScore = 0;
  // RULES order breaks ties, so iterate in that order rather than in insertion order.
  for (const [g] of RULES) {
    const n = score.get(g) ?? 0;
    if (n > bestScore) {
      best = g;
      bestScore = n;
    }
  }
  return best;
}
