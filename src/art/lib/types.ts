export type SearchState = {
  q?: string;
  classification?: string[];
  century?: string[];
  sort?: 'relevance' | 'title' | 'date' | 'hasImage';
  page?: number;
  size?: number;
  hasImage?: boolean;
};

export type NormalArt = {
  id: string;
  title: string;
  maker?: string;
  dated?: string;
  classification?: string[];
  culture?: string[];
  rights?: 'PD' | 'CC' | 'Restricted' | 'Unknown';
  iiifService?: string;
  primaryImage?: string;
  renditions?: string[];
  providerUrl: string;
  jsonUrl: string;
  manifestUrl?: string;
  hasImage: boolean;
  facets: Record<string, Record<string, number>>;
};
