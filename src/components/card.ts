import { h } from '../lib/dom';
import type { ItemCard } from '../lib/types';
import { sourceByKey } from '../sources';

export type CardOptions = {
  onOpen: (item: ItemCard) => void;
  showSource?: boolean;
};

const byline = (item: ItemCard): string => [item.sub, item.date].filter(Boolean).join(' · ');

const sourceBadge = (item: ItemCard): HTMLElement =>
  h(
    'span',
    { class: 'badge', title: sourceByKey(item.source).label },
    sourceByKey(item.source).short,
  );

/** Swap a failed image for a quiet placeholder instead of a broken-image icon. */
const media = (item: ItemCard): HTMLElement => {
  const frame = h('div', { class: 'card__media' });
  if (!item.img) return frame;
  const img = h('img', {
    src: item.img,
    alt: '',
    loading: 'lazy',
    decoding: 'async',
    referrerpolicy: 'no-referrer',
    style: item.aspect ? `aspect-ratio:${item.aspect.toFixed(4)}` : undefined,
  });
  if (!item.aspect) frame.classList.add('card__media--pending');
  img.addEventListener('load', () => frame.classList.remove('card__media--pending'));
  img.addEventListener('error', () => {
    frame.classList.remove('card__media--pending');
    frame.classList.add('card__media--missing');
    frame.replaceChildren(h('span', null, 'Image not available'));
  });
  frame.append(img);
  return frame;
};

/** Rough height in column-widths, so masonry columns balance before images arrive. */
export const cardWeight = (item: ItemCard): number => {
  if (!item.img) return item.description ? 1.05 : 0.6;
  return 1 / Math.min(Math.max(item.aspect ?? 1, 0.45), 2.4) + 0.5;
};

export const galleryCard = (item: ItemCard, { onOpen, showSource }: CardOptions): HTMLElement => {
  const hasImage = !!item.img;
  const button = h(
    'button',
    {
      type: 'button',
      class: `card${hasImage ? '' : ' card--text'}`,
      'aria-label': `${item.title} — open details`,
    },
    hasImage ? media(item) : null,
    h(
      'div',
      { class: 'card__body' },
      h(
        'div',
        { class: 'card__meta' },
        showSource ? sourceBadge(item) : null,
        item.kind ? h('span', { class: 'card__kind' }, item.kind) : null,
      ),
      h('h3', { class: 'card__title' }, item.title),
      byline(item) ? h('p', { class: 'card__byline' }, byline(item)) : null,
      !hasImage && item.description ? h('p', { class: 'card__excerpt' }, item.description) : null,
    ),
  );
  button.addEventListener('click', () => onOpen(item));
  return button;
};

export const listRow = (item: ItemCard, { onOpen, showSource }: CardOptions): HTMLElement => {
  const button = h(
    'button',
    { type: 'button', class: 'row', 'aria-label': `${item.title} — open details` },
    h(
      'div',
      { class: 'row__main' },
      h('h3', { class: 'row__title' }, item.title),
      byline(item) ? h('p', { class: 'row__byline' }, byline(item)) : null,
      item.description ? h('p', { class: 'row__excerpt' }, item.description) : null,
      item.tags && item.tags.length > 0
        ? h(
            'div',
            { class: 'tags' },
            ...item.tags.slice(0, 5).map((tag) => h('span', { class: 'tag' }, tag)),
          )
        : null,
    ),
    h(
      'div',
      { class: 'row__aside' },
      showSource ? sourceBadge(item) : null,
      item.kind ? h('span', { class: 'card__kind' }, item.kind) : null,
    ),
  );
  button.addEventListener('click', () => onOpen(item));
  return button;
};

export const skeletonCards = (count: number, layout: 'gallery' | 'list'): HTMLElement[] =>
  Array.from({ length: count }, () =>
    layout === 'gallery'
      ? h(
          'div',
          { class: 'card card--skeleton', 'aria-hidden': 'true' },
          h('div', { class: 'card__media' }),
          h('div', { class: 'card__body' }, h('span'), h('span')),
        )
      : h(
          'div',
          { class: 'row row--skeleton', 'aria-hidden': 'true' },
          h('div', { class: 'row__main' }, h('span'), h('span'), h('span')),
        ),
  );
