export type PagerProps = {
  page: number;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
};

export const createPager = ({
  page,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
}: PagerProps): HTMLElement => {
  const nav = document.createElement("nav");
  nav.className = "pager";
  nav.setAttribute("aria-label", "Pagination");

  const prevButton = document.createElement("button");
  prevButton.type = "button";
  prevButton.className = "pager__button pager__button--prev";
  prevButton.textContent = "Previous";
  prevButton.disabled = !hasPrev;
  prevButton.addEventListener("click", (event) => {
    event.preventDefault();
    if (hasPrev) {
      onPrev();
    }
  });

  const status = document.createElement("span");
  status.className = "pager__status";
  status.textContent = `Page ${page}`;

  const nextButton = document.createElement("button");
  nextButton.type = "button";
  nextButton.className = "pager__button pager__button--next";
  nextButton.textContent = "Next";
  nextButton.disabled = !hasNext;
  nextButton.addEventListener("click", (event) => {
    event.preventDefault();
    if (hasNext) {
      onNext();
    }
  });

  nav.append(prevButton, status, nextButton);

  return nav;
};
