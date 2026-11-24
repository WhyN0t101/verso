# Verso design plan

Status: proposal, not built. Review notes at the end say what changed from the first draft and why.

## Brief in one line

A reader browses their own books on a lit shelf, adds notes, shares a card. The lit shelf and the pulled-out book are the one bold thing. Everything else is quiet.

## Colour

The room is a cool study at night with one warm lamp. The wall is blue-green, so the lamplit wood is the only warm, bright mass on screen and carries the eye.

| Name | Hex | Role |
| --- | --- | --- |
| Study wall | `#18272B` | Page background behind the shelf, header and panels (panels step up to Panel). |
| Panel | `#223439` | Detail panel, dialogs, select bar. One step lighter than the wall. |
| Honey oak | `#B9824A` | Default wood of the shelf (replaces near-black walnut as the default). |
| Lamplight | `#F2B650` | Focus ring, primary button, selected state, current section. Used for nothing else. |
| Paper | `#EEE7D6` | Text on dark. Never a background. |
| Mist | `#A7B6B2` | Secondary text and borders at low opacity. Contrast on Study wall: about 7:1 (to be measured at build time). |

Status chips borrow from the scene instead of adding hues: Wishlist is dusk blue `#8FB0D9`, Reading is Lamplight, Finished is moss `#8DBE8A`. Each is a small filled dot plus text, never colour alone.

Contrast checks to run at build time: Paper on Study wall (about 12:1), Mist on Study wall, dark text on Lamplight buttons, spine title on every spine colour.

## Type

Two faces, bundled with `@fontsource` so the canvas can wait for them as it does now.

- **Literata** (serif, made for long reading on screens). Role: everything a person wrote or a book owns: book titles on spines and covers, panel title, summary, notes, section signage, share card title and quote.
- **Atkinson Hyperlegible Next** (sans, built for small, hard-to-read sizes). Role: interface and anything small: header, chips, buttons, form labels, dates, counts, spine author line.

Scale (base 16 px, ratio about 1.25, weights chosen per role):

| Step | Size | Face and weight | Used for |
| --- | --- | --- | --- |
| Meta | 13 | Atkinson 500 | counts, dates, hints |
| UI | 15 | Atkinson 500 | buttons, chips, inputs, menu |
| Body | 17 / 1.6 | Literata 400 | summary, notes (line length under 68 characters) |
| Section | 22 | Literata 600 | signage, panel headings |
| Title | 30 / 1.15 | Literata 700 | panel title |
| Card | 64 and up | Literata 700 | share card title |

Rules: sentence case everywhere, including "Finished April 2026". No all-caps labels, no letter-spaced eyebrows, no middle-dot meta strings, no decorative rules or dividers. Structure comes from spacing and the signage itself.

## Layout idea

One surface: the shelf. A wall of 3D bookcases fills the screen. The interface is a thin header, a section index, and a detail panel. Signage lives in the scene, on a wooden fascia across the top of each bookcase, in Literata 22 on a warm brass-toned plate lit by the same lamp.

Sections flow along shared shelves instead of one case each. Books run in genre order through the rows. A genre starts with a slim wooden bookend. The fascia of a case names the sections that start in it ("Fantasy and Gothic"). Genres with fewer than 3 books merge into "Other". Grouping stays off by default.

Rows: each bookcase shows only the rows it needs plus one empty row (a full case shows 4). The camera fits the current case to the viewport height, so the shelf fills the screen. On wide screens neighbouring cases show at the edges as context.

Section index: a left rail on desktop, a bottom sheet on phones. It lists sections with counts, names the current one, and jumps on click. It replaces the dots. Without grouping it lists bookcases by number.

Hint: a small pill near the bottom of the screen ("Drag to browse, tap a book to open it"). It fades after the first pointer, key or scroll interaction and never comes back.

Alignment: interface text is left aligned. The share card keeps centred title and quote for Post and Story, left aligned for Square (as now).

### Desktop, 1280 x 800

```
+--------------------------------------------------------------------------+
| Verso   [ Search books              ]  All 12  Wishlist 3  Reading 2     |
|                                        Finished 5        Select  Add  ... |
+--------+-----------------------------------------------------------------+
| Fantasy|   +--- Fantasy and Gothic ----------+  +--- Mystery ---------+  |
|  18    |   | |||||||||| ||||||||| |||||||||  |  | ||||||||| |||||||| |  |
| Gothic |   +----------------------------------+  +---------------------+  |
|  7     |   | ||||||||| |||||||| |||||||||||| |  | ||||||| ||||||||||| |  |
| Mystery|   +----------------------------------+  +---------------------+  |
|  14    |   | |||||||||| |||||||||| ||||||||   |  | |||||||||| |||||||  |  |
| Other  |   +----------------------------------+  +---------------------+  |
|  6     |   | (one empty row)                  |  |                     |  |
|        |   +----------------------------------+  +---------------------+  |
|        |            ( Drag to browse, tap a book to open it )              |
+--------+-----------------------------------------------------------------+
Detail panel opens from the right, below the header; the shelf re-frames to the space left.
```

### Phone, 390 x 780

```
+----------------------------+
| Verso  [Search     ] Add ...|
| All 12 Wishlist 3 Reading 2 > (chips scroll sideways)
+----------------------------+
|  +-- Fantasy and Gothic --+|
|  | |||||||| ||||||| ||||| ||| (one case fills the width,
|  | |||||||| ||||||| ||||| ||| neighbours peek at the edges)
|  | |||||||| ||||||| ||||| ||
|  | (empty row)            ||
|  +------------------------+|
|  ( Drag to browse ... )    |
+----------------------------+
| Fantasy, 18 books        ^ |  <- section index; opens a sheet with all sections
+----------------------------+
Selecting a book: the bottom sheet covers the lower half, as today.
```

## Principles

1. One bold thing. The lit shelf and the pulled-out book get the light, the colour and the motion. Everything else is flat, quiet and left aligned.
2. Light explains state. The lamp is the accent: Lamplight marks focus, selection and the current section, and nothing decorative uses it.
3. Structure from signage, not chrome. Sections are named by objects in the room, not by labels, rules or cards above content.
4. Nothing is tiny. Spine text, counts and signage are sized for reading, and the typefaces were chosen for that.
5. Motion answers a person. Pulling out, panning, confirming. Reduced motion turns panning and fades into jumps. Nothing animates on its own except the lamp glow, which is static under reduced motion.
6. Native controls are restyled once: dark colour scheme, one focus ring, one height, one radius for controls and a different one for panels.

## Review against the brief

What the first draft got wrong and what changed:

- **Walnut brown wall with amber accent.** That is the stock "cosy library" look and made the wood and wall one mud. Changed to a cool blue-green wall so the honey wood and lamp are the only warm things.
- **Cream background, Playfair Display headings.** Cream with a high-contrast serif is the common default. Cream is now text only. Playfair is replaced by Literata, which suits book titles and long notes better.
- **Inter for the interface.** Default sans. Replaced by Atkinson Hyperlegible Next because the brief asks for legibility at small sizes.
- **Identical rounded cards for sections and bookcases.** Dropped. Sections are signage on the wood; panels and controls use different radii by role.
- **Dots and tiny labels.** Replaced by a named section index with counts, plus lit signage in the scene.
- **Eyebrow labels and divider lines on the share card.** Removed, including the short rule under the author. The finished line is sentence case.

Where this could still read as a default, and the mitigation: a dark UI with an amber accent is common. It is justified here because the amber is the lamp in the scene and is used only for state, and the wall is blue-green, not black.

## Build order after approval

1. Layout: flowing sections with Other merge, signage band and section index, hint pill, row trimming and camera framing.
2. Visual: wood, light, spine legibility and separation; header chips with counts; native control styling and dark colour scheme; type scale, fonts and share card line.

Dependencies to add: `@fontsource/literata` and `@fontsource/atkinson-hyperlegible-next`. Remove `@fontsource/playfair-display` and `@fontsource/inter` once nothing uses them.
