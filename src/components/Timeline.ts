import { axisBottom, axisLeft } from "d3-axis";
import { extent } from "d3-array";
import { scaleLinear } from "d3-scale";
import { curveMonotoneX, line } from "d3-shape";
import { select } from "d3-selection";

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
  setSeries: (nextSeries: TimelineSeries[]) => void;
};

const WIDTH = 720;
const HEIGHT = 320;
const MARGIN = { top: 24, right: 24, bottom: 48, left: 56 };

const COLORS = [
  "#1f77b4",
  "#ff7f0e",
  "#2ca02c",
  "#d62728",
  "#9467bd",
  "#8c564b",
  "#e377c2",
  "#7f7f7f",
];

const toDecadeLabel = (value: number): string => {
  const decade = Math.round(value / 10) * 10;
  return `${decade}s`;
};

const normalizeSeries = (series: TimelineSeries[]): TimelineSeries[] => {
  return series
    .map((entry) => ({
      name: entry.name,
      points: Array.isArray(entry.points)
        ? entry.points.filter((point) =>
            Number.isFinite(point.x) && Number.isFinite(point.y)
          )
        : [],
    }))
    .filter((entry) => entry.points.length > 0);
};

export const createTimeline = ({ series }: TimelineProps): TimelineHandle => {
  const container = document.createElement("div");
  container.className = "chart chart--timeline";

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${WIDTH} ${HEIGHT}`);
  svg.setAttribute("role", "img");
  svg.classList.add("chart__svg");

  const legend = document.createElement("ul");
  legend.className = "chart__legend";

  const emptyState = document.createElement("p");
  emptyState.className = "chart__empty";
  emptyState.textContent = "No timeline data available";

  container.append(svg, legend, emptyState);

  const root = select(svg);
  const plot = root
    .append("g")
    .attr("class", "chart__plot")
    .attr("transform", `translate(${MARGIN.left}, ${MARGIN.top})`);

  const xAxisGroup = root
    .append("g")
    .attr("class", "chart__axis chart__axis--x")
    .attr("transform", `translate(0, ${HEIGHT - MARGIN.bottom})`);

  const yAxisGroup = root
    .append("g")
    .attr("class", "chart__axis chart__axis--y")
    .attr("transform", `translate(${MARGIN.left}, 0)`);

  const linesGroup = plot.append("g").attr("class", "chart__series");

  const renderLegend = (entries: TimelineSeries[]): void => {
    legend.innerHTML = "";
    entries.forEach((entry, index) => {
      const item = document.createElement("li");
      item.className = "chart__legend-item";

      const swatch = document.createElement("span");
      swatch.className = "chart__legend-swatch";
      swatch.style.backgroundColor = COLORS[index % COLORS.length];

      const label = document.createElement("span");
      label.className = "chart__legend-label";
      label.textContent = entry.name;

      item.append(swatch, label);
      legend.appendChild(item);
    });
    legend.hidden = entries.length === 0;
  };

  const render = (entries: TimelineSeries[]): void => {
    const normalized = normalizeSeries(entries);
    if (normalized.length === 0) {
      emptyState.hidden = false;
      linesGroup.selectAll("path").remove();
      xAxisGroup.selectAll("g").remove();
      yAxisGroup.selectAll("g").remove();
      renderLegend([]);
      return;
    }

    emptyState.hidden = true;

    const allPoints = normalized.flatMap((entry) => entry.points);
    const xValues = allPoints.map((point) => point.x);
    const yValues = allPoints.map((point) => point.y);
    const [minX, maxX] = extent(xValues) as [
      number | undefined,
      number | undefined
    ];
    const [minY, maxY] = extent(yValues) as [
      number | undefined,
      number | undefined
    ];

    const xDomain: [number, number] =
      typeof minX === "number" && typeof maxX === "number"
        ? minX === maxX
          ? [minX - 10, maxX + 10]
          : [minX, maxX]
        : [0, 10];

    const yMax =
      typeof maxY === "number"
        ? maxY === 0
          ? 1
          : maxY
        : 1;

    const xScale = scaleLinear()
      .domain(xDomain)
      .range([MARGIN.left, WIDTH - MARGIN.right]);

    const yScale = scaleLinear()
      .domain([0, yMax])
      .nice()
      .range([HEIGHT - MARGIN.bottom, MARGIN.top]);

    const lineGenerator = line<TimelinePoint>()
      .x((point: TimelinePoint) => xScale(point.x))
      .y((point: TimelinePoint) => yScale(point.y))
      .curve(curveMonotoneX);

    const axisBottomGenerator = axisBottom(xScale)
      .ticks(8)
      .tickFormat((value: number | { valueOf(): number }) =>
        toDecadeLabel(Number(value))
      );
    const axisLeftGenerator = axisLeft(yScale).ticks(6);

    xAxisGroup.call(axisBottomGenerator as never);
    yAxisGroup.call(axisLeftGenerator as never);

    const selection = linesGroup
      .selectAll<SVGPathElement, TimelineSeries>("path")
      .data(normalized, (entry: TimelineSeries) => entry.name);

    selection.exit().remove();

    selection
      .enter()
      .append("path")
      .attr("class", "chart__line")
      .attr("fill", "none")
      .attr("stroke-width", 2)
      .merge(selection)
      .attr("stroke", (_: TimelineSeries, index: number) => COLORS[index % COLORS.length])
      .attr("d", (entry: TimelineSeries) => lineGenerator(entry.points) ?? "");

    renderLegend(normalized);
  };

  render(series);

  return {
    element: container,
    setSeries: (nextSeries: TimelineSeries[]) => {
      render(nextSeries);
    },
  };
};
