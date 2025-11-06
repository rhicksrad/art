import { createAlert } from '../components/Alert';
import { createCard, CardProps } from '../components/Card';
import { createPager } from '../components/Pager';
import { fetchJSON } from '../lib/http';

type IdentifyResponse = {
  repositoryName?: string;
  Identify?: {
    repositoryName?: string;
  };
};

const mount = (el: HTMLElement): void => {
  el.innerHTML = '';

  const status = document.createElement('p');
  status.textContent = 'Running UBC OAI Identify probe…';
  el.appendChild(status);

  const resultsSection = document.createElement('section');
  resultsSection.className = 'results';

  const resultsHeading = document.createElement('h3');
  resultsHeading.textContent = 'Results';
  resultsSection.appendChild(resultsHeading);

  const resultsList = document.createElement('div');
  resultsList.className = 'results-list';
  resultsSection.appendChild(resultsList);

  const pager = createPager({
    page: 1,
    hasPrev: false,
    hasNext: false,
    onPrev: () => {},
    onNext: () => {},
  });
  resultsSection.appendChild(pager);

  const updateResults = (items: CardProps[]): void => {
    resultsList.innerHTML = '';
    if (items.length === 0) {
      const placeholder = document.createElement('p');
      placeholder.className = 'results-placeholder';
      placeholder.textContent = 'No results yet.';
      resultsList.appendChild(placeholder);
      return;
    }

    items.forEach((item) => {
      resultsList.appendChild(createCard(item));
    });
  };

  updateResults([]);
  el.appendChild(resultsSection);

  fetchJSON<IdentifyResponse>('/ubc-oai', { verb: 'Identify' })
    .then((data) => {
      const repositoryName = data.repositoryName ?? data.Identify?.repositoryName ?? undefined;

      const detail = repositoryName ?? 'Endpoint responded';
      status.textContent = `Probe OK: ${detail}.`;

      const cards: CardProps[] = [
        {
          title: repositoryName ?? 'Result #1',
          sub: 'Identify response',
          meta: repositoryName ? `Repository: ${repositoryName}` : undefined,
        },
      ];

      updateResults(cards);
    })
    .catch((error: Error) => {
      status.remove();
      el.appendChild(createAlert(`UBC OAI probe failed: ${error.message}`, 'error'));
      updateResults([]);
    });
};

export default mount;
