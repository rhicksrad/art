import arxiv from '../assets/emblem-arxiv.webp';
import bern from '../assets/emblem-bern.webp';
import dataverse from '../assets/emblem-dataverse.webp';
import empty from '../assets/emblem-empty.webp';
import error from '../assets/emblem-error.webp';
import harvard from '../assets/emblem-harvard.webp';
import hathi from '../assets/emblem-hathi.webp';
import htrc from '../assets/emblem-htrc.webp';
import northwestern from '../assets/emblem-northwestern.webp';
import princeton from '../assets/emblem-princeton.webp';
import stanford from '../assets/emblem-stanford.webp';
import ubc from '../assets/emblem-ubc.webp';
import { h } from './dom';
import type { SourceKey } from './types';

/**
 * Engraved emblems, generated as artwork for this site (see DESIGN.md). They are ink on a
 * transparent ground, so the dark theme inverts them. They decorate the interface and are
 * never shown as collection items.
 */
const SOURCE_EMBLEMS: Record<SourceKey, string> = {
  Harvard: harvard,
  Princeton: princeton,
  Northwestern: northwestern,
  UBC: ubc,
  Stanford: stanford,
  HathiCatalog: hathi,
  BernIIIF: bern,
  arXiv: arxiv,
  Dataverse: dataverse,
  HTRC: htrc,
};

const STATE_EMBLEMS = { empty, error };

const image = (src: string, size: number): HTMLImageElement =>
  h('img', {
    class: 'emblem',
    src,
    alt: '',
    width: String(size),
    height: String(size),
    decoding: 'async',
  });

export const sourceEmblem = (key: SourceKey, size: number): HTMLImageElement =>
  image(SOURCE_EMBLEMS[key], size);

export const stateEmblem = (state: keyof typeof STATE_EMBLEMS, size: number): HTMLImageElement =>
  image(STATE_EMBLEMS[state], size);

/** An empty frame with a line of explanation, for result areas with nothing to show. */
export const emptyState = (message: string): HTMLElement =>
  h('div', { class: 'empty' }, stateEmblem('empty', 132), h('p', null, message));
