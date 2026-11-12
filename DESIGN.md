# Design direction

The site is a gallery. The works supply the colour and the interface behaves like museum signage and object labels. Every choice below comes from that, so check new UI against it before reaching for a default.

## Rules

- **Walls are neutral.** White in the light theme, charcoal in the dark one. No tinted, cream or gradient backgrounds. The only colour on a page comes from the works and from one accent.
- **One accent.** Ultramarine by default. On the home page it is replaced each day by a colour taken from the featured painting's palette, which the Harvard API returns. The accent is used for actions and for every chart mark. Status colours (ok, failed) are reserved for status.
- **Type is signage and labels.** Archivo across its width axis: narrow and heavy for titles, normal width for interface text. Literata is for catalogue prose only (descriptions, abstracts, the introduction). No other families.
- **Works are never boxed.** An image hangs on the wall at its own proportions with square corners and a small cast shadow. Its details sit underneath as an object label: maker in bold, title in italics, date, then where it is held, one fact per line.
- **Structure comes from rules, not cards.** Sections are separated by a 1px ink rule. Lists of records are rows with dividers. Tabular content (the source directory, the status page) is a table.
- **Only works hang.** In a gallery of results, records with an image go on the wall. Papers, datasets and anything else without one are set as catalogue rows in their own list underneath, never mixed in among the works.
- **One record gets the whole page.** When a lookup resolves to a single record (a Stanford PURL, an IIIF manifest, an HTRC volume) the full record is set on the page with its pages and fields, not shown as one small card.
- **A place on the wall is never empty.** An image that is still loading shows a blank mount at the work's proportions. Scrolling panels use a hairline scrollbar in label ink.
- **Results come before charts on a phone.** Narrow screens show the works first and open the charts from a button.
- **Corners are square.** Controls get 2px. Nothing is a pill.
- **Motion only answers the user.** No entrance animation, no hover lift or scale on images, no shimmer.
- **Generated art never poses as a museum work.** It is used for backdrops, textures, emblems and empty or error states.

## Things this design deliberately avoids

Uppercase tracked kicker labels above headings, "A · B · C" meta strings, big-number stat strips, arrows on links, glass or blur, shadows paired with hairline borders, one-sided accent stripes, and em-dashes in interface copy. Monospace is used only for real code, routes and API output.

## Copy

Say what the thing is or does. Name the action on a button. Do not print a number that does not come from an API response.

## Generated art

`src/assets/` holds artwork generated for this site with the Codex CLI image tool, then cropped and optimised:

- `room-wall-*` and `room-floor-*`: a photographed empty gallery, split at the floor line so the landing view can stretch the wall and keep the floor a fixed height. The dark pair has a spotlight that sits behind the featured painting.
- `emblem-*`: copperplate-style engravings, one per source plus an empty frame (nothing to show) and a crooked frame (a request failed). They are black ink with a transparent ground; the dark theme inverts them. `src/lib/emblems.ts` maps them to sources.

The full-size originals are on the `art-assets` branch under `assets-src/`. To add one, generate it in the same engraving style on a white ground, convert ink to alpha at 360px, and add it to the map.
