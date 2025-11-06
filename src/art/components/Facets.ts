import type { SearchState } from '../lib/types';

export type FacetCounts = Record<string, Record<string, number>>;

type SelectionMode = 'multi' | 'single';

type ValueGetter<State> = (state: State) => string[] | undefined;
type ValueSetter<State> = (state: State, values: string[] | undefined) => State;
type ValueFormatter = (value: string) => string;

type FacetDefinitionBase<State> = {
  key: string;
  label: string;
  facetKey?: string;
  getValues?: ValueGetter<State>;
  setValues?: ValueSetter<State>;
  selection?: SelectionMode;
  formatValue?: ValueFormatter;
  limit?: number;
};

export type FacetDefinition<State> = FacetDefinitionBase<State>;

const DEFAULT_LIMIT = 50;
const numberFormatter = new Intl.NumberFormat();

const sortEntries = (entries: [string, number][]): [string, number][] => {
  return entries
    .filter((entry) => entry[0] !== undefined && entry[0] !== null)
    .sort((a, b) => {
      if (b[1] === a[1]) {
        return a[0].localeCompare(b[0], undefined, { sensitivity: 'base' });
      }
      return b[1] - a[1];
    });
};

const defaultGetValues = <State>(state: State, key: string): string[] | undefined => {
  const record = state as Record<string, unknown>;
  const value = record[key];
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
  }
  if (typeof value === 'string' && value.length > 0) {
    return [value];
  }
  return undefined;
};

const defaultSetValues = <State>(state: State, key: string, values: string[] | undefined): State => {
  const clone: Record<string, unknown> = { ...(state as Record<string, unknown>) };
  if (!values || values.length === 0) {
    delete clone[key];
  } else {
    clone[key] = values;
  }
  return clone as State;
};

const resolveGetter = <State>(definition: FacetDefinition<State>): ValueGetter<State> => {
  if (definition.getValues) return definition.getValues;
  return (state) => defaultGetValues(state, definition.key);
};

const resolveSetter = <State>(definition: FacetDefinition<State>): ValueSetter<State> => {
  if (definition.setValues) return definition.setValues;
  return (state, values) => defaultSetValues(state, definition.key, values);
};

const resolveFacetKey = <State>(definition: FacetDefinition<State>): string => {
  return definition.facetKey ?? definition.key;
};

const renderOption = <State>(
  definition: FacetDefinition<State>,
  value: string,
  count: number,
  state: State,
  onChange: (next: State) => void,
): HTMLLIElement => {
  const getter = resolveGetter(definition);
  const setter = resolveSetter(definition);
  const selectedValues = new Set(getter(state) ?? []);
  const selectionMode: SelectionMode = definition.selection ?? 'multi';

  const li = document.createElement('li');
  const id = `${definition.key}-${value}`.replace(/[^a-z0-9_-]/gi, '_');

  const label = document.createElement('label');
  label.className = 'facet-option';
  label.setAttribute('for', id);

  const input = document.createElement('input');
  input.type = 'checkbox';
  input.id = id;
  input.name = definition.key;
  input.value = value;
  input.checked = selectedValues.has(value);

  input.addEventListener('change', () => {
    const baseState = { ...(state as Record<string, unknown>) } as State;
    let nextValues: string[] | undefined;
    if (selectionMode === 'single') {
      nextValues = input.checked ? [value] : undefined;
    } else {
      const nextSet = new Set(selectedValues);
      if (input.checked) {
        nextSet.add(value);
      } else {
        nextSet.delete(value);
      }
      nextValues = nextSet.size > 0 ? Array.from(nextSet) : undefined;
    }
    const nextState = setter(baseState, nextValues);
    onChange(nextState);
  });

  const text = document.createElement('span');
  text.className = 'facet-option__label';
  text.textContent = definition.formatValue ? definition.formatValue(value) : value;

  const badge = document.createElement('span');
  badge.className = 'facet-option__count';
  badge.textContent = numberFormatter.format(count);

  label.append(input, text, badge);
  li.appendChild(label);
  return li;
};

const createClearButton = <State>(
  definition: FacetDefinition<State>,
  state: State,
  onChange: (next: State) => void,
): HTMLButtonElement => {
  const getter = resolveGetter(definition);
  const setter = resolveSetter(definition);
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'facet__clear';
  button.textContent = 'Clear';
  button.disabled = (getter(state)?.length ?? 0) === 0;
  button.addEventListener('click', () => {
    if (getter(state)?.length) {
      const baseState = { ...(state as Record<string, unknown>) } as State;
      const nextState = setter(baseState, undefined);
      onChange(nextState);
    }
  });
  return button;
};

const createToggleButton = (expanded: { current: boolean }, render: () => void, total: number, limit: number) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'facet__more';
  const update = () => {
    if (expanded.current) {
      button.textContent = 'Show fewer';
      button.setAttribute('aria-expanded', 'true');
    } else {
      const remaining = Math.max(total - limit, 0);
      button.textContent = `Show all (+${remaining})`;
      button.setAttribute('aria-expanded', 'false');
    }
  };
  button.addEventListener('click', () => {
    expanded.current = !expanded.current;
    update();
    render();
  });
  update();
  return button;
};

export const Facets = <State>(
  definitions: FacetDefinition<State>[],
  data: FacetCounts,
  state: State,
  onChange: (next: State) => void,
): HTMLElement => {
  const container = document.createElement('aside');
  container.className = 'facets';

  definitions.forEach((definition) => {
    const wrapper = document.createElement('section');
    wrapper.className = 'facet';

    const header = document.createElement('header');
    header.className = 'facet__header';

    const title = document.createElement('h3');
    title.textContent = definition.label;
    header.appendChild(title);
    header.appendChild(createClearButton(definition, state, onChange));

    const list = document.createElement('ul');
    list.className = 'facet__list';

    const facetKey = resolveFacetKey(definition);
    const counts = data[facetKey] ?? {};
    const entries = sortEntries(Object.entries(counts));
    const getter = resolveGetter(definition);
    const selectedValues = new Set(getter(state) ?? []);

    const limit = definition.limit ?? DEFAULT_LIMIT;
    const expanded = { current: false };

    const renderList = () => {
      list.replaceChildren();
      const combined = new Map<string, number>();
      for (const [value, count] of entries) {
        combined.set(value, count);
      }
      for (const value of selectedValues) {
        if (!combined.has(value)) {
          combined.set(value, counts[value] ?? 0);
        }
      }
      const combinedEntries = Array.from(combined.entries());
      const hasOverflow = combinedEntries.length > limit;
      const visibleEntries = expanded.current || !hasOverflow ? combinedEntries : combinedEntries.slice(0, limit);

      if (!expanded.current && hasOverflow) {
        const visibleSet = new Set(visibleEntries.map(([value]) => value));
        for (const value of selectedValues) {
          if (!visibleSet.has(value)) {
            visibleEntries.push([value, combined.get(value) ?? 0]);
            visibleSet.add(value);
          }
        }
      }

      if (visibleEntries.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'facet__empty';
        empty.textContent = 'No facet data yet';
        list.replaceChildren(empty);
        return;
      }

      const fragment = document.createDocumentFragment();
      for (const [value, count] of visibleEntries) {
        fragment.appendChild(renderOption(definition, value, count, state, onChange));
      }
      list.appendChild(fragment);
    };

    renderList();

    wrapper.appendChild(header);
    wrapper.appendChild(list);

    if (entries.length > limit) {
      const toggle = createToggleButton(expanded, renderList, entries.length, limit);
      wrapper.appendChild(toggle);
    }

    container.appendChild(wrapper);
  });

  return container;
};

export type PrincetonFacetDefinition = FacetDefinition<SearchState>;
