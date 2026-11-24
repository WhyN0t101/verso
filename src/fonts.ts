import '@fontsource/literata/latin-400.css';
import '@fontsource/literata/latin-400-italic.css';
import '@fontsource/literata/latin-600.css';
import '@fontsource/literata/latin-700.css';
import '@fontsource/atkinson-hyperlegible-next/latin-500.css';

/** Every weight and style the canvases draw. Keep in step with SERIF and SANS use in textures, card and shelf. */
const CANVAS_FONTS = ['400 24px Literata', 'italic 400 24px Literata', '600 24px Literata', '700 24px Literata', '500 24px "Atkinson Hyperlegible Next"'];

/** Resolves once the canvas fonts are usable (or after 2.5s so a bad network cannot block the app). */
export const fontsReady: Promise<void> = Promise.race([
  Promise.all(CANVAS_FONTS.map((f) => document.fonts.load(f))).then(() => undefined),
  new Promise<void>((r) => setTimeout(r, 2500)),
]).catch((err) => console.warn('font preload failed, using fallbacks', err));
