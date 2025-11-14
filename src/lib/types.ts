export type ItemCard = {
  id: string;
  title: string;
  sub?: string;
  date?: string;
  tags?: string[];
  img?: string;
  href?: string;
  source:
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
  raw: unknown;
};
