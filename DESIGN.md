# Design direction

The site is a gallery. The works supply the colour and the interface behaves like museum signage and object labels. Every choice below comes from that, so check new UI against it before reaching for a default.

## Rules

- **Walls are neutral.** White in the light theme, charcoal in the dark one. No tinted, cream or gradient backgrounds. The only colour on a page comes from the works and from one accent.
- **One accent.** Ultramarine by default. On the home page it is replaced each day by a colour taken from the featured painting's palette, which the Harvard API returns. The accent is used for actions and for every chart mark. Status colours (ok, failed) are reserved for status.
- **Type is signage and labels.** Archivo across its width axis: narrow and heavy for titles, normal width for interface text. Literata is for catalogue prose only (descriptions, abstracts, the introduction). No other families.
- **Works are never boxed.** An image hangs on the wall at its own proportions with square corners and a small cast shadow. Its details sit underneath as an object label: maker in bold, title in italics, date, then where it is held, one fact per line.
- **Structure comes from rules, not cards.** Sections are separated by a 1px ink rule. Lists of records are rows with dividers. Tabular content (the source directory, the status page) is a table.
- **Corners are square.** Controls get 2px. Nothing is a pill.
- **Motion only answers the user.** No entrance animation, no hover lift or scale on images, no shimmer.
- **Generated art never poses as a museum work.** It is used for backdrops, textures, emblems and empty or error states.

## Things this design deliberately avoids

Uppercase tracked kicker labels above headings, "A · B · C" meta strings, big-number stat strips, arrows on links, glass or blur, shadows paired with hairline borders, one-sided accent stripes, and em-dashes in interface copy. Monospace is used only for real code, routes and API output.

## Copy

Say what the thing is or does. Name the action on a button. Do not print a number that does not come from an API response.
