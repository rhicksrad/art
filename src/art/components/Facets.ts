import type { SearchState } from '../lib/urlState';

export type FacetDef = { key: 'classification' | 'century'; label: string };

export function Facets(
  defs: FacetDef[],
  counts: Record<string, Record<string, number>>,
  state: Pick<SearchState, 'classification' | 'century'>,
  onChange: (s: Pick<SearchState, 'classification' | 'century'>) => void,
): HTMLElement {
  const container = document.createElement('aside');
  container.className = 'facet-panel';
  container.setAttribute('aria-label', 'Filters');

  for (const def of defs) {
    const selected = new Set(state[def.key] ?? []);
    const options = counts[def.key] ?? {};
    const allValues = new Set<string>([...selected, ...Object.keys(options)]);

    const fieldset = document.createElement('fieldset');
    fieldset.className = 'facet-group';

    const legend = document.createElement('legend');
    legend.textContent = def.label;
    fieldset.appendChild(legend);

    if (allValues.size === 0) {
      const empty = document.createElement('p');
      empty.className = 'facet-empty';
      empty.textContent = 'No values available';
      fieldset.appendChild(empty);
      container.appendChild(fieldset);
      continue;
    }

    const sortedValues = Array.from(allValues).sort((a, b) => {
      const diff = (options[b] ?? 0) - (options[a] ?? 0);
      return diff !== 0 ? diff : a.localeCompare(b);
    });

    sortedValues.forEach((value, index) => {
      const count = options[value] ?? 0;
      const id = `facet-${def.key}-${index}`;
      const wrapper = document.createElement('label');
      wrapper.className = 'facet-option';
      wrapper.htmlFor = id;

      const input = document.createElement('input');
      input.type = 'checkbox';
      input.id = id;
      input.name = `${def.key}[]`;
      input.value = value;
      input.checked = selected.has(value);
      input.addEventListener('change', () => {
        const next = new Set(state[def.key] ?? []);
        if (input.checked) {
          next.add(value);
        } else {
          next.delete(value);
        }
        const payload: { classification?: string[]; century?: string[] } = {
          classification: def.key === 'classification' ? Array.from(next) : state.classification ?? [],
          century: def.key === 'century' ? Array.from(next) : state.century ?? [],
        };
        onChange(payload);
      });

      const name = document.createElement('span');
      name.className = 'facet-option__label';
      name.textContent = value;

      const badge = document.createElement('span');
      badge.className = 'facet-option__count';
      badge.textContent = String(count);

      wrapper.append(input, name, badge);
      fieldset.appendChild(wrapper);
    });

    container.appendChild(fieldset);
  }

  return container;
}
