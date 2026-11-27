/**
 * Narrowing helpers for JSON that arrives from outside (an API reply, localStorage, a backup file).
 * The value is `unknown` until one of these has looked at it; nothing is cast.
 */
export const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
export const asRecord = (v: unknown): Record<string, unknown> => (isRecord(v) ? v : {});
/** The entries of `v` that are objects, or none when `v` is not a list. */
export const records = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter(isRecord) : []);
export const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
export const text = (v: unknown, max: number): string => (typeof v === 'string' ? v.slice(0, max) : '');
export const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
