import { SearchState } from '../lib/types';

type FacetKey = 'classification' | 'century';

type FacetDefinition = {
  key: FacetKey;
  label: string;
};

type FacetCounts = Record<string, Record<string, number>>;

type OnChange = (state: SearchState) => void;

const getValues = (state: SearchState, key: FacetKey): string[] | undefined => {
  return key === 'classification' ? state.classification : state.century;
};

const setValues = (state: SearchState, key: FacetKey, values: string[] | undefined): SearchState => {
  if (key === 'classification') {
    return { ...state, classification: values };
  }
  return { ...state, century: values };
};

const sortEntries = (entries: [string, number][]): [string, number][] => {
  return entries.sort((a, b) => {
    if (b[1] === a[1]) {
      return a[0].localeCompare(b[0], undefined, { sensitivity: 'base' });
    }
    return b[1] - a[1];
  });
};

const createOption = (
  facet: FacetDefinition,
  value: string,
  count: number,
  state: SearchState,
  onChange: OnChange,
): HTMLLIElement => {
  const li = document.createElement('li');
  const id = `${facet.key}-${value}`.replace(/[^a-z0-9_-]/gi, '_');

  const label = document.createElement('label');
  label.className = 'facet-option';
  label.setAttribute('for', id);

  const input = document.createElement('input');
  input.type = 'checkbox';
  input.id = id;
  input.name = facet.key;
  input.value = value;
  input.checked = getValues(state, facet.key)?.includes(value) ?? false;

  input.addEventListener('change', () => {
    const current = new Set(getValues(state, facet.key) ?? []);
    if (input.checked) {
      current.add(value);
    } else {
      current.delete(value);
    }
    const nextValues = current.size > 0 ? Array.from(current) : undefined;
    const nextState = setValues({ ...state, page: 1 }, facet.key, nextValues);
    onChange(nextState);
  });

  const text = document.createElement('span');
  text.className = 'facet-option__label';
  text.textContent = value;

  const badge = document.createElement('span');
  badge.className = 'facet-option__count';
  badge.textContent = String(count);

  label.append(input, text, badge);
  li.appendChild(label);
  return li;
};

const createClearButton = (facet: FacetDefinition, state: SearchState, onChange: OnChange): HTMLButtonElement => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'facet__clear';
  button.textContent = 'Clear';
  button.disabled = !(getValues(state, facet.key)?.length);
  button.addEventListener('click', () => {
    if (!getValues(state, facet.key)?.length) return;
    const nextState = setValues({ ...state, page: 1 }, facet.key, undefined);
    onChange(nextState);
  });
  return button;
};

export const Facets = (
  definitions: FacetDefinition[],
  data: FacetCounts,
  state: SearchState,
  onChange: OnChange,
): HTMLElement => {
  const container = document.createElement('aside');
  container.className = 'facets';

  definitions.forEach((facet) => {
    const wrapper = document.createElement('section');
    wrapper.className = 'facet';

    const header = document.createElement('header');
    header.className = 'facet__header';

    const title = document.createElement('h3');
    title.textContent = facet.label;
    header.appendChild(title);

    header.appendChild(createClearButton(facet, state, onChange));
    wrapper.appendChild(header);

    const list = document.createElement('ul');
    list.className = 'facet__list';

    const counts = data[facet.key] ?? {};
    const selected = getValues(state, facet.key) ?? [];

    const entries = sortEntries(Object.entries(counts));
    for (const [value, count] of entries) {
      list.appendChild(createOption(facet, value, count, state, onChange));
    }

    // Ensure selected values always visible even when count missing from page-level aggregation
    for (const value of selected) {
      if (counts[value] != null) continue;
      list.appendChild(createOption(facet, value, 0, state, onChange));
    }

    if (!list.children.length) {
      const empty = document.createElement('p');
      empty.className = 'facet__empty';
      empty.textContent = 'No facet data yet';
      wrapper.appendChild(empty);
    } else {
      wrapper.appendChild(list);
    }

    container.appendChild(wrapper);
  });

  return container;
};
