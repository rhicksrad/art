export type FacetBarProps = {
  ttl: number;
  onTtlChange: (value: number) => void;
  onClear: () => void;
  min?: number;
  max?: number;
};

export type FacetBarHandle = {
  element: HTMLElement;
  setTtl: (value: number) => void;
};

const formatSeconds = (value: number): string => {
  if (value < 60) {
    return `${value}s`;
  }

  const minutes = Math.floor(value / 60);
  const seconds = value % 60;

  if (minutes < 60) {
    return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  const parts: string[] = [`${hours}h`];

  if (remainingMinutes > 0) {
    parts.push(`${remainingMinutes}m`);
  }

  if (seconds > 0) {
    parts.push(`${seconds}s`);
  }

  return parts.join(' ');
};

export const createFacetBar = ({
  ttl,
  onTtlChange,
  onClear,
  min = 60,
  max = 86400,
}: FacetBarProps): FacetBarHandle => {
  const container = document.createElement('div');
  container.className = 'facet-bar';

  const ttlField = document.createElement('label');
  ttlField.className = 'facet-bar__field';

  const labelText = document.createElement('span');
  labelText.className = 'facet-bar__label';
  labelText.textContent = 'Cache TTL';
  ttlField.appendChild(labelText);

  const sliderWrapper = document.createElement('div');
  sliderWrapper.className = 'facet-bar__slider';

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = String(min);
  slider.max = String(max);
  slider.step = '60';
  slider.value = String(ttl);
  sliderWrapper.appendChild(slider);

  const valueLabel = document.createElement('span');
  valueLabel.className = 'facet-bar__value';
  valueLabel.textContent = formatSeconds(ttl);
  sliderWrapper.appendChild(valueLabel);

  ttlField.appendChild(sliderWrapper);

  const clearButton = document.createElement('button');
  clearButton.type = 'button';
  clearButton.className = 'facet-bar__clear';
  clearButton.textContent = 'Clear cache';

  const updateValue = (next: number): void => {
    slider.value = String(next);
    valueLabel.textContent = formatSeconds(next);
  };

  slider.addEventListener('input', () => {
    const nextValue = Number.parseInt(slider.value, 10);
    if (Number.isNaN(nextValue)) {
      return;
    }
    updateValue(nextValue);
    onTtlChange(nextValue);
  });

  clearButton.addEventListener('click', () => {
    onClear();
  });

  container.append(ttlField, clearButton);

  return {
    element: container,
    setTtl: (value: number) => {
      updateValue(value);
    },
  };
};
