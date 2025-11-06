export type VirtualListProps<T> = {
  items: readonly T[];
  rowHeight: number;
  renderItem: (item: T, index: number) => HTMLElement;
  overscan?: number;
};

export type VirtualListHandle<T> = {
  element: HTMLElement;
  setItems: (items: readonly T[]) => void;
  destroy: () => void;
};

const clamp = (value: number, min: number, max: number): number => {
  return Math.min(Math.max(value, min), max);
};

const createRow = <T>(
  item: T,
  index: number,
  rowHeight: number,
  renderItem: (item: T, index: number) => HTMLElement,
): HTMLElement => {
  const row = document.createElement('div');
  row.className = 'virtual-list__row';
  row.style.minHeight = `${rowHeight}px`;
  row.style.boxSizing = 'border-box';
  row.style.width = '100%';
  row.appendChild(renderItem(item, index));
  return row;
};

export const createVirtualList = <T>({
  items,
  rowHeight,
  renderItem,
  overscan = 3,
}: VirtualListProps<T>): VirtualListHandle<T> => {
  let currentItems: readonly T[] = items;
  let startIndex = 0;
  let endIndex = 0;

  const container = document.createElement('div');
  container.className = 'virtual-list';
  container.style.position = 'relative';

  const sentinel = document.createElement('div');
  sentinel.className = 'virtual-list__sentinel';
  sentinel.style.width = '100%';
  sentinel.style.height = `${currentItems.length * rowHeight}px`;

  const content = document.createElement('div');
  content.className = 'virtual-list__content';
  content.style.position = 'absolute';
  content.style.top = '0';
  content.style.left = '0';
  content.style.right = '0';

  container.append(sentinel, content);

  const renderRange = (from: number, to: number): void => {
    if (from === startIndex && to === endIndex) {
      return;
    }

    startIndex = from;
    endIndex = to;

    content.innerHTML = '';
    if (startIndex >= endIndex) {
      return;
    }

    const fragment = document.createDocumentFragment();
    for (let index = startIndex; index < endIndex; index += 1) {
      const item = currentItems[index];
      fragment.appendChild(createRow(item, index, rowHeight, renderItem));
    }
    content.style.transform = `translateY(${startIndex * rowHeight}px)`;
    content.appendChild(fragment);
  };

  const computeVisibleRange = (): { from: number; to: number } => {
    const rect = container.getBoundingClientRect();
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    const viewportTop = window.scrollY;
    const viewportBottom = viewportTop + viewportHeight;
    const containerTop = window.scrollY + rect.top;
    const totalHeight = currentItems.length * rowHeight;
    const containerBottom = containerTop + totalHeight;

    if (viewportBottom < containerTop || viewportTop > containerBottom) {
      return { from: 0, to: 0 };
    }

    const start = Math.floor((viewportTop - containerTop) / rowHeight) - overscan;
    const end = Math.ceil((viewportBottom - containerTop) / rowHeight) + overscan;

    const clampedStart = clamp(start, 0, currentItems.length);
    const clampedEnd = clamp(end, 0, currentItems.length);

    return { from: clampedStart, to: Math.max(clampedStart, clampedEnd) };
  };

  const updateVisibleRows = (): void => {
    const { from, to } = computeVisibleRange();
    renderRange(from, to);
  };

  const handleScroll = (): void => {
    updateVisibleRows();
  };

  const handleResize = (): void => {
    updateVisibleRows();
  };

  const observer =
    typeof ResizeObserver === 'function'
      ? new ResizeObserver(() => {
          updateVisibleRows();
        })
      : null;

  observer?.observe(container);
  window.addEventListener('scroll', handleScroll, { passive: true });
  window.addEventListener('resize', handleResize);

  const setItems = (nextItems: readonly T[]): void => {
    currentItems = nextItems;
    sentinel.style.height = `${currentItems.length * rowHeight}px`;
    startIndex = 0;
    endIndex = 0;
    updateVisibleRows();
  };

  setItems(items);
  requestAnimationFrame(() => {
    updateVisibleRows();
  });

  const destroy = (): void => {
    observer?.disconnect();
    window.removeEventListener('scroll', handleScroll);
    window.removeEventListener('resize', handleResize);
  };

  return {
    element: container,
    setItems,
    destroy,
  };
};
