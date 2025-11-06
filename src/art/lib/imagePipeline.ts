export function candidateUrls(
  iiifService?: string,
  primary?: string,
  renditions: string[] = [],
  size = 600,
): string[] {
  const urls: (string | null | undefined)[] = [];
  if (iiifService) {
    const trimmed = iiifService.replace(/\/$/, '');
    urls.push(`${trimmed}/full/!${size},${size}/0/default.jpg`);
  }
  urls.push(primary);
  for (const entry of renditions) {
    urls.push(entry);
  }
  return urls.filter((value): value is string => Boolean(value));
}
