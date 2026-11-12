import { h } from '../lib/dom';

export type MasonryCard = {
  element: HTMLElement;
  /** Estimated height in column-widths, used to keep columns balanced before images load. */
  weight: number;
};

export type Masonry = {
  element: HTMLElement;
  setCards: (cards: MasonryCard[]) => void;
};

/**
 * Column masonry that keeps reading order roughly left-to-right: each card goes
 * to the currently shortest column. Appending more cards never moves existing ones
 * unless the column count itself changes.
 */
export const createMasonry = (minColumnWidth = 220): Masonry => {
  const element = h('div', { class: 'masonry' });
  let cards: MasonryCard[] = [];
  let columnCount = 0;

  const wanted = (): number =>
    Math.max(2, Math.min(6, Math.floor((element.clientWidth || 900) / minColumnWidth)));

  const layout = (): void => {
    columnCount = wanted();
    const columns = Array.from({ length: columnCount }, () =>
      h('div', { class: 'masonry__column' }),
    );
    const heights = new Array<number>(columnCount).fill(0);
    cards.forEach((card, index) => {
      const target = heights.indexOf(Math.min(...heights));
      card.element.style.setProperty('--i', String(Math.min(index, 14)));
      columns[target].append(card.element);
      heights[target] += card.weight;
    });
    element.replaceChildren(...columns);
  };

  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => {
      if (cards.length > 0 && wanted() !== columnCount) layout();
    }).observe(element);
  }

  return {
    element,
    setCards: (next) => {
      cards = next;
      layout();
    },
  };
};
