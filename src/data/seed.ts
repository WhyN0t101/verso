import type {BookDraft} from '../types';

const S: [string, string, string, string][] = [
  ['Frankenstein', 'Mary Shelley', 'Gothic', 'A young scientist brings a creature to life, then abandons it in horror. Rejected by everyone, the creature turns to vengeance, and both are ruined by what they refuse to face.'],
  ['Dracula', 'Bram Stoker', 'Horror', 'A solicitor travels to Transylvania and learns his client is an ancient vampire. A band of friends then races to stop the Count from spreading his curse across England.'],
  ['Pride and Prejudice', 'Jane Austen', 'Romance', 'Elizabeth Bennet and the proud Mr Darcy misjudge each other badly. Through wit, embarrassment and hard won self knowledge, they learn what love and character really require.'],
  ['Moby Dick', 'Herman Melville', 'Adventure', 'Captain Ahab drives his whaling crew across the oceans in obsessive pursuit of the white whale that maimed him, with ruinous consequences.'],
  ['The Picture of Dorian Gray', 'Oscar Wilde', 'Philosophical fiction', 'A beautiful young man wishes his portrait would age in his place. He chases pleasure without consequence while the painting records every sin.'],
  ['Crime and Punishment', 'Fyodor Dostoevsky', 'Psychological', 'A poor student in St Petersburg commits a murder he believes is justified, then is tormented by guilt and a relentless investigator.'],
  ['The Art of War', 'Sun Tzu', 'Strategy', 'An ancient Chinese treatise on conflict that favours preparation, deception and timing, and holds that the best victory is won without fighting.'],
  ['Meditations', 'Marcus Aurelius', 'Philosophy', 'Private notes from a Roman emperor on discipline, duty and accepting what cannot be controlled, written as practical advice to himself.'],
  ['Nineteen Eighty-Four', 'George Orwell', 'Dystopian', 'In a state that watches everyone and rewrites the truth, Winston Smith risks a quiet rebellion that the Party is determined to crush.'],
  ['Dune', 'Frank Herbert', 'Science fiction', "On the desert planet Arrakis, source of the universe's most valuable substance, young Paul Atreides is pulled into a struggle over power, ecology and prophecy."],
  ['The Hobbit', 'J. R. R. Tolkien', 'Fantasy', "Bilbo Baggins, a comfortable homebody, is swept into a company of dwarves' quest to reclaim a mountain treasure from the dragon Smaug."],
  ['The Great Gatsby', 'F. Scott Fitzgerald', 'Classic', 'Narrator Nick Carraway watches his wealthy neighbour Jay Gatsby chase a lost love while the glittering world around him unravels.'],
];

export const SEED: BookDraft[] = S.map(([title, author, genre, summary]) => ({title, author, genre, summary}));
