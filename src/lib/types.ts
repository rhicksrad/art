export type SourceKey =
  | 'Harvard'
  | 'Princeton'
  | 'UBC'
  | 'Dataverse'
  | 'arXiv'
  | 'Northwestern'
  | 'Stanford'
  | 'HathiCatalog'
  | 'HTRC'
  | 'LeipzigIIIF'
  | 'BernIIIF';

export type ColorSwatch = {
  hex: string;
  percent: number;
  hue?: string;
};

export type ItemField = {
  label: string;
  value: string;
};

export type ItemLink = {
  label: string;
  href: string;
};

/**
 * The normalised record every adapter produces. The first block is the
 * original contract; the optional second block feeds the detail view and charts.
 */
export type ItemCard = {
  id: string;
  title: string;
  sub?: string;
  date?: string;
  tags?: string[];
  img?: string;
  href?: string;
  source: SourceKey;
  raw: unknown;

  /** Best-effort numeric year (negative = BCE) used for timelines. */
  year?: number;
  /** Short type label, e.g. "Photograph", "Dataset", "Preprint". */
  kind?: string;
  /** Individual makers/authors, for the “who” facet. */
  people?: string[];
  description?: string;
  /** Larger rendition for the detail view. */
  imgLarge?: string;
  /** Width ÷ height of the image when the API reports it; avoids layout shift. */
  aspect?: number;
  /** Additional page/canvas thumbnails. */
  images?: string[];
  manifest?: string;
  colors?: ColorSwatch[];
  fields?: ItemField[];
  links?: ItemLink[];
};
