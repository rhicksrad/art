import { DVFacets, DVSearchState } from '../lib/types';

type DVType = NonNullable<DVSearchState['type']>[number];

export type FacetConfig = {
  key: string;
  label: string;
  stateKey?: 'type' | 'subject' | 'dataverse' | 'fileType';
  limit?: number;
  type?: 'multi' | 'range';
};

const formatLabel = (value: string): string => {
  return value.trim().replace(/_/g, ' ');
};

const ensureTypes = (values: string[]): DVSearchState['type'] => {
  const allowed: DVType[] = ['dataset', 'file', 'dataverse'];
  const filtered = values.filter((value): value is DVType => allowed.includes(value as DVType));
  return filtered.length > 0 ? filtered : ['dataset'];
};

const deriveYearSelection = (state: DVSearchState): number[] => {
  const years: number[] = [];
  const start = typeof state.yearStart === 'number' ? Math.trunc(state.yearStart) : undefined;
  const end = typeof state.yearEnd === 'number' ? Math.trunc(state.yearEnd) : undefined;
  if (start !== undefined && end !== undefined) {
    for (let year = Math.min(start, end); year <= Math.max(start, end); year += 1) {
      years.push(year);
    }
  } else if (start !== undefined) {
    years.push(start);
  } else if (end !== undefined) {
    years.push(end);
  }
  return years;
};

const buildRangeState = (state: DVSearchState, year: number, checked: boolean): DVSearchState => {
  const selection = new Set(deriveYearSelection(state));
  if (checked) {
    selection.add(year);
  } else {
    selection.delete(year);
  }
  const values = Array.from(selection).sort((a, b) => a - b);
  const next: DVSearchState = { ...state, page: 1 };
  if (values.length === 0) {
    delete next.yearStart;
    delete next.yearEnd;
    return next;
  }
  next.yearStart = values[0];
  next.yearEnd = values[values.length - 1];
  return next;
};

export const Facets = (
  configs: FacetConfig[],
  facets: DVFacets,
  state: DVSearchState,
  onChange: (next: DVSearchState) => void
): HTMLElement => {
  const container = document.createElement('aside');
  container.className = 'dv-facets';

  configs.forEach((config) => {
    const facetValues = facets[config.key] ?? {};
    const entries = Object.entries(facetValues).sort(([, a], [, b]) => b - a);
    const limit = config.limit ?? 20;

    const section = document.createElement('section');
    section.className = 'dv-facet';

    const heading = document.createElement('h3');
    heading.className = 'dv-facet__title';
    heading.textContent = config.label;
    section.appendChild(heading);

    if (entries.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'dv-facet__empty';
      empty.textContent = 'No facet data available.';
      section.appendChild(empty);
      container.appendChild(section);
      return;
    }

    const list = document.createElement('ul');
    list.className = 'dv-facet__list';

    entries.slice(0, limit).forEach(([value, count]) => {
      const item = document.createElement('li');
      item.className = 'dv-facet__item';
      const id = `facet-${config.key}-${value}`.replace(/[^a-z0-9_-]+/gi, '-');

      const label = document.createElement('label');
      label.htmlFor = id;
      label.className = 'dv-facet__label';

      const input = document.createElement('input');
      input.type = 'checkbox';
      input.id = id;
      input.className = 'dv-facet__checkbox';

      if (config.type === 'range') {
        const year = Number.parseInt(value, 10);
        if (Number.isNaN(year)) {
          input.disabled = true;
        } else {
          const selectedYears = deriveYearSelection(state);
          input.checked = selectedYears.includes(year);
          input.addEventListener('change', () => {
            onChange(buildRangeState(state, year, input.checked));
          });
        }
      } else {
        const key = config.stateKey ?? (config.key as FacetConfig['stateKey']);
        const current = new Set(
          key && Array.isArray((state as Record<string, unknown>)[key])
            ? ((state as Record<string, unknown>)[key] as string[])
            : []
        );
        input.checked = current.has(value);
        input.addEventListener('change', () => {
          if (!key) return;
          const next = new Set(current);
          if (input.checked) {
            next.add(value);
          } else {
            next.delete(value);
          }
          const updated = { ...state, page: 1 };
          if (key === 'type') {
            updated.type = ensureTypes(Array.from(next));
          } else {
            const arr = Array.from(next);
            if (arr.length > 0) {
              (updated as Record<string, unknown>)[key] = arr;
            } else {
              delete (updated as Record<string, unknown>)[key];
            }
          }
          onChange(updated);
        });
      }

      const name = document.createElement('span');
      name.className = 'dv-facet__name';
      name.textContent = formatLabel(value);

      const countEl = document.createElement('span');
      countEl.className = 'dv-facet__count';
      countEl.textContent = count.toLocaleString();

      label.append(input, name, countEl);
      item.appendChild(label);
      list.appendChild(item);
    });

    section.appendChild(list);
    container.appendChild(section);
  });

  return container;
};
