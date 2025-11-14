export type ItemCard = {
  id: string;
  title: string;
  sub?: string;
  date?: string;
  tags?: string[];
  img?: string;
  href?: string;
  source: 'Harvard' | 'Princeton' | 'UBC' | 'Dataverse' | 'arXiv';
  raw: unknown;
};
