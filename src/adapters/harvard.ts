import type { ItemCard } from '../lib/types';

type HarvardRecord = Record<string, unknown>;

const asRecord = (value: unknown): HarvardRecord | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as HarvardRecord;
};

const firstString = (value: unknown): string | undefined => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const result = firstString(entry);
      if (result) {
        return result;
      }
    }
  } else if (value && typeof value === 'object') {
    for (const entry of Object.values(value as HarvardRecord)) {
      const result = firstString(entry);
      if (result) {
        return result;
      }
    }
  }
  return undefined;
};

const toIiifImage = (value: string | undefined): string | undefined => {
  if (!value) {
    return undefined;
  }
  if (value.includes('/full/')) {
    return value;
  }
  if (value.includes('/iiif/')) {
    return `${value.replace(/\/?$/, '')}/full/!400,400/0/default.jpg`;
  }
  return value;
};

const findImage = (record: HarvardRecord): string | undefined => {
  const images = Array.isArray(record.images) ? (record.images as unknown[]) : [];
  for (const entry of images) {
    const item = asRecord(entry);
    if (!item) {
      continue;
    }
    const iiif = firstString(item.iiifbaseuri ?? item.iiif_url ?? item.baseimageurl);
    const resolved = toIiifImage(iiif);
    if (resolved) {
      return resolved;
    }
  }
  const direct = firstString(record.primaryimageurl ?? record.image);
  return direct ? toIiifImage(direct) : undefined;
};

const buildTags = (record: HarvardRecord): string[] => {
  const tags = new Set<string>();
  const classification = firstString(record.classification);
  if (classification) {
    tags.add(classification);
  }
  const century = firstString(record.century);
  if (century) {
    tags.add(century);
  }
  const culture = firstString(record.culture);
  if (culture) {
    tags.add(culture);
  }
  return Array.from(tags);
};

const joinPeople = (record: HarvardRecord): string | undefined => {
  const people = Array.isArray(record.people) ? (record.people as unknown[]) : [];
  const names: string[] = [];
  for (const entry of people) {
    const person = asRecord(entry);
    if (!person) {
      continue;
    }
    const name = firstString(person.displayname ?? person.name);
    if (name) {
      names.push(name);
    }
  }
  return names.length > 0 ? names.join(', ') : undefined;
};

const recordToCard = (record: HarvardRecord): ItemCard => {
  const id = firstString(record.id ?? record.objectid ?? record.objectnumber) ?? `harvard-${Math.random().toString(36).slice(2)}`;
  const title = firstString(record.title) ?? 'Untitled';
  const sub = joinPeople(record) ?? firstString(record.division);
  const date = firstString(record.dated ?? record.date);
  const href = firstString(record.url);

  return {
    id,
    title,
    sub,
    date,
    tags: (() => {
      const tags = buildTags(record);
      return tags.length > 0 ? tags : undefined;
    })(),
    img: findImage(record),
    href,
    source: 'Harvard',
    raw: record,
  };
};

const extractRecords = (resp: unknown): HarvardRecord[] => {
  if (!resp) {
    return [];
  }
  if (Array.isArray(resp)) {
    return resp as HarvardRecord[];
  }
  const record = asRecord(resp);
  if (!record) {
    return [];
  }
  if (Array.isArray(record.records)) {
    return record.records as HarvardRecord[];
  }
  if (record.record && typeof record.record === 'object') {
    return [record.record as HarvardRecord];
  }
  return [record];
};

export const toItemCards = (resp: unknown): ItemCard[] => {
  const records = extractRecords(resp);
  return records.map((record) => recordToCard(record));
};
