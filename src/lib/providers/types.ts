export type ArxivSortBy = 'relevance' | 'lastUpdatedDate' | 'submittedDate';
export type ArxivSortOrder = 'ascending' | 'descending';

export type ArxivState = {
  search_query?: string;
  start?: number;
  max_results?: number;
  sortBy?: ArxivSortBy;
  sortOrder?: ArxivSortOrder;
  primary_cat?: string[];
  year?: number[];
  author?: string[];
};
