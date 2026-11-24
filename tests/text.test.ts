import {describe, expect, it} from 'vitest';
import {cleanDescription, truncate} from '../api/_lib/text';

describe('cleanDescription', () => {
  it('accepts the {value} object form', () => {
    expect(cleanDescription({type: '/type/text', value: 'A tale.'})).toBe('A tale.');
  });
  it('drops separators, source tails and markdown links', () => {
    const raw = 'A [classic](http://x.y) novel.\r\n\r\n----------\r\nAlso contained in: stuff';
    expect(cleanDescription(raw)).toBe('A classic novel.');
    expect(cleanDescription('Great book. ([source][1])')).toBe('Great book.');
  });
  it('strips html and returns empty for missing input', () => {
    expect(cleanDescription('<p>Hello <b>there</b></p>')).toBe('Hello there');
    expect(cleanDescription(undefined)).toBe('');
  });
});

describe('truncate', () => {
  it('ends on a sentence when possible', () => {
    const s = 'one two three four five six. ' + 'word '.repeat(200);
    expect(truncate(s, 40)).toBe('one two three four five six.');
  });
  it('cuts at a word with an ellipsis otherwise, within the limit', () => {
    const out = truncate('word '.repeat(200), 50);
    expect(out.endsWith('…')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(51);
  });
});
