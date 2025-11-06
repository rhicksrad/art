export function candidateUrls(
  iiifService?: string,
  primary?: string,
  renditions: string[] = [],
  size = 600,
): string[] {
  const iiif = iiifService ? `${iiifService.replace(/\/?$/, '')}/full/!${size},${size}/0/default.jpg` : null;
  const candidates = [iiif, primary, ...renditions];
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const value of candidates) {
    if (!value) continue;
    const normalized = value.replace(/^https?:\/\//, (match) => match.toLowerCase());
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    ordered.push(value);
  }
  return ordered;
}
