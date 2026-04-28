import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { toItemCards as harvardToItemCards } from './harvard';
import { toItemCards as princetonToItemCards } from './princeton';
import { toItemCards as dataverseToItemCards } from './dataverse';
import { toItemCards as ubcToItemCards } from './ubc';
import { toItemCards as arxivToItemCards } from './arxiv';
import { iiifResourceToCards } from './iiifCollections';

const loadJsonFixture = <T>(fixturePath: string): T => {
  const absolutePath = resolve(process.cwd(), fixturePath);
  return JSON.parse(readFileSync(absolutePath, 'utf-8')) as T;
};

const loadTextFixture = (fixturePath: string): string => {
  const absolutePath = resolve(process.cwd(), fixturePath);
  return readFileSync(absolutePath, 'utf-8');
};

const assertRequiredCardShape = (card: Record<string, unknown>, source: string): void => {
  expect(typeof card.id).toBe('string');
  expect((card.id as string).length).toBeGreaterThan(0);
  expect(typeof card.title).toBe('string');
  expect((card.title as string).length).toBeGreaterThan(0);
  expect(card.source).toBe(source);
  expect(card).toHaveProperty('raw');
};

describe('adapter contract tests', () => {
  it('normalizes Harvard fixture payloads into ItemCard with required fields', () => {
    const payload = loadJsonFixture<unknown>('public/fixtures/harvard/object.json');
    const cards = harvardToItemCards(payload);

    expect(cards.length).toBeGreaterThan(0);
    assertRequiredCardShape(cards[0] as unknown as Record<string, unknown>, 'Harvard');
  });

  it('handles Harvard optional fields and empty/error-like payloads safely', () => {
    const sparsePayload = { records: [{ id: 1 }] };
    const cards = harvardToItemCards(sparsePayload);

    expect(cards).toHaveLength(1);
    expect(cards[0].title).toBe('Untitled');
    expect(cards[0].sub).toBeUndefined();
    expect(() => harvardToItemCards(null)).not.toThrow();
    expect(() => harvardToItemCards({ error: 'upstream failure' })).not.toThrow();
  });

  it('normalizes Princeton fixture payloads into ItemCard with required fields', () => {
    const payload = loadJsonFixture<unknown>('public/fixtures/princeton/search.json');
    const cards = princetonToItemCards(payload);

    expect(cards.length).toBeGreaterThan(0);
    assertRequiredCardShape(cards[0] as unknown as Record<string, unknown>, 'Princeton');
  });

  it('handles Princeton optional fields and empty/error-like payloads safely', () => {
    const sparsePayload = { hits: { hits: [{ _source: { objectid: 42 } }] } };
    const cards = princetonToItemCards(sparsePayload);

    expect(cards).toHaveLength(1);
    expect(cards[0].title).toBe('Untitled');
    expect(cards[0].sub).toBeUndefined();
    expect(() => princetonToItemCards(undefined)).not.toThrow();
    expect(() => princetonToItemCards({ hits: {} })).not.toThrow();
  });

  it('normalizes Dataverse fixture payloads into ItemCard with required fields', () => {
    const payload = loadJsonFixture<unknown>('public/fixtures/dataverse/search.json');
    const cards = dataverseToItemCards(payload);

    expect(cards.length).toBeGreaterThan(0);
    assertRequiredCardShape(cards[0] as unknown as Record<string, unknown>, 'Dataverse');
  });

  it('handles Dataverse optional fields and empty/error-like payloads safely', () => {
    const sparsePayload = { data: { items: [{ global_id: 'doi:10.1/abc' }] } };
    const cards = dataverseToItemCards(sparsePayload);

    expect(cards).toHaveLength(1);
    expect(cards[0].title).toBe('Untitled');
    expect(cards[0].tags).toBeUndefined();
    expect(() => dataverseToItemCards({})).not.toThrow();
    expect(() => dataverseToItemCards({ error: 'timeout' })).not.toThrow();
  });

  it('normalizes UBC fixture payloads into ItemCard with required fields', () => {
    const payload = loadJsonFixture<unknown>('public/fixtures/ubc/search.json');
    const cards = ubcToItemCards(payload);

    expect(cards.length).toBeGreaterThan(0);
    assertRequiredCardShape(cards[0] as unknown as Record<string, unknown>, 'UBC');
  });

  it('handles UBC optional fields and empty/error-like payloads safely', () => {
    const sparsePayload = { data: [{ _source: { id: 'ubc-1' } }] };
    const cards = ubcToItemCards(sparsePayload);

    expect(cards).toHaveLength(1);
    expect(cards[0].title).toBe('ubc-1');
    expect(() => ubcToItemCards(null)).not.toThrow();
    expect(() => ubcToItemCards({ message: 'internal error' })).not.toThrow();
  });

  it('normalizes arXiv fixture payloads into ItemCard with required fields', () => {
    const payload = loadTextFixture('public/fixtures/arxiv/feed.xml');
    const cards = arxivToItemCards(payload);

    expect(cards.length).toBeGreaterThan(0);
    assertRequiredCardShape(cards[0] as unknown as Record<string, unknown>, 'arXiv');
  });

  it('handles arXiv optional fields and empty/error-like payloads safely', () => {
    const emptyFeed = '<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom"></feed>';

    expect(arxivToItemCards(emptyFeed)).toEqual([]);
    expect(() => arxivToItemCards(emptyFeed)).not.toThrow();
  });

  it('normalizes IIIF collection fixture payloads into ItemCard with required fields', () => {
    const payload = loadJsonFixture<unknown>('public/fixtures/tests/iiif/collection.json');
    const cards = iiifResourceToCards(payload, 'LeipzigIIIF');

    expect(cards.length).toBeGreaterThan(0);
    assertRequiredCardShape(cards[0] as unknown as Record<string, unknown>, 'LeipzigIIIF');
  });

  it('handles IIIF optional fields and empty/error-like payloads safely', () => {
    const sparseManifest = { id: 'https://example.org/iiif/manifest/2', type: 'Manifest' };
    const cards = iiifResourceToCards(sparseManifest, 'BernIIIF');

    expect(cards).toHaveLength(1);
    expect(cards[0].title).toBe('Untitled manifest');
    expect(() => iiifResourceToCards(null, 'BernIIIF')).not.toThrow();
    expect(() => iiifResourceToCards({ message: 'error' }, 'BernIIIF')).not.toThrow();
  });
});
