const TOKEN_KEYS = ['--accent', '--accent-alt', '--ok', '--warn', '--danger'] as const;

let cachedPalette: string[] | null = null;

const readToken = (styles: CSSStyleDeclaration, token: string): string => {
  const value = styles.getPropertyValue(token).trim();
  return value.length ? value : token;
};

export const getChartPalette = (): string[] => {
  if (cachedPalette) {
    return [...cachedPalette];
  }

  const styles = getComputedStyle(document.documentElement);
  cachedPalette = TOKEN_KEYS.map((token) => readToken(styles, token));
  return [...cachedPalette];
};

export const refreshChartPalette = (): string[] => {
  cachedPalette = null;
  return getChartPalette();
};
