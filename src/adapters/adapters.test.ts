import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildSearchQuery, toItemCards as arxivCards, totalResults } from './arxiv';
import { toItemCards as dataverseCards, totalCount } from './dataverse';
import { toItemCards as harvardCards, totalRecords } from './harvard';
import { detectHathiIdentifier, toItemCards as hathiCards } from './hathi';
import { looksLikeHtid, toItemCard as htrcCard } from './htrc';
import { iiifResourceToCards } from './iiif';
import { toItemCards as northwesternCards, totalHits as northwesternTotal } from './northwestern';
import {
  makerNames,
  toItemCards as princetonCards,
  totalHits as princetonTotal,
} from './princeton';
import { manifestImageServices, normalizePurlId, toItemCard as stanfordCard } from './stanford';
import { extractTotal as ubcTotal, toItemCards as ubcCards } from './ubc';
import type { ItemCard, SourceKey } from '../lib/types';

const fixture = (name: string): string =>
  readFileSync(resolve(process.cwd(), 'src/adapters/__fixtures__', name), 'utf-8');
const json = (name: string): unknown => JSON.parse(fixture(name));

const expectCard = (card: ItemCard, source: SourceKey): void => {
  expect(card.id.length).toBeGreaterThan(0);
  expect(card.title.length).toBeGreaterThan(0);
  expect(card.source).toBe(source);
  expect(card).toHaveProperty('raw');
};

/** Every adapter must survive junk input: the Worker returns diagnostics JSON on failure. */
const JUNK: unknown[] = [
  null,
  undefined,
  {},
  [],
  'oops',
  { error: 'Upstream fetch failed' },
  { upstream: 'x', status: 502, sample: '' },
];

describe('Harvard', () => {
  const cards = harvardCards(json('harvard.json'));

  it('maps a full record', () => {
    const [card] = cards;
    expectCard(card, 'Harvard');
    expect(card.title).toBe('Untitled (Berkeley + Monet)');
    expect(card.sub).toBe('Bill Dane');
    expect(card.people).toEqual(['Bill Dane']);
    expect(card.year).toBe(1979);
    expect(card.kind).toBe('Photographs');
    expect(card.img).toBe(
      'https://nrs.harvard.edu/urn-3:HUAM:INV213409_dynmc?height=480&width=480',
    );
    expect(card.imgLarge).toContain('height=1400');
    expect(card.colors).toHaveLength(2);
    expect(card.manifest).toBe('https://iiif.harvardartmuseums.org/manifests/object/331916');
    expect(card.fields?.find((f) => f.label === 'Maker')?.value).toBe('Bill Dane (Artist)');
  });

  it('ignores a placeholder datebegin that disagrees with the century', () => {
    expect(cards[1].year).toBe(1850);
  });

  it('reads the total and tolerates sparse or junk payloads', () => {
    expect(totalRecords(json('harvard.json'))).toBe(86);
    expect(harvardCards({ records: [{ id: 1 }] })[0].title).toBe('Untitled');
    for (const junk of JUNK) expect(harvardCards(junk)).toEqual([]);
  });
});

describe('Princeton', () => {
  it('maps hits, shortening the packed maker string', () => {
    const [card, second] = princetonCards(json('princeton.json'));
    expectCard(card, 'Princeton');
    expect(card.title).toBe('Haystack #4');
    expect(card.sub).toBe('Roy Lichtenstein, Printed by Kenneth Tyler');
    expect(card.year).toBe(1969);
    expect(card.kind).toBe('Color lithograph');
    expect(card.img).toBe(
      'https://media.artmuseum.princeton.edu/iiif/3/collection/x1974-2/full/!480,480/0/default.jpg',
    );
    expect(card.href).toBe('https://artmuseum.princeton.edu/collections/objects/12714');
    expect(second.year).toBeUndefined();
    expect(princetonTotal(json('princeton.json'))).toBe(14);
    expect(princetonTotal({ hits: { total: { value: 9 } } })).toBe(9);
  });

  it('splits makers and tolerates junk', () => {
    expect(makerNames('A. Painter, 1800–1850; born X | B. Printer, active 1820')).toEqual([
      'A. Painter',
      'B. Printer',
    ]);
    expect(princetonCards({ hits: { hits: [{ _source: { objectid: 42 } }] } })[0].title).toBe(
      'Untitled',
    );
    for (const junk of JUNK) expect(princetonCards(junk)).toEqual([]);
  });
});

describe('Northwestern', () => {
  it('reads labels from controlled-vocabulary objects rather than their ids', () => {
    const [card] = northwesternCards(json('northwestern.json'));
    expectCard(card, 'Northwestern');
    expect(card.tags).toEqual(['slides (photographs)', 'Ghana', 'Africa']);
    expect(card.sub).toBe('Slides of Africa from the University of Wisconsin--Madison');
    expect(card.year).toBe(1966);
    expect(card.img).toBe(
      'https://iiif.dc.library.northwestern.edu/iiif/3/19e0cc94-412b-4390-bf1b-82e4e9676750/full/!480,480/0/default.jpg',
    );
    expect(card.manifest).toContain('?as=iiif');
    expect(northwesternTotal(json('northwestern.json'))).toBe(3805);
    for (const junk of JUNK) expect(northwesternCards(junk)).toEqual([]);
  });
});

describe('Dataverse', () => {
  it('maps datasets and strips HTML from descriptions', () => {
    const [card] = dataverseCards(json('dataverse.json'));
    expectCard(card, 'Dataverse');
    expect(card.sub).toBe('Doe, Jane; Roe, Richard');
    expect(card.date).toBe('2021-03-14');
    expect(card.year).toBe(2021);
    expect(card.kind).toBe('Dataset');
    expect(card.description).not.toContain('<b>');
    expect(totalCount(json('dataverse.json'))).toBe(1289);
    expect(dataverseCards({ data: { items: [{ global_id: 'doi:10.1/abc' }] } })[0].title).toBe(
      'Untitled',
    );
    for (const junk of JUNK) expect(dataverseCards(junk)).toEqual([]);
  });
});

describe('arXiv', () => {
  it('parses the Atom feed', () => {
    const [card] = arxivCards(fixture('arxiv.xml'));
    expectCard(card, 'arXiv');
    expect(card.id).toBe('2603.11147v4');
    expect(card.title).toBe(
      'Catalogue-Grounded Multimodal Attribution for Museum Video under Resource and Regulatory Constraints',
    );
    expect(card.people).toEqual(['Minsak Nanang', 'Adrian Hilton', 'Armin Mustafa']);
    expect(card.kind).toBe('cs.MM');
    expect(card.tags).toEqual(['cs.MM', 'cs.CV', 'cs.LG']);
    expect(card.year).toBe(2026);
    expect(card.links).toEqual([{ label: 'PDF', href: 'https://arxiv.org/pdf/2603.11147v4' }]);
    expect(totalResults(fixture('arxiv.xml'))).toBe(462);
    expect(arxivCards('<feed xmlns="http://www.w3.org/2005/Atom"></feed>')).toEqual([]);
  });

  it('builds queries', () => {
    expect(buildSearchQuery('cultural heritage')).toBe('all:cultural AND all:heritage');
    expect(buildSearchQuery('cat:cs.CV')).toBe('cat:cs.CV');
    expect(buildSearchQuery('"style transfer"')).toBe('all:"style transfer"');
  });
});

describe('HathiTrust', () => {
  it('maps one card per digitised copy', () => {
    const cards = hathiCards(json('hathi.json'));
    expect(cards).toHaveLength(2);
    expectCard(cards[0], 'HathiCatalog');
    expect(cards[0].id).toBe('mdp.39015025315527');
    expect(cards[0].title).toBe('Infinite series');
    expect(cards[0].year).toBe(1962);
    expect(JSON.stringify(cards[0].raw)).not.toContain('<record/>');
    for (const junk of JUNK) expect(hathiCards(junk)).toEqual([]);
  });

  it('recognises identifiers but not keywords', () => {
    expect(detectHathiIdentifier('oclc:424023')).toEqual({ type: 'oclc', id: '424023' });
    expect(detectHathiIdentifier('978-0-03-011040-5')).toEqual({
      type: 'isbn',
      id: '9780030110405',
    });
    expect(detectHathiIdentifier('mdp.39015025315527')).toEqual({
      type: 'htid',
      id: 'mdp.39015025315527',
    });
    for (const keyword of ['monet', 'cultural heritage', '1888', 'cat:cs.CV', 'St. Louis']) {
      expect(detectHathiIdentifier(keyword)).toBeNull();
    }
  });
});

describe('Stanford', () => {
  it('combines the Cocina record with manifest images', () => {
    const card = stanfordCard(
      'bb112zx3193',
      json('stanford-cocina.json'),
      json('stanford-manifest.json'),
    );
    expectCard(card, 'Stanford');
    expect(card.title).toBe('Bugatti Type 51A. Road & Track Salon January 1957');
    expect(card.sub).toBe('Chesebrough, Jerry (photographer)');
    expect(card.date).toBe('1957 – 1961');
    expect(card.year).toBe(1957);
    expect(card.tags).toEqual([
      'Photographic prints',
      'Automobiles',
      'Bugatti automobile – History',
    ]);
    expect(card.images).toHaveLength(2);
    expect(card.img).toBe(
      'https://stacks.stanford.edu/image/iiif/bb112zx3193%2Fbb112zx3193_00_0001/full/!480,480/0/default.jpg',
    );
  });

  it('works without a manifest and validates druids', () => {
    expect(stanfordCard('bb112zx3193', json('stanford-cocina.json')).img).toBeUndefined();
    expect(manifestImageServices(null)).toEqual([]);
    expect(normalizePurlId('https://purl.stanford.edu/BB112ZX3193')).toBe('bb112zx3193');
    expect(normalizePurlId('druid:bb112zx3193')).toBe('bb112zx3193');
    expect(normalizePurlId('impressionism')).toBeNull();
  });
});

describe('UBC', () => {
  it('finds hits inside the nested envelope', () => {
    const [card] = ubcCards(json('ubc.json'));
    expectCard(card, 'UBC');
    expect(card.title).toBe('The University of British Columbia Calendar 1925-26');
    expect(card.year).toBe(1925);
    expect(ubcTotal(json('ubc.json'))).toBe(37);
    for (const junk of JUNK) expect(ubcCards(junk)).toEqual([]);
  });
});

describe('IIIF and HTRC', () => {
  it('lists manifests in a collection and reads language-map labels', () => {
    const cards = iiifResourceToCards(json('iiif-collection.json'), 'LeipzigIIIF');
    expect(cards).toHaveLength(1);
    expectCard(cards[0], 'LeipzigIIIF');
    expect(cards[0].title).toBe('Handschrift 1');
    expect(
      iiifResourceToCards({ id: 'https://example.org/m', type: 'Manifest' }, 'BernIIIF')[0].title,
    ).toBe('Untitled manifest');
    for (const junk of JUNK) expect(iiifResourceToCards(junk, 'BernIIIF')).toEqual([]);
  });

  it('reads the pages and catalogue details of a manifest', () => {
    const [card] = iiifResourceToCards(
      {
        '@id': 'https://example.org/book/manifest',
        '@type': 'sc:Manifest',
        label: 'A rare book',
        attribution: 'Example <b>Library</b>',
        metadata: [
          { label: 'Titel', value: 'A rare book' },
          { label: 'Impressum', value: '<span>London, 1866</span>' },
        ],
        sequences: [
          {
            canvases: [1, 2, 3].map((n) => ({
              images: [{ resource: { service: { '@id': `https://example.org/i3f/${n}/` } } }],
            })),
          },
        ],
      },
      'BernIIIF',
    );
    expectCard(card, 'BernIIIF');
    expect(card.img).toBe('https://example.org/i3f/1/full/!400,400/0/default.jpg');
    expect(card.imgLarge).toBe('https://example.org/i3f/1/full/!1400,1400/0/default.jpg');
    expect(card.images).toHaveLength(3);
    // The title is not repeated as a field, and markup is stripped from values.
    expect(card.fields).toEqual([
      { label: 'Impressum', value: 'London, 1866' },
      { label: 'Pages', value: '3' },
      { label: 'Attribution', value: 'Example Library' },
    ]);
  });

  it('maps HTRC metadata and validates volume ids', () => {
    expectCard(htrcCard('mdp.1', { metadata: { title: 'A title', pubDate: '1901' } }), 'HTRC');
    const v3 = htrcCard('mdp.2', {
      code: 200,
      data: {
        htid: 'mdp.2',
        metadata: {
          title: 'Infinite series',
          pubDate: 1908,
          contributor: { type: 'Person', name: 'Bromwich, Thomas' },
          publisher: { name: 'Macmillan' },
          genre: ['http://id.loc.gov/vocabulary/marcgt/doc'],
        },
      },
    });
    expect(v3.title).toBe('Infinite series');
    expect(v3.sub).toBe('Bromwich, Thomas');
    expect(v3.year).toBe(1908);
    expect(v3.tags).toBeUndefined();
    expect(v3.fields?.find((field) => field.label === 'Publisher')?.value).toBe('Macmillan');
    expect(looksLikeHtid('mdp.39015025315527')).toBe(true);
    expect(looksLikeHtid('monet')).toBe(false);
  });
});
