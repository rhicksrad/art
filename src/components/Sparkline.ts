import { curveMonotoneX, extent, line, scaleLinear, select } from 'd3';

export type SparklineProps = {
  values: number[];
};

export type SparklineHandle = {
  element: HTMLElement;
  setValues: (values: number[]) => void;
};

const WIDTH = 360;
const HEIGHT = 100;
const MARGIN = { top: 12, right: 12, bottom: 12, left: 12 };

export const createSparkline = ({ values }: SparklineProps): SparklineHandle => {
  const container = document.createElement('div');
  container.className = 'chart chart--sparkline';

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${WIDTH} ${HEIGHT}`);
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('chart__svg');

  const emptyState = document.createElement('p');
  emptyState.className = 'chart__empty';
  emptyState.textContent = 'No data available';

  container.append(svg, emptyState);

  const root = select(svg);
  const path = root.append('path').attr('class', 'chart__line');

  const render = (series: number[]): void => {
    const filtered = Array.isArray(series) ? series.filter((value) => Number.isFinite(value)) : [];

    if (filtered.length === 0) {
      emptyState.hidden = false;
      path.attr('d', '');
      return;
    }

    emptyState.hidden = true;

    const x = scaleLinear()
      .domain([0, filtered.length > 1 ? filtered.length - 1 : 1])
      .range([MARGIN.left, WIDTH - MARGIN.right]);

    const [min, max] = extent(filtered) as [number | undefined, number | undefined];
    let domain: [number, number];
    if (typeof min !== 'number' || typeof max !== 'number') {
      domain = [0, 1];
    } else if (min === max) {
      domain = [min - 1, max + 1];
    } else {
      domain = [min, max];
    }

    const y = scaleLinear()
      .domain(domain)
      .range([HEIGHT - MARGIN.bottom, MARGIN.top]);

    const generator = line<number>()
      .x((value: number, index: number) => x(index))
      .y((value: number) => y(value))
      .curve(curveMonotoneX);

    path.attr('d', generator(filtered) ?? '');
  };

  render(values);

  return {
    element: container,
    setValues: (series: number[]) => {
      render(series);
    },
  };
};
