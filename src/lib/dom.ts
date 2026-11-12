type Child = Node | string | number | null | undefined | false;

type Attrs = Record<string, unknown>;

const applyAttrs = (el: Element, attrs: Attrs): void => {
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') {
      el.setAttribute('class', String(value));
    } else if (key === 'dataset' && typeof value === 'object') {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (v !== undefined && v !== null) (el as HTMLElement).dataset[k] = String(v);
      }
    } else if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
    } else if (value === true) {
      el.setAttribute(key, '');
    } else {
      el.setAttribute(key, String(value));
    }
  }
};

const appendChildren = (el: Element, children: Child[]): void => {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
};

/** Tiny hyperscript helper: h('a', { href, class }, 'label'). */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Attrs | null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) applyAttrs(el, attrs);
  appendChildren(el, children);
  return el;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

export function svg(tag: string, attrs?: Attrs | null, ...children: Child[]): SVGElement {
  const el = document.createElementNS(SVG_NS, tag);
  if (attrs) applyAttrs(el, attrs);
  appendChildren(el, children);
  return el;
}

const ICONS: Record<string, string> = {
  search: 'M11 19a8 8 0 1 1 5.3-2l4.4 4.3M11 19a8 8 0 0 0 5.3-2',
  external: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  close: 'M6 6l12 12M18 6L6 18',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  sun: 'M12 4V2M12 22v-2M4 12H2M22 12h-2M6.3 6.3 4.9 4.9M19.1 19.1l-1.4-1.4M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z',
  alert:
    'M12 9v4M12 17h.01M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  code: 'M8 7l-5 5 5 5M16 7l5 5-5 5',
  menu: 'M4 7h16M4 12h16M4 17h16',
};

export const icon = (name: keyof typeof ICONS | string, size = 16): SVGElement =>
  svg(
    'svg',
    {
      viewBox: '0 0 24 24',
      width: size,
      height: size,
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': 1.8,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'aria-hidden': 'true',
      class: 'icon',
    },
    svg('path', { d: ICONS[name] ?? '' }),
  );

export const clear = (el: Element): void => {
  el.replaceChildren();
};

export const formatCount = (value: number): string => value.toLocaleString('en-US');
