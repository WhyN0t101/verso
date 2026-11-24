import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/playfair-display/latin-600.css';
import '@fontsource/playfair-display/latin-700.css';
import '@fontsource/playfair-display/latin-400-italic.css';

/** Resolves once the canvas fonts are usable (or after 2.5s so a bad network cannot block the app). */
export const fontsReady: Promise<void> = Promise.race([
  Promise.all([
    document.fonts.load('700 40px "Playfair Display"'),
    document.fonts.load('italic 400 40px "Playfair Display"'),
    document.fonts.load('400 24px Inter'),
    document.fonts.load('500 24px Inter'),
    document.fonts.load('600 24px Inter'),
  ]).then(() => undefined),
  new Promise<void>((r) => setTimeout(r, 2500)),
]).catch((err) => console.warn('font preload failed, using fallbacks', err));
