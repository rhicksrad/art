export type ItemCard = {
  id: string;
  title: string;
  sub?: string;
  date?: string;
  tags?: string[];
  img?: string;
  href?: string;
  source: "Harvard" | "Princeton" | "Yale" | "UBC" | "Dataverse" | "arXiv";
  raw: unknown;
};
