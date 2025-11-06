export const createChartBlock = (title: string, chartElement: HTMLElement): HTMLElement => {
  const wrapper = document.createElement('section');
  wrapper.className = 'chart-block';

  const heading = document.createElement('h3');
  heading.className = 'chart-block__title';
  heading.textContent = title;

  wrapper.append(heading, chartElement);
  return wrapper;
};
