import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

/** The canvas silently falls back to an upright system font when a face was never loaded. */
describe('canvas fonts are loaded before drawing', () => {
  const fonts = read('src/fonts.ts');
  const drawn = [...(read('src/export/card.ts') + read('src/textures/draw.ts') + read('src/scene/shelf.ts')).matchAll(/g\.font = `((?:italic )?\d+) [^`]*?\$\{(SERIF|SANS)\}`/g)];

  it('finds the font strings the canvases use', () => expect(drawn.length).toBeGreaterThan(8));

  it('loads every weight and style that is drawn', () => {
    for (const [, spec, face] of drawn) {
      const italic = spec!.startsWith('italic');
      const weight = spec!.replace('italic ', '');
      const family = face === 'SERIF' ? 'Literata' : '"Atkinson Hyperlegible Next"';
      expect(fonts, `${spec} ${face}`).toContain(`'${italic ? 'italic ' : ''}${weight} 24px ${family}'`);
    }
  });

  it('imports the italic stylesheet the quote needs', () => expect(fonts).toContain('@fontsource/literata/latin-400-italic.css'));
});
