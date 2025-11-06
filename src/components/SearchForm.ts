export type SearchFormFieldOption = {
  value: string;
  label: string;
};

export type SearchFormField = {
  name: string;
  label: string;
  type: "text" | "select";
  placeholder?: string;
  options?: SearchFormFieldOption[];
  value?: string;
};

export type SearchFormProps = {
  fields: SearchFormField[];
  onSubmit: (query: Record<string, string>) => void;
};

export type SearchFormHandle = {
  element: HTMLFormElement;
  setValues: (values: Record<string, string | undefined>) => void;
};

export const createSearchForm = ({
  fields,
  onSubmit,
}: SearchFormProps): SearchFormHandle => {
  const form = document.createElement("form");
  form.className = "search-form";

  const fieldMap = new Map<string, HTMLInputElement | HTMLSelectElement>();

  fields.forEach((field) => {
    const fieldWrapper = document.createElement("label");
    fieldWrapper.className = "search-form__field";

    const labelText = document.createElement("span");
    labelText.className = "search-form__label";
    labelText.textContent = field.label;
    fieldWrapper.appendChild(labelText);

    if (field.type === "select") {
      const select = document.createElement("select");
      select.name = field.name;
      select.className = "search-form__control";

      if (field.placeholder) {
        const placeholderOption = document.createElement("option");
        placeholderOption.value = "";
        placeholderOption.textContent = field.placeholder;
        select.appendChild(placeholderOption);
      }

      (field.options ?? []).forEach((option) => {
        const optionEl = document.createElement("option");
        optionEl.value = option.value;
        optionEl.textContent = option.label;
        if (option.value === field.value) {
          optionEl.selected = true;
        }
        select.appendChild(optionEl);
      });

      if (typeof field.value === "string") {
        select.value = field.value;
      }

      fieldWrapper.appendChild(select);
      fieldMap.set(field.name, select);
    } else {
      const input = document.createElement("input");
      input.name = field.name;
      input.type = field.type;
      input.className = "search-form__control";
      if (field.placeholder) {
        input.placeholder = field.placeholder;
      }
      if (typeof field.value === "string") {
        input.value = field.value;
      }

      fieldWrapper.appendChild(input);
      fieldMap.set(field.name, input);
    }

    form.appendChild(fieldWrapper);
  });

  const submit = document.createElement("button");
  submit.type = "submit";
  submit.className = "search-form__submit";
  submit.textContent = "Search";
  form.appendChild(submit);

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    const query: Record<string, string> = {};
    fieldMap.forEach((control, name) => {
      const value = control.value.trim();
      query[name] = value;
    });

    onSubmit(query);
  });

  const setValues = (values: Record<string, string | undefined>): void => {
    Object.entries(values).forEach(([name, value]) => {
      const control = fieldMap.get(name);
      if (!control) return;
      control.value = typeof value === "string" ? value : "";
    });
  };

  return { element: form, setValues };
};
