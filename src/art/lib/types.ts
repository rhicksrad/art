export type DVSearchState = {
  q?: string;
  type?: Array<'dataset' | 'file' | 'dataverse'>;
  subject?: string[];
  dataverse?: string[];
  fileType?: string[];
  yearStart?: number;
  yearEnd?: number;
  sort?: 'name' | 'date' | 'citation' | 'relevance';
  order?: 'asc' | 'desc';
  page?: number;
  size?: number;
};

export type NormalRecord = {
  id: string;
  kind: 'dataset' | 'file' | 'dataverse';
  title: string;
  authors?: string[];
  published?: string;
  subjects?: string[];
  dataverseName?: string;
  doi?: string;
  providerUrl: string;
  jsonUrl: string;
  thumbnail?: string;
  description?: string;
  fileTypeGroup?: string;
};

export type DVFacets = Record<string, Record<string, number>>;
