export type SearchFormFieldOption = {
  value: string;
  label: string;
};

export type SearchFormField = {
  name: string;
  label: string;
  type: 'text' | 'select' | 'number';
  placeholder?: string;
  options?: SearchFormFieldOption[];
  value?: string;
};

export type SearchFormProps = {
  fields: SearchFormField[];
  submitLabel?: string;
  onSubmit: (values: Record<string, string>) => void;
};

export type SearchFormHandle = {
  element: HTMLFormElement;
  getValues: () => Record<string, string>;
  setValues: (values: Record<string, string | undefined>) => void;
};

const createControl = (
  field: SearchFormField,
  value: string,
  onChange: (name: string, value: string) => void,
): HTMLInputElement | HTMLSelectElement => {
  if (field.type === 'select') {
    const select = document.createElement('select');
    select.name = field.name;
    select.className = 'search-form__control';
    if (field.placeholder) {
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = field.placeholder;
      select.appendChild(placeholder);
    }
    (field.options ?? []).forEach((option) => {
      const optionEl = document.createElement('option');
      optionEl.value = option.value;
      optionEl.textContent = option.label;
      select.appendChild(optionEl);
    });
    select.value = value;
    select.addEventListener('change', () => onChange(field.name, select.value));
    return select;
  }

  const input = document.createElement('input');
  input.name = field.name;
  input.type = field.type === 'number' ? 'number' : 'text';
  input.className = 'search-form__control';
  if (field.placeholder) {
    input.placeholder = field.placeholder;
  }
  input.value = value;
  input.addEventListener('input', () => onChange(field.name, input.value));
  return input;
};

export const createSearchForm = ({ fields, submitLabel = 'Search', onSubmit }: SearchFormProps): SearchFormHandle => {
  const form = document.createElement('form');
  form.className = 'search-form';

  const state = new Map<string, string>();
  const controls = new Map<string, HTMLInputElement | HTMLSelectElement>();

  const setStateValue = (name: string, value: string): void => {
    state.set(name, value);
    const control = controls.get(name);
    if (control && control.value !== value) {
      control.value = value;
    }
  };

  fields.forEach((field) => {
    const wrapper = document.createElement('label');
    wrapper.className = 'search-form__field';

    const labelText = document.createElement('span');
    labelText.className = 'search-form__label';
    labelText.textContent = field.label;
    wrapper.appendChild(labelText);

    const initialValue = field.value ?? '';
    state.set(field.name, initialValue);
    const control = createControl(field, initialValue, (name, value) => {
      state.set(name, value);
    });

    controls.set(field.name, control);
    wrapper.appendChild(control);
    form.appendChild(wrapper);
  });

  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'search-form__submit';
  submit.textContent = submitLabel;
  form.appendChild(submit);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const values: Record<string, string> = {};
    state.forEach((value, name) => {
      values[name] = value.trim();
    });
    onSubmit(values);
  });

  const getValues = (): Record<string, string> => {
    const values: Record<string, string> = {};
    state.forEach((value, name) => {
      values[name] = value;
    });
    return values;
  };

  const setValues = (values: Record<string, string | undefined>): void => {
    Object.entries(values).forEach(([name, value]) => {
      const nextValue = typeof value === 'string' ? value : '';
      setStateValue(name, nextValue);
    });
  };

  return { element: form, getValues, setValues };
};
