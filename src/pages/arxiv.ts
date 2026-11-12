import { sourceBySlug, type SourceDefinition } from '../sources';
import { mountExplorer } from './explorer';

export default {
  mount: (el: HTMLElement): void => mountExplorer(el, sourceBySlug('arxiv') as SourceDefinition),
};
