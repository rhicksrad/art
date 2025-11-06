import { axisBottom, axisLeft } from "d3-axis";
import { max } from "d3-array";
import { scaleBand, scaleLinear } from "d3-scale";
import { select } from "d3-selection";
import type { ChartDatum } from "../lib/analytics";

export type BarChartProps = {
  data: ChartDatum[];
  xLabel?: string;
  yLabel?: string;
};

export type BarChartHandle = {
  element: HTMLElement;
  setData: (data: ChartDatum[]) => void;
  setLabels: (labels: { xLabel?: string; yLabel?: string }) => void;
};

const WIDTH = 360;
const HEIGHT = 240;
const MARGIN = { top: 16, right: 16, bottom: 48, left: 48 };

export const createBar = ({
  data,
  xLabel,
  yLabel,
}: BarChartProps): BarChartHandle => {
  const container = document.createElement("div");
  container.className = "chart chart--bar";

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

  const xAxisLabel = root
    .append("text")
    .attr("class", "chart__axis-label chart__axis-label--x")
    .attr("text-anchor", "middle")
    .attr("x", WIDTH / 2)
    .attr("y", HEIGHT - 8);

  const yAxisLabel = root
    .append("text")
    .attr("class", "chart__axis-label chart__axis-label--y")
    .attr("text-anchor", "middle")
    .attr("transform", "rotate(-90)")
    .attr("x", -(HEIGHT / 2))
    .attr("y", 16);

  const applyLabels = ({ xLabel: nextXLabel, yLabel: nextYLabel }: {
    xLabel?: string;
    yLabel?: string;
  }): void => {
    if (nextXLabel) {
      xAxisLabel.text(nextXLabel).style("display", null);
    } else {
      xAxisLabel.text("").style("display", "none");
    }

    if (nextYLabel) {
      yAxisLabel.text(nextYLabel).style("display", null);
    } else {
      yAxisLabel.text("").style("display", "none");
    }
  };

  const render = (series: ChartDatum[]): void => {
    const filtered = Array.isArray(series)
      ? series.filter((item) => Number.isFinite(item.value) && item.value > 0)
      : [];

    if (filtered.length === 0) {
      emptyState.hidden = false;
      barsGroup.selectAll("rect").remove();
      xAxisGroup.selectAll("*").remove();
      yAxisGroup.selectAll("*").remove();
      return;
    }

    emptyState.hidden = true;

    const x = scaleBand<string>()
      .domain(filtered.map((item) => item.label))
      .range([MARGIN.left, WIDTH - MARGIN.right])
      .padding(0.2);

    const maxValue = max(filtered, (item: ChartDatum) => item.value) ?? 1;
    const y = scaleLinear()
      .domain([0, maxValue])
      .nice()
      .range([HEIGHT - MARGIN.bottom, MARGIN.top]);

    const bars = barsGroup
      .selectAll<SVGRectElement, ChartDatum>("rect")
      .data(filtered, (d: ChartDatum) => d.label);

    bars
      .join("rect")
      .attr("class", "chart__bar")
      .attr("x", (d: ChartDatum) => x(d.label) ?? MARGIN.left)
      .attr("width", x.bandwidth())
      .attr("y", (d: ChartDatum) => y(Math.max(0, d.value)))
      .attr("height", (d: ChartDatum) =>
        Math.max(0, (HEIGHT - MARGIN.bottom) - y(Math.max(0, d.value)))
      );

    xAxisGroup.call(axisBottom(x).tickSizeOuter(0));
    yAxisGroup.call(axisLeft(y).ticks(4).tickSizeOuter(0));
  };

  applyLabels({ xLabel, yLabel });
  render(data);

  return {
    element: container,
    setData: (series: ChartDatum[]) => {
      render(series);
    },
    setLabels: applyLabels,
  };
};
