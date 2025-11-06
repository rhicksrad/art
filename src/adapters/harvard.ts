import { z } from "zod";
import type { ItemCard } from "../lib/types";

const HarvardImageSchema = z
  .object({
    iiifbaseuri: z.string().trim().min(1).optional(),
    baseimageurl: z.string().trim().min(1).optional(),
    format: z.string().optional(),
  })
  .passthrough();

const HarvardPersonSchema = z
  .object({
    name: z.string().trim().optional(),
    displayname: z.string().trim().optional(),
    role: z.string().optional(),
  })
  .passthrough();

export const HarvardRecordSchema = z
  .object({
    id: z.union([z.string(), z.number()]),
    title: z.string().optional(),
    objectnumber: z.string().optional(),
    dated: z.string().optional(),
    culture: z.string().optional(),
    classification: z.string().optional(),
    technique: z.string().optional(),
    url: z.string().optional(),
    primaryimageurl: z.string().optional(),
    images: z.array(HarvardImageSchema).optional(),
    people: z.array(HarvardPersonSchema).optional(),
  })
  .passthrough();

const HarvardResponseSchema = z
  .object({
    records: z.array(HarvardRecordSchema).optional(),
  })
  .passthrough();

type HarvardRecord = z.infer<typeof HarvardRecordSchema>;

type HarvardResponse = z.infer<typeof HarvardResponseSchema>;

const getPrimaryImage = (record: HarvardRecord): string | undefined => {
  const iiifImage = record.images?.find((image) => {
    return typeof image.iiifbaseuri === "string" && image.iiifbaseuri.length > 0;
  });

  if (iiifImage?.iiifbaseuri) {
    return iiifImage.iiifbaseuri;
  }

  if (typeof record.primaryimageurl === "string" && record.primaryimageurl.length > 0) {
    return record.primaryimageurl;
  }

  return undefined;
};

const getPrimaryPerson = (record: HarvardRecord): string | undefined => {
  if (!Array.isArray(record.people)) {
    return undefined;
  }

  for (const person of record.people) {
    const name = person.name ?? person.displayname;
    if (name && name.trim().length > 0) {
      return name.trim();
    }
  }

  return undefined;
};

const buildTags = (record: HarvardRecord): string[] | undefined => {
  const tags = [record.classification, record.technique, record.culture]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.trim());

  return tags.length > 0 ? Array.from(new Set(tags)) : undefined;
};

const toItemCard = (record: HarvardRecord): ItemCard => {
  const title = record.title?.trim() || record.objectnumber?.trim() || `Harvard item ${record.id}`;
  const sub = getPrimaryPerson(record) ?? record.culture?.trim();
  const date = record.dated?.trim();
  const href = record.url?.trim();
  const img = getPrimaryImage(record);
  const tags = buildTags(record);

  return {
    id: String(record.id),
    title,
    sub,
    date,
    tags,
    img,
    href,
    source: "Harvard",
    raw: record,
  };
};

export const toItemCards = (resp: unknown): ItemCard[] => {
  const data: HarvardResponse = HarvardResponseSchema.parse(resp);
  const records = data.records ?? [];

  return records.map((record) => toItemCard(record));
};
