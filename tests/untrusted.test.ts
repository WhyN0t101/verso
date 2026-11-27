import {describe, expect, it} from 'vitest';
import {asRecord, isInt, isRecord, records, strings, text} from '../shared/untrusted';
import {isLightId, isWoodId} from '../src/presets';
import {sanitizeSettings} from '../src/data/settings';

describe('untrusted JSON helpers', () => {
  it('tells objects from arrays, null and primitives', () => {
    expect(isRecord({})).toBe(true);
    for (const v of [[], null, 'x', 3, undefined]) expect(isRecord(v)).toBe(false);
    expect(asRecord([1])).toEqual({});
    expect(asRecord({a: 1})).toEqual({a: 1});
  });

  it('keeps only the well-typed entries of a list, and nothing from a non-list', () => {
    expect(records([{a: 1}, null, 2, [], {b: 2}])).toEqual([{a: 1}, {b: 2}]);
    expect(strings(['a', 1, null, 'b'])).toEqual(['a', 'b']);
    expect(strings('abc')).toEqual([]);
    expect(records({length: 1})).toEqual([]);
  });

  it('text caps the length and isInt rejects floats, strings and NaN', () => {
    expect(text('abcdef', 3)).toBe('abc');
    expect(text(5, 3)).toBe('');
    expect([isInt(3), isInt(3.5), isInt('3'), isInt(NaN), isInt(Infinity)]).toEqual([true, false, false, false, false]);
  });
});

describe('preset id guards', () => {
  it('accept only real ids, not inherited object keys', () => {
    expect([isWoodId('oak'), isWoodId('constructor'), isWoodId('toString'), isWoodId(7)]).toEqual([true, false, false, false]);
    expect([isLightId('warm'), isLightId('__proto__'), isLightId(null)]).toEqual([true, false, false]);
    expect(sanitizeSettings({wood: 'constructor', light: 'hasOwnProperty'})).toMatchObject({wood: 'honey', light: 'lamplit'});
  });
});
