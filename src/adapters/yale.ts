import { z } from 'zod';
import type { ItemCard } from '../lib/types';

const LabelValueSchema = z.unknown();

const YaleBodySchema = z
  .union([
    z.string(),
    z
      .object({
        id: z.string().optional(),
        '@id': z.string().optional(),
        type: z.string().optional(),
        format: z.string().optional(),
      })
      .passthrough(),
  ])
  .optional();

const YaleAnnotationSchema = z
  .object({
    body: YaleBodySchema,
  })
  .passthrough();

const YaleAnnotationPageSchema = z
  .object({
    items: z.array(YaleAnnotationSchema).optional(),
  })
  .passthrough();

const YaleCanvasSchema = z
  .object({
    id: z.string().optional(),
    '@id': z.string().optional(),
    label: LabelValueSchema.optional(),
    items: z.array(YaleAnnotationPageSchema).optional(),
    thumbnail: z
      .union([
        z.string(),
        z.array(
          z.union([
            z.string(),
            z.object({ id: z.string().optional(), '@id': z.string().optional() }).passthrough(),
          ]),
        ),
        z.object({ id: z.string().optional(), '@id': z.string().optional() }).passthrough(),
      ])
      .optional(),
  })
  .passthrough();

const YaleSequenceSchema = z
  .object({
    canvases: z.array(YaleCanvasSchema).optional(),
  })
  .passthrough();

const YaleManifestSchema = z
  .object({
    id: z.string().optional(),
    '@id': z.string().optional(),
    label: LabelValueSchema.optional(),
    items: z.array(YaleCanvasSchema).optional(),
    sequences: z.array(YaleSequenceSchema).optional(),
  })
  .passthrough();

type YaleCanvas = z.infer<typeof YaleCanvasSchema>;
type YaleManifest = z.infer<typeof YaleManifestSchema>;

type ParsedCanvas = {
  id: string;
  label?: string;
  img?: string;
};

type ParsedManifest = {
  label?: string;
  canvases: ParsedCanvas[];
};

const extractString = (value: unknown): string | undefined => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  if (typeof value === 'number' || typeof value === 'bigint') {
    return String(value);
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      const result = extractString(entry);
      if (result) {
        return result;
      }
    }
    return undefined;
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const priority = ['value', '@value', 'default', 'en', 'none', 'text', 'label', 'content'];
    for (const key of priority) {
      if (key in record) {
        const result = extractString(record[key]);
        if (result) {
          return result;
        }
      }
    }

    for (const entry of Object.values(record)) {
      const result = extractString(entry);
      if (result) {
        return result;
      }
    }
  }

  return undefined;
};

const flattenCanvases = (manifest: YaleManifest): YaleCanvas[] => {
  const canvases: YaleCanvas[] = [];
  if (Array.isArray(manifest.items)) {
    canvases.push(...manifest.items);
  }
  if (Array.isArray(manifest.sequences)) {
    for (const sequence of manifest.sequences) {
      if (Array.isArray(sequence.canvases)) {
        canvases.push(...sequence.canvases);
      }
    }
  }
  return canvases;
};

const getCanvasImage = (canvas: YaleCanvas): string | undefined => {
  const thumb = canvas.thumbnail;
  if (typeof thumb === 'string' && thumb.trim().length > 0) {
    return thumb.trim();
  }
  if (Array.isArray(thumb)) {
    for (const entry of thumb) {
      const candidate = extractString(entry);
      if (candidate) {
        return candidate;
      }
    }
  }
  if (thumb && typeof thumb === 'object') {
    const candidate = extractString(thumb);
    if (candidate) {
      return candidate;
    }
  }

  if (!Array.isArray(canvas.items)) {
    return undefined;
  }

  for (const page of canvas.items) {
    if (!Array.isArray(page?.items)) continue;
    for (const annotation of page.items) {
      const candidate = extractString(annotation?.body);
      if (candidate) {
        return candidate;
      }
    }
  }

  return undefined;
};

export const parseManifest = (manifest: unknown): ParsedManifest => {
  const data: YaleManifest = YaleManifestSchema.parse(manifest);
  const canvases = flattenCanvases(data)
    .map<ParsedCanvas | undefined>((canvas) => {
      const id = extractString(canvas.id ?? canvas['@id']);
      if (!id) {
        return undefined;
      }

      return {
        id,
        label: extractString(canvas.label),
        img: getCanvasImage(canvas),
      };
    })
    .filter((canvas): canvas is ParsedCanvas => !!canvas);

  return {
    label: extractString(data.label),
    canvases,
  };
};

export const toItemCards = (manifest: unknown): ItemCard[] => {
  const parsed = parseManifest(manifest);

  return parsed.canvases.map((canvas, index) => {
    const title = canvas.label ?? `${parsed.label ?? 'Yale manifest'} #${index + 1}`;

    return {
      id: canvas.id,
      title,
      sub: parsed.label,
      img: canvas.img,
      source: 'Yale',
      raw: canvas,
    };
  });
};
