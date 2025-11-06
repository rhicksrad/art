const PARSER_ERROR_TAG = 'parsererror';

const createDomParser = (): DOMParser => {
  if (typeof DOMParser !== 'undefined') {
    return new DOMParser();
  }
  throw new Error('DOMParser is unavailable in this environment');
};

export const parseXml = (xml: string): Document => {
  const parser = createDomParser();
  const doc = parser.parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName(PARSER_ERROR_TAG).length > 0) {
    throw new Error('Unable to parse XML response');
  }
  return doc;
};

export const textContent = (el: Element | null | undefined): string | undefined => {
  if (!el) return undefined;
  const value = el.textContent ?? '';
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

export const attr = (el: Element | null | undefined, name: string): string | undefined => {
  if (!el) return undefined;
  const value = el.getAttribute(name);
  if (value == null) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

export const serializeElement = (el: Element): string => {
  const serializer = new XMLSerializer();
  return serializer.serializeToString(el);
};
