import type { ItemCard } from './types';

type SampleMap = Record<ItemCard['source'], ItemCard[]>;

const SAMPLE_CARDS: SampleMap = {
  Harvard: [
    {
      id: 'harvard-sample-1',
      title: 'Impressionist Garden Study',
      sub: 'Oil on canvas • 1888',
      date: '1888',
      tags: ['Impressionism', 'Garden', 'Painting'],
      img: 'https://picsum.photos/seed/harvard-1/800/600',
      href: 'https://harvardartmuseums.org/collections',
      source: 'Harvard',
      raw: { sample: true },
    },
    {
      id: 'harvard-sample-2',
      title: 'Portrait of a Scholar',
      sub: 'Etching • 1632',
      date: '1632',
      tags: ['Portrait', 'Etching'],
      img: 'https://picsum.photos/seed/harvard-2/800/600',
      href: 'https://harvardartmuseums.org/collections',
      source: 'Harvard',
      raw: { sample: true },
    },
  ],
  Princeton: [
    {
      id: 'princeton-sample-1',
      title: 'Blue Horizon Lithograph',
      sub: 'Lithograph • 1954',
      date: '1954',
      tags: ['Lithograph', 'Abstract'],
      img: 'https://picsum.photos/seed/princeton-1/800/600',
      href: 'https://artmuseum.princeton.edu',
      source: 'Princeton',
      raw: { sample: true },
    },
    {
      id: 'princeton-sample-2',
      title: 'Ceramic Vessel with Motifs',
      sub: 'Clay • 900 CE',
      date: '900',
      tags: ['Ceramic', 'Vessel'],
      img: 'https://picsum.photos/seed/princeton-2/800/600',
      href: 'https://artmuseum.princeton.edu',
      source: 'Princeton',
      raw: { sample: true },
    },
  ],
  Dataverse: [
    {
      id: 'dataverse-sample-1',
      title: 'Global Art Exhibition Dataset',
      sub: 'Open research dataset',
      date: '2022',
      tags: ['Dataset', 'Exhibitions', 'Global'],
      href: 'https://dataverse.harvard.edu',
      source: 'Dataverse',
      raw: { sample: true },
    },
    {
      id: 'dataverse-sample-2',
      title: 'Museum Visitor Analytics 2010–2020',
      sub: 'Survey dataset',
      date: '2021',
      tags: ['Analytics', 'Museums'],
      href: 'https://dataverse.harvard.edu',
      source: 'Dataverse',
      raw: { sample: true },
    },
  ],
  UBC: [
    {
      id: 'ubc-sample-1',
      title: 'UBC Archive Newspaper Set',
      sub: 'Campus newspapers',
      date: '1912',
      tags: ['Newspaper', 'Campus'],
      img: 'https://picsum.photos/seed/ubc-1/800/600',
      href: 'https://open.library.ubc.ca',
      source: 'UBC',
      raw: { sample: true },
    },
    {
      id: 'ubc-sample-2',
      title: 'Pacific Northwest Photo Album',
      sub: 'Historical photographs',
      date: '1936',
      tags: ['Photography', 'Pacific Northwest'],
      img: 'https://picsum.photos/seed/ubc-2/800/600',
      href: 'https://open.library.ubc.ca',
      source: 'UBC',
      raw: { sample: true },
    },
  ],
  arXiv: [
    {
      id: 'arxiv-sample-1',
      title: 'Neural Style Transfer for Cultural Heritage',
      sub: 'Computer Vision',
      date: '2020',
      tags: ['cs.CV', 'Style Transfer'],
      href: 'https://arxiv.org',
      source: 'arXiv',
      raw: { sample: true },
    },
    {
      id: 'arxiv-sample-2',
      title: 'Generative Models for Museum Collections',
      sub: 'Machine Learning',
      date: '2021',
      tags: ['cs.LG', 'Generative'],
      href: 'https://arxiv.org',
      source: 'arXiv',
      raw: { sample: true },
    },
  ],
  Northwestern: [
    {
      id: 'northwestern-sample-1',
      title: 'Chicago Jazz Poster',
      sub: 'Performance archive',
      date: '1948',
      tags: ['Poster', 'Music'],
      img: 'https://picsum.photos/seed/northwestern-1/800/600',
      href: 'https://dc.library.northwestern.edu',
      source: 'Northwestern',
      raw: { sample: true },
    },
    {
      id: 'northwestern-sample-2',
      title: 'Studio Portrait Session',
      sub: 'Photography',
      date: '1923',
      tags: ['Portrait', 'Photography'],
      img: 'https://picsum.photos/seed/northwestern-2/800/600',
      href: 'https://dc.library.northwestern.edu',
      source: 'Northwestern',
      raw: { sample: true },
    },
  ],
  HathiCatalog: [
    {
      id: 'hathi-sample-1',
      title: 'History of Printmaking',
      sub: 'Digitized volume',
      date: '1899',
      tags: ['OCLC: 123456', 'Rights: PD'],
      href: 'https://catalog.hathitrust.org',
      source: 'HathiCatalog',
      raw: { sample: true },
    },
  ],
  Stanford: [
    {
      id: 'stanford-sample-1',
      title: 'Stanford Archive Poster',
      sub: 'Stanford University',
      date: '1964',
      tags: ['Poster'],
      img: 'https://picsum.photos/seed/stanford-1/800/600',
      href: 'https://purl.stanford.edu',
      source: 'Stanford',
      raw: { sample: true },
    },
  ],
  HTRC: [
    {
      id: 'htrc-sample-1',
      title: 'HTRC Volume Metadata',
      sub: 'HathiTrust Research Center',
      date: '1882',
      tags: ['English', 'Literature'],
      href: 'https://analytics.hathitrust.org',
      source: 'HTRC',
      raw: { sample: true },
    },
  ],
  LeipzigIIIF: [
    {
      id: 'leipzig-sample-1',
      title: 'Leipzig Manuscript Folio',
      sub: 'IIIF manifest preview',
      date: '1400',
      tags: ['IIIF', 'Manuscript'],
      img: 'https://picsum.photos/seed/leipzig-1/800/600',
      href: 'https://iiif.ub.uni-leipzig.de',
      source: 'LeipzigIIIF',
      raw: { sample: true },
    },
  ],
  BernIIIF: [
    {
      id: 'bern-sample-1',
      title: 'Bern Archive Map Sheet',
      sub: 'IIIF manifest preview',
      date: '1750',
      tags: ['IIIF', 'Map'],
      img: 'https://picsum.photos/seed/bern-1/800/600',
      href: 'https://iiif.ub.unibe.ch',
      source: 'BernIIIF',
      raw: { sample: true },
    },
  ],
};

export const getSampleCards = (source: ItemCard['source'], limit = 6): ItemCard[] => {
  const cards = SAMPLE_CARDS[source] ?? [];
  return cards.slice(0, Math.max(0, limit));
};

export const getExploreCards = (limit = 8): ItemCard[] => {
  const order: ItemCard['source'][] = ['Harvard', 'Princeton', 'UBC', 'Northwestern', 'Dataverse', 'arXiv', 'Stanford'];
  const results: ItemCard[] = [];
  for (const source of order) {
    const cards = SAMPLE_CARDS[source] ?? [];
    for (const card of cards) {
      results.push(card);
      if (results.length >= limit) {
        return results;
      }
    }
  }
  return results;
};
