import { binYears, formatYear } from '../lib/dates';
import { h } from '../lib/dom';
import type { ItemCard } from '../lib/types';
import { sourceByKey } from '../sources';

type TimelineOptions = {
  onOpen: (item: ItemCard) => void;
  showSource: boolean;
};

/**
 * Works laid out along a time axis: one column per period, items stacked upward
 * from the baseline like a pictorial histogram. Empty stretches collapse into a
 * labelled gap so sparse centuries do not push everything apart.
 */
export const timeline = (
  items: ItemCard[],
  { onOpen, showSource }: TimelineOptions,
): HTMLElement => {
  const dated = items
    .filter((item) => item.year !== undefined)
    .sort((a, b) => (a.year as number) - (b.year as number));
  const undated = items.length - dated.length;
  const bins = binYears(
    dated.map((item) => item.year as number),
    16,
  );
  const track = h('div', { class: 'timeline__track' });

  let emptyRun = 0;
  for (const bin of bins) {
    const members = dated.filter(
      (item) => (item.year as number) >= bin.start && (item.year as number) <= bin.end,
    );
    if (members.length === 0) {
      emptyRun += 1;
      continue;
    }
    if (emptyRun > 0 && track.childElementCount > 0) {
      track.append(
        h('div', { class: 'timeline__gap', 'aria-hidden': 'true' }, h('span', null, '⋯')),
      );
    }
    emptyRun = 0;

    const stack = h('div', { class: 'timeline__stack' });
    for (const item of members) {
      const label = `${item.title}${item.date ? `, ${item.date}` : ''}${showSource ? ` (${sourceByKey(item.source).short})` : ''}`;
      const button = h('button', {
        type: 'button',
        class: `timeline__item${item.img ? '' : ' timeline__item--text'}`,
        title: label,
        'aria-label': label,
      });
      if (item.img) {
        const img = h('img', {
          src: item.img,
          alt: '',
          loading: 'lazy',
          referrerpolicy: 'no-referrer',
        });
        img.addEventListener('error', () => {
          button.classList.add('timeline__item--text');
          button.replaceChildren(h('span', null, item.title));
        });
        button.append(img);
      } else {
        button.append(h('span', null, item.title));
      }
      button.addEventListener('click', () => onOpen(item));
      stack.append(button);
    }
    track.append(
      h(
        'section',
        // A busy period spreads sideways, four works to a file, so no column towers over the rest.
        { class: 'timeline__column', style: `--files:${Math.ceil(members.length / 4)}` },
        stack,
        h(
          'header',
          { class: 'timeline__label' },
          h('strong', null, bin.label),
          h('span', null, `${members.length}`),
        ),
      ),
    );
  }

  const first = dated[0]?.year;
  const last = dated[dated.length - 1]?.year;
  return h(
    'div',
    { class: 'timeline' },
    h(
      'p',
      { class: 'timeline__caption muted' },
      first !== undefined && last !== undefined
        ? `${dated.length} dated works from ${formatYear(first)} to ${formatYear(last)}. `
        : '',
      undated > 0 ? `${undated} without a usable date are left out. ` : '',
      'Scroll sideways to travel through time.',
    ),
    h('div', { class: 'timeline__scroller', tabindex: '0' }, track),
  );
};
