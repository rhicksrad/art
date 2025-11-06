import type { SearchState } from '../lib/urlState';

type FacetKey = 'classification' | 'century';

type FacetDef = { key: FacetKey; label: string };

type FacetCounts = Record<string, Record<string, number>>;

const formatCount = (count: number): string => new Intl.NumberFormat().format(count);

export function Facets(
  defs: FacetDef[],
  counts: FacetCounts,
  state: SearchState,
  onChange: (s: SearchState) => void,
): HTMLElement {
  const container = document.createElement('section');
  container.className = 'facets';
  container.setAttribute('aria-label', 'Filter results');

  defs.forEach((def) => {
    const group = document.createElement('fieldset');
    group.className = 'facet-group';

    const legend = document.createElement('legend');
    legend.textContent = def.label;
    group.appendChild(legend);

    const options = document.createElement('div');
    options.className = 'facet-group__options';

    const values = counts[def.key] ?? {};
    const entries = Object.entries(values).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

    if (entries.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'facet-group__empty';
      empty.textContent = 'No options available.';
      group.appendChild(empty);
      container.appendChild(group);
      return;
    }

    const selected = new Set(state[def.key] ?? []);

    entries.forEach(([value, count]) => {
      const id = `facet-${def.key}-${value.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`;
      const wrapper = document.createElement('div');
      wrapper.className = 'facet-option';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = id;
      checkbox.name = def.key;
      checkbox.value = value;
      checkbox.checked = selected.has(value);

      checkbox.addEventListener('change', () => {
        const next = new Set(state[def.key] ?? []);
        if (checkbox.checked) {
          next.add(value);
        } else {
          next.delete(value);
        }
        const updated = { ...state, page: 1, [def.key]: Array.from(next) } as SearchState;
        onChange(updated);
      });

      const label = document.createElement('label');
      label.htmlFor = id;
      label.className = 'facet-option__label';
      label.textContent = value;

      const countEl = document.createElement('span');
      countEl.className = 'facet-option__count';
      countEl.textContent = formatCount(count);

      wrapper.append(checkbox, label, countEl);
      options.appendChild(wrapper);
    });

    if ((state[def.key] ?? []).length > 0) {
      const clearBtn = document.createElement('button');
      clearBtn.type = 'button';
      clearBtn.className = 'facet-group__clear';
      clearBtn.textContent = 'Clear';
      clearBtn.addEventListener('click', () => {
        const updated = { ...state, page: 1, [def.key]: [] } as SearchState;
        onChange(updated);
      });
      group.appendChild(clearBtn);
    }

    group.appendChild(options);
    container.appendChild(group);
  });

  return container;
}

export type { FacetDef };
