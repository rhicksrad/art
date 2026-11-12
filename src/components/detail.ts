import { h, icon } from '../lib/dom';
import { pageHref } from '../lib/routes';
import type { ItemCard } from '../lib/types';
import { sourceByKey } from '../sources';
import { paletteStrip } from './charts';

let dialog: HTMLDialogElement | null = null;
let items: ItemCard[] = [];
let index = 0;

const rawText = (raw: unknown): string => {
  if (typeof raw === 'string') return raw;
  try {
    return JSON.stringify(raw, null, 2);
  } catch {
    return String(raw);
  }
};

/** Ask the image server for a bigger rendition of a sized URL (IIIF `!w,h` or Harvard `height/width`). */
const upscale = (url: string, box: number): string =>
  url
    .replace(/\/full\/![^/]+\//, `/full/!${box},${box}/`)
    .replace(/height=\d+&width=\d+/, `height=${box}&width=${box}`);

const figure = (item: ItemCard): HTMLElement | null => {
  const src = item.imgLarge ?? item.img;
  if (!src) return null;
  const frame = h('div', { class: 'detail__figure' });
  const img = h('img', { src, alt: item.title, referrerpolicy: 'no-referrer', draggable: 'false' });
  const stage = h('div', { class: 'detail__stage', title: 'Click to zoom' }, img);
  const hint = h('p', { class: 'detail__hint' }, 'Click the image to zoom, then move to explore.');

  // Fall back to the thumbnail if the large rendition is refused.
  img.addEventListener('error', () => {
    if (item.img && img.src !== item.img && !stage.classList.contains('is-zoomed'))
      img.src = item.img;
    else if (!stage.classList.contains('is-zoomed')) {
      stage.replaceChildren(
        h('p', { class: 'muted' }, 'The image could not be loaded from the source.'),
      );
      hint.remove();
    }
  });

  // Loupe zoom: the point under the cursor stays put while the image scales around it.
  const follow = (event: PointerEvent): void => {
    const rect = stage.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    img.style.transformOrigin = `${Math.min(100, Math.max(0, x))}% ${Math.min(100, Math.max(0, y))}%`;
  };
  stage.addEventListener('click', (event) => {
    const zoomed = stage.classList.toggle('is-zoomed');
    stage.title = zoomed ? 'Click to zoom out' : 'Click to zoom';
    if (zoomed) {
      follow(event as PointerEvent);
      // Swap in a sharper rendition once it has loaded; keep the current one if it fails.
      const sharper = upscale(img.src, 2600);
      if (sharper !== img.src) {
        const loader = new Image();
        loader.referrerPolicy = 'no-referrer';
        loader.onload = () => {
          if (stage.classList.contains('is-zoomed')) img.src = sharper;
        };
        loader.src = sharper;
      }
    }
  });
  stage.addEventListener('pointermove', (event) => {
    if (stage.classList.contains('is-zoomed')) follow(event);
  });

  frame.append(stage, hint);

  // A record with several images is read like a book: turn pages, or jump from the strip.
  const pages = item.images ?? [];
  if (pages.length > 1) {
    let page = 0;
    const counter = h('span', { class: 'detail__page', 'aria-live': 'polite' });
    const turn = (delta: number, label: string): HTMLButtonElement => {
      const button = h(
        'button',
        { type: 'button', class: 'icon-button', 'aria-label': label, title: label },
        icon('arrow', 18),
      );
      if (delta < 0) button.classList.add('icon-button--flip');
      button.addEventListener('click', () => show(page + delta, true));
      return button;
    };
    const previous = turn(-1, 'Previous page');
    const next = turn(1, 'Next page');
    const thumbs = pages.map((thumb, i) => {
      const button = h(
        'button',
        { type: 'button', 'aria-label': `Show page ${i + 1}` },
        h('img', { src: thumb, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' }),
      );
      button.addEventListener('click', () => show(i, false));
      return button;
    });
    const mark = (): void => {
      counter.textContent = `Page ${page + 1} of ${pages.length}`;
      previous.disabled = page === 0;
      next.disabled = page === pages.length - 1;
      thumbs.forEach((thumb, i) => {
        if (i === page) thumb.setAttribute('aria-current', 'true');
        else thumb.removeAttribute('aria-current');
      });
    };
    function show(target: number, reveal: boolean): void {
      if (target < 0 || target >= pages.length) return;
      page = target;
      stage.classList.remove('is-zoomed');
      img.src = upscale(pages[page], 1400);
      mark();
      if (reveal) thumbs[page].scrollIntoView({ block: 'nearest', inline: 'center' });
    }
    mark();
    frame.append(
      h('div', { class: 'detail__pager' }, previous, counter, next),
      h('div', { class: 'detail__strip', 'aria-label': `${pages.length} pages` }, ...thumbs),
    );
  }
  return frame;
};

/**
 * The full record: image with loupe zoom and page strip beside every field the API returned.
 * The dialog shows it, and a lookup that resolves to a single record sets it straight on the page.
 */
export const recordView = (item: ItemCard): HTMLElement => {
  const source = sourceByKey(item.source);
  const art = figure(item);

  const facts = h('dl', { class: 'facts' });
  for (const field of item.fields ?? []) {
    facts.append(h('dt', null, field.label), h('dd', null, field.value));
  }

  const actions = h('div', { class: 'detail__actions' });
  if (item.href) {
    actions.append(
      h(
        'a',
        { href: item.href, target: '_blank', rel: 'noreferrer', class: 'button button--primary' },
        `View at ${source.short}`,
        icon('external', 15),
      ),
    );
  }
  for (const link of item.links ?? []) {
    actions.append(
      h(
        'a',
        { href: link.href, target: '_blank', rel: 'noreferrer', class: 'button' },
        link.label,
        icon('external', 15),
      ),
    );
  }

  const raw = h(
    'details',
    { class: 'disclosure' },
    h('summary', null, icon('code', 15), ' Raw record from the API'),
  );
  raw.addEventListener(
    'toggle',
    () => {
      if (raw.open && raw.childElementCount === 1)
        raw.append(h('pre', { class: 'code' }, rawText(item.raw)));
    },
    { once: false },
  );

  return h(
    'div',
    { class: `detail__layout${art ? '' : ' detail__layout--text'}` },
    art,
    h(
      'div',
      { class: 'detail__info' },
      item.kind ? h('p', { class: 'detail__kind' }, item.kind) : null,
      h('h2', { class: 'detail__title' }, item.title),
      item.sub || item.date
        ? h(
            'p',
            { class: 'detail__byline' },
            item.sub ? h('strong', null, item.sub) : null,
            item.sub && item.date ? ', ' : null,
            item.date ?? null,
          )
        : null,
      item.description ? h('p', { class: 'detail__description' }, item.description) : null,
      item.colors && item.colors.length > 0
        ? h(
            'div',
            { class: 'detail__palette' },
            h('h3', null, 'Colours in this work'),
            paletteStrip(
              item.colors,
              item.source === 'Harvard'
                ? (color) => pageHref(source.page, { color: color.hex })
                : undefined,
            ),
            item.source === 'Harvard'
              ? h('p', { class: 'panel__note' }, 'Pick a colour to find other works that share it.')
              : null,
          )
        : null,
      facts.childElementCount > 0 ? facts : null,
      item.tags && item.tags.length > 0
        ? h(
            'div',
            { class: 'tags' },
            ...item.tags.map((tag) =>
              h(
                'a',
                {
                  class: 'tag tag--link',
                  href: pageHref('/', { q: tag }),
                  title: `Search every source for “${tag}”`,
                },
                tag,
              ),
            ),
          )
        : null,
      actions.childElementCount > 0 ? actions : null,
      raw,
    ),
  );
};

const render = (): void => {
  if (!dialog) return;
  const item = items[index];
  const source = sourceByKey(item.source);

  const nav = (delta: number, label: string): HTMLButtonElement => {
    const button = h(
      'button',
      { type: 'button', class: 'icon-button', 'aria-label': label, title: label },
      icon('arrow', 18),
    );
    if (delta < 0) button.classList.add('icon-button--flip');
    button.disabled = index + delta < 0 || index + delta >= items.length;
    button.addEventListener('click', () => step(delta));
    return button;
  };
  const close = h(
    'button',
    { type: 'button', class: 'icon-button', 'aria-label': 'Close', title: 'Close' },
    icon('close', 18),
  );
  close.addEventListener('click', () => dialog?.close());

  dialog.replaceChildren(
    h(
      'div',
      { class: 'detail__bar' },
      h('a', { class: 'detail__source', href: pageHref(source.page) }, source.label),
      h(
        'div',
        { class: 'detail__nav' },
        items.length > 1
          ? h('span', { class: 'muted nowrap' }, `${index + 1} of ${items.length}`)
          : null,
        items.length > 1 ? nav(-1, 'Previous result') : null,
        items.length > 1 ? nav(1, 'Next result') : null,
        close,
      ),
    ),
    recordView(item),
  );
  dialog.scrollTop = 0;
};

const step = (delta: number): void => {
  const next = index + delta;
  if (next < 0 || next >= items.length) return;
  index = next;
  render();
};

const ensureDialog = (): HTMLDialogElement => {
  if (dialog) return dialog;
  const element = h('dialog', { class: 'detail', 'aria-label': 'Item details' });
  element.addEventListener('click', (event) => {
    if (event.target === element) element.close();
  });
  element.addEventListener('keydown', (event) => {
    const target = event.target as HTMLElement;
    if (target.closest('pre, input, textarea')) return;
    if (event.key === 'ArrowRight') step(1);
    if (event.key === 'ArrowLeft') step(-1);
  });
  element.addEventListener('close', () => document.documentElement.classList.remove('has-dialog'));
  document.body.append(element);
  dialog = element;
  return element;
};

/** Open the detail view for `item`, with previous/next stepping through `list`. */
export const openDetail = (item: ItemCard, list: ItemCard[] = [item]): void => {
  const element = ensureDialog();
  items = list.includes(item) ? list : [item];
  index = Math.max(0, items.indexOf(item));
  render();
  document.documentElement.classList.add('has-dialog');
  if (!element.open) element.showModal();
};
