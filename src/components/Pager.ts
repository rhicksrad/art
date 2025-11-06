export type PagerProps = {
  page: number;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
};

type PagerState = Pick<PagerProps, 'page' | 'hasPrev' | 'hasNext'>;

export type PagerElement = HTMLElement & {
  update: (state: PagerState) => void;
};

export const createPager = ({
  page,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
}: PagerProps): PagerElement => {
  const nav = document.createElement('nav') as PagerElement;
  nav.className = 'pager';
  nav.setAttribute('aria-label', 'Pagination');

  const prevButton = document.createElement('button');
  prevButton.type = 'button';
  prevButton.className = 'pager__button pager__button--prev';
  prevButton.textContent = 'Previous';
  prevButton.addEventListener('click', (event) => {
    event.preventDefault();
    if (currentState.hasPrev) {
      onPrev();
    }
  });

  const status = document.createElement('span');
  status.className = 'pager__status';

  const nextButton = document.createElement('button');
  nextButton.type = 'button';
  nextButton.className = 'pager__button pager__button--next';
  nextButton.textContent = 'Next';
  nextButton.addEventListener('click', (event) => {
    event.preventDefault();
    if (currentState.hasNext) {
      onNext();
    }
  });

  nav.append(prevButton, status, nextButton);

  let currentState: PagerState = { page, hasPrev, hasNext };

  const update = (state: PagerState): void => {
    currentState = state;
    prevButton.disabled = !state.hasPrev;
    nextButton.disabled = !state.hasNext;
    status.textContent = `Page ${state.page}`;
  };

  nav.update = update;
  update(currentState);

  return nav;
};
