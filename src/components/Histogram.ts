import {
  axisBottom,
  axisLeft,
  bin,
  extent,
  max,
  scaleLinear,
  select,
  type Bin,
} from "d3";

export type HistogramProps = {
  values: number[];
  bins?: number;
};

export type HistogramHandle = {
  element: HTMLElement;
  setValues: (values: number[]) => void;
};

const WIDTH = 360;
const HEIGHT = 240;
const MARGIN = { top: 16, right: 16, bottom: 48, left: 48 };

export const createHistogram = ({ values, bins }: HistogramProps): HistogramHandle => {
  const container = document.createElement("div");
  container.className = "chart chart--histogram";

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${WIDTH} ${HEIGHT}`);
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("chart__svg");

  const emptyState = document.createElement("p");
  emptyState.className = "chart__empty";
  emptyState.textContent = "No data available";

  container.append(svg, emptyState);

  const root = select(svg);
  const barsGroup = root.append("g").attr("class", "chart__bars");
  const xAxisGroup = root
    .append("g")
    .attr("class", "chart__axis chart__axis--x")
    .attr("transform", `translate(0, ${HEIGHT - MARGIN.bottom})`);
  const yAxisGroup = root
    .append("g")
    .attr("class", "chart__axis chart__axis--y")
    .attr("transform", `translate(${MARGIN.left}, 0)`);

  const yAxisLabel = root
    .append("text")
    .attr("class", "chart__axis-label chart__axis-label--y")
    .attr("text-anchor", "middle")
    .attr("transform", "rotate(-90)")
    .attr("x", -(HEIGHT / 2))
    .attr("y", 16)
    .text("Count");

  const render = (series: number[]): void => {
    const filtered = Array.isArray(series)
      ? series.filter((value) => Number.isFinite(value) && value >= 0)
      : [];

    if (filtered.length === 0) {
      emptyState.hidden = false;
      barsGroup.selectAll("rect").remove();
      xAxisGroup.selectAll("*").remove();
      yAxisGroup.selectAll("*").remove();
      return;
    }

    emptyState.hidden = true;

    const [min, maxValue] = extent(filtered) as [number | undefined, number | undefined];
    if (typeof min !== "number" || typeof maxValue !== "number") {
      emptyState.hidden = false;
      barsGroup.selectAll("rect").remove();
      xAxisGroup.selectAll("*").remove();
      yAxisGroup.selectAll("*").remove();
      return;
    }

    const domain: [number, number] = min === maxValue ? [min - 1, maxValue + 1] : [min, maxValue];

    const thresholdCount =
      typeof bins === "number" && bins > 0 ? bins : Math.min(filtered.length, 12);

    const histogram = bin<number, number>()
      .domain(domain)
      .thresholds(thresholdCount);

    const binsData = histogram(filtered) as Bin<number, number>[];

    const x = scaleLinear().domain(domain).range([MARGIN.left, WIDTH - MARGIN.right]);

    const maxBinValue = max(binsData, (binEntry: Bin<number, number>) => binEntry.length) ?? 1;
    const y = scaleLinear()
      .domain([0, maxBinValue])
      .nice()
      .range([HEIGHT - MARGIN.bottom, MARGIN.top]);

    const bars = barsGroup
      .selectAll<SVGRectElement, typeof binsData[number]>("rect")
      .data(binsData);

    bars
      .join("rect")
      .attr("class", "chart__histogram-bar")
      .attr("x", (d: Bin<number, number>) => x(d.x0 ?? domain[0]))
      .attr("width", (d: Bin<number, number>) => {
        const x0 = x(d.x0 ?? domain[0]);
        const x1 = x(d.x1 ?? domain[1]);
        return Math.max(0, x1 - x0 - 1);
      })
      .attr("y", (d: Bin<number, number>) => y(d.length))
      .attr("height", (d: Bin<number, number>) =>
        Math.max(0, (HEIGHT - MARGIN.bottom) - y(d.length))
      );

    xAxisGroup.call(axisBottom(x).ticks(6).tickSizeOuter(0));
    yAxisGroup.call(axisLeft(y).ticks(4).tickSizeOuter(0));

    yAxisLabel.style("display", null);
  };

  render(values);

  return {
    element: container,
    setValues: (series: number[]) => {
      render(series);
    },
  };
};
