import {describe, expect, it} from 'vitest';
import {paletteOf} from '../src/textures/draw';
import {buildBackup, mergeBooks, parseBackup} from '../src/data/backup';
import {applyStatus, finishedLabel, isoDate, makeBook, sanitizeBook, todayIso} from '../src/data/books';
import {DEFAULT_SETTINGS, sanitizeSettings} from '../src/data/settings';

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

describe('groupByGenre setting', () => {
  it('is off by default and survives only as a real true', () => {
    expect(sanitizeSettings(undefined)).not.toHaveProperty('groupByGenre');
    expect(sanitizeSettings({groupByGenre: 'yes'})).not.toHaveProperty('groupByGenre');
    expect(sanitizeSettings({groupByGenre: true}).groupByGenre).toBe(true);
  });
  it('round trips through a backup', () => {
    const parsed = parseBackup(buildBackup([book('G')], {...DEFAULT_SETTINGS, groupByGenre: true}));
    expect(parsed.settings?.groupByGenre).toBe(true);
  });
});

describe('stored tone', () => {
  it('round trips through a backup and drives the spine palette', () => {
    const b = book('Toned');
    b.tone = {h: 200, s: 50, l: 40};
    const back = parseBackup(buildBackup([b], DEFAULT_SETTINGS)).books[0]!;
    expect(back.tone).toEqual({h: 200, s: 50, l: 40});
    expect(paletteOf(back)).toEqual({h: 200, s: 50});
  });
  it('is optional: an older backup imports and falls back to the title hue', () => {
    const old = JSON.stringify({app: 'verso', version: 1, books: [{title: 'Old', cover: '/api/cover?id=5', hue: 77}]});
    const b = parseBackup(old).books[0]!;
    expect(b.tone).toBeUndefined();
    expect(paletteOf(b).h).toBe(77);
  });
});

describe('finishedOn', () => {
  const day = new Date(2026, 3, 9); // 9 April 2026, local time

  it('formats a valid day and rejects anything else', () => {
    expect(finishedLabel('2026-04-09')).toBe('Finished April 2026');
    expect(finishedLabel('2026-02-30')).toBe('');
    expect(finishedLabel('April')).toBe('');
    expect(finishedLabel(undefined)).toBe('');
    expect(isoDate('2024-02-29')).toBe('2024-02-29');
    expect(isoDate('2026-13-01')).toBeNull();
    expect(todayIso(day)).toBe('2026-04-09');
  });

  it('is stamped when a book becomes finished, kept on a repeat, and dropped when it leaves finished', () => {
    const b = book('F');
    applyStatus(b, 'finished', '2026-04-09');
    expect(b).toMatchObject({status: 'finished', finishedOn: '2026-04-09'});
    b.finishedOn = '2026-01-15'; // edited by hand
    applyStatus(b, 'finished', '2026-05-01');
    expect(b.finishedOn).toBe('2026-01-15');
    applyStatus(b, 'reading');
    expect(b).not.toHaveProperty('finishedOn');
    applyStatus(b, undefined);
    expect(b).not.toHaveProperty('status');
  });

  it('round trips through a backup, and old data without it still imports', () => {
    const b = book('G');
    applyStatus(b, 'finished', '2026-04-09');
    expect(parseBackup(buildBackup([b], DEFAULT_SETTINGS)).books[0]).toMatchObject({status: 'finished', finishedOn: '2026-04-09'});
    const old = JSON.stringify({app: 'verso', version: 1, books: [{title: 'Old finished', status: 'finished'}, {title: 'Old plain'}]});
    const [a, c] = parseBackup(old).books;
    expect(a).toMatchObject({title: 'Old finished', status: 'finished'});
    expect(a).not.toHaveProperty('finishedOn');
    expect(c).not.toHaveProperty('finishedOn');
  });

  it('ignores a bad date and a date on a book that is not finished', () => {
    expect(sanitizeBook({title: 'X', status: 'finished', finishedOn: 'yesterday'})).not.toHaveProperty('finishedOn');
    expect(sanitizeBook({title: 'Y', status: 'reading', finishedOn: '2026-04-09'})).not.toHaveProperty('finishedOn');
    expect(sanitizeBook({title: 'Z', finishedOn: '2026-04-09'})).not.toHaveProperty('finishedOn');
  });
});
