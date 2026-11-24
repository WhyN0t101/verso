import {describe, expect, it} from 'vitest';
import {buildBackup, mergeBooks, parseBackup} from '../src/data/backup';
import {makeBook, sanitizeBook} from '../src/data/books';
import {DEFAULT_SETTINGS} from '../src/data/settings';

const book = (title: string) => makeBook({title, author: 'A', genre: 'Fantasy', summary: 's'});

describe('backup round trip', () => {
  it('restores books and settings exactly', () => {
    const books = [book('One'), book('Two')];
    books[0]!.notes = 'my notes';
    books[0]!.rating = 4;
    const settings = {...DEFAULT_SETTINGS, wood: 'oak' as const, light: 'evening' as const};
    const parsed = parseBackup(buildBackup(books, settings));
    expect(parsed.books).toHaveLength(2);
    expect(parsed.books[0]).toMatchObject({title: 'One', notes: 'my notes', rating: 4, id: books[0]!.id});
    expect(parsed.settings).toMatchObject({wood: 'oak', light: 'evening'});
  });

  it('rejects files that are not Verso backups', () => {
    expect(() => parseBackup('not json')).toThrow(/valid JSON/);
    expect(() => parseBackup('{"books":[]}')).toThrow(/not a Verso backup/);
    expect(() => parseBackup('{"app":"verso","version":99,"books":[]}')).toThrow(/newer version/);
  });

  it('drops unusable entries and counts them', () => {
    const text = JSON.stringify({app: 'verso', version: 1, books: [{title: 'Ok'}, {title: ''}, 5, null]});
    const p = parseBackup(text);
    expect(p.books.map((b) => b.title)).toEqual(['Ok']);
    expect(p.skipped).toBe(3);
    expect(p.settings).toBeNull();
  });
});

describe('sanitizeBook', () => {
  it('only keeps same-origin cover paths and clamps numbers', () => {
    const b = sanitizeBook({title: 'X', cover: 'https://evil.example/x.jpg', rating: 99, w: -5});
    expect(b?.cover).toBeUndefined();
    expect(b?.rating).toBe(5);
    expect(b?.w).toBe(0.2);
    expect(sanitizeBook({title: 'Y', cover: '/api/cover?id=1'})?.cover).toBe('/api/cover?id=1');
  });
});

describe('mergeBooks', () => {
  it('adds new ids, overwrites matching ones and bumps their version', () => {
    const a = book('A');
    a.v = 3;
    const aNew = {...a, notes: 'imported', v: 1};
    const c = book('C');
    const r = mergeBooks([a], [aNew, c]);
    expect(r).toMatchObject({added: 1, updated: 1});
    expect(r.books.find((b) => b.id === a.id)).toMatchObject({notes: 'imported', v: 4});
    expect(r.books).toHaveLength(2);
  });
});

describe('reading status', () => {
  it('is absent on books saved before the field existed', () => {
    expect(sanitizeBook({title: 'Old', rating: 3})).not.toHaveProperty('status');
  });
  it('keeps a valid status and drops anything else', () => {
    expect(sanitizeBook({title: 'A', status: 'reading'})?.status).toBe('reading');
    expect(sanitizeBook({title: 'B', status: 'abandoned'})).not.toHaveProperty('status');
    expect(sanitizeBook({title: 'C', status: 5})).not.toHaveProperty('status');
    expect(sanitizeBook({title: 'D', status: 'toString'})).not.toHaveProperty('status');
  });
  it('survives a backup round trip, and an old backup still imports', () => {
    const b = book('S');
    b.status = 'finished';
    expect(parseBackup(buildBackup([b], DEFAULT_SETTINGS)).books[0]?.status).toBe('finished');
    const old = JSON.stringify({app: 'verso', version: 1, books: [{title: 'Legacy', author: 'X', rating: 2}]});
    expect(parseBackup(old).books[0]).toMatchObject({title: 'Legacy', rating: 2});
  });
});
