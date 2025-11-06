import {
  axisBottom,
  axisLeft,
  curveMonotoneX,
  extent,
  line,
  scaleLinear,
  scaleOrdinal,
  select,
} from 'd3';
import { getChartPalette } from '../lib/chartPalette';

export type TimelinePoint = { x: number; y: number };

export type TimelineSeries = {
  name: string;
  points: TimelinePoint[];
};

export type TimelineProps = {
  series: TimelineSeries[];
};

export type TimelineHandle = {
  element: HTMLElement;
  setSeries: (series: TimelineSeries[]) => void;
};

const WIDTH = 640;
const HEIGHT = 320;
const MARGIN = { top: 16, right: 24, bottom: 48, left: 48 };

const formatDecade = (value: number): string => {
  if (!Number.isFinite(value)) {
    return '';
  }
  const rounded = Math.trunc(value / 10) * 10;
  return `${rounded}s`;
};

const createLegend = (): HTMLUListElement => {
  const legend = document.createElement('ul');
  legend.className = 'timeline-legend';
  return legend;
};

const updateLegend = (
  legend: HTMLUListElement,
  series: TimelineSeries[],
  color: ReturnType<typeof scaleOrdinal<string, string>>,
): void => {
  legend.innerHTML = '';
  series.forEach((entry) => {
    const item = document.createElement('li');
    item.className = 'timeline-legend__item';

    const swatch = document.createElement('span');
    swatch.className = 'timeline-legend__swatch';
    swatch.style.backgroundColor = color(entry.name);

    const label = document.createElement('span');
    label.textContent = entry.name;

    item.append(swatch, label);
    legend.appendChild(item);
  });
};

export const createTimeline = ({ series }: TimelineProps): TimelineHandle => {
  const container = document.createElement('div');
  container.className = 'chart chart--timeline';

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${WIDTH} ${HEIGHT}`);
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('chart__svg');

  const legend = createLegend();

  const emptyState = document.createElement('p');
  emptyState.className = 'chart__empty';
  emptyState.textContent = 'No timeline data available';

  container.append(svg, legend, emptyState);

  const root = select(svg);
  const xAxisGroup = root
    .append('g')
    .attr('class', 'chart__axis')
    .attr('transform', `translate(0, ${HEIGHT - MARGIN.bottom})`);
  const yAxisGroup = root
    .append('g')
    .attr('class', 'chart__axis')
    .attr('transform', `translate(${MARGIN.left}, 0)`);
  const linesGroup = root.append('g').attr('class', 'timeline-lines');

  const colorScale = scaleOrdinal<string, string>().range(getChartPalette());

  const render = (seriesData: TimelineSeries[]): void => {
    const filtered = seriesData
      .map((entry) => ({
        name: entry.name,
        points: [...entry.points].sort((a, b) => a.x - b.x),
      }))
      .filter((entry) => entry.points.length > 0);

    if (filtered.length === 0) {
      emptyState.hidden = false;
      svg.setAttribute('aria-hidden', 'true');
      linesGroup.selectAll('*').remove();
      legend.innerHTML = '';
      return;
    }

    emptyState.hidden = true;
    svg.removeAttribute('aria-hidden');

    const allX = filtered.flatMap((entry) => entry.points.map((point) => point.x));
    const allY = filtered.flatMap((entry) => entry.points.map((point) => point.y));

    const [minX, maxX] = extent(allX) as [number | undefined, number | undefined];
    const [minY, maxY] = extent(allY) as [number | undefined, number | undefined];

    if (minX === undefined || maxX === undefined || minY === undefined || maxY === undefined) {
      linesGroup.selectAll('*').remove();
      legend.innerHTML = '';
      emptyState.hidden = false;
      return;
    }

    const paddedMinX = minX === maxX ? minX - 10 : minX;
    const paddedMaxX = minX === maxX ? maxX + 10 : maxX;
    const domainYMax = maxY === 0 ? 1 : maxY;

    const xScale = scaleLinear().domain([paddedMinX, paddedMaxX]).range([MARGIN.left, WIDTH - MARGIN.right]);
    const yScale = scaleLinear().domain([0, domainYMax]).nice().range([HEIGHT - MARGIN.bottom, MARGIN.top]);

    const uniqueDecades = Array.from(new Set(allX.map((value) => Math.trunc(value / 10) * 10))).sort(
      (a, b) => a - b,
    );
    const xAxis = axisBottom<number>(xScale)
      .tickValues(uniqueDecades)
      .tickFormat((value: number) => formatDecade(value));
    const yAxis = axisLeft<number>(yScale).ticks(5).tickFormat((value: number) => String(value));

    (xAxisGroup as unknown as { call: (fn: unknown) => void }).call(xAxis);
    (yAxisGroup as unknown as { call: (fn: unknown) => void }).call(yAxis);

    const lineGenerator = line<TimelinePoint>()
      .x((point: TimelinePoint) => xScale(point.x))
      .y((point: TimelinePoint) => yScale(point.y))
      .curve(curveMonotoneX);

    colorScale.range(getChartPalette()).domain(filtered.map((entry) => entry.name));

    const selection = linesGroup
      .selectAll<SVGPathElement, TimelineSeries>('path')
      .data(filtered, (d: TimelineSeries) => d.name);

    selection.exit().remove();

    selection
      .attr('d', (entry: TimelineSeries) => lineGenerator(entry.points) ?? '')
      .attr('stroke', (entry: TimelineSeries) => colorScale(entry.name));

    selection
      .enter()
      .append('path')
      .attr('class', 'chart__line')
      .attr('fill', 'none')
      .attr('stroke-width', 2)
      .attr('stroke', (entry: TimelineSeries) => colorScale(entry.name))
      .attr('d', (entry: TimelineSeries) => lineGenerator(entry.points) ?? '');

    updateLegend(legend, filtered, colorScale);
  };

  render(series);

  return {
    element: container,
    setSeries: (nextSeries: TimelineSeries[]) => {
      render(nextSeries);
    },
  };
};

export default createTimeline;
