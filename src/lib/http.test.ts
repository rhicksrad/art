import { describe, expect, it } from 'vitest';
import { redactSecrets } from './http';

describe('redactSecrets', () => {
  it('blanks key parameters inside a Worker diagnostic', () => {
    const body = JSON.stringify({
      upstream: 'https://oc-index.library.ubc.ca/search/8.5?index=calendars&key=abc123',
      sample: 'see https://api.example.org/object?apikey=zzz999&q=monet',
    });
    const safe = redactSecrets(body);
    expect(safe).not.toContain('abc123');
    expect(safe).not.toContain('zzz999');
    expect(safe).toContain('q=monet');
    expect(() => JSON.parse(safe) as unknown).not.toThrow();
  });

  it('leaves ordinary parameters alone', () => {
    const url = 'https://x.test/search?q=keyhole&monkey=1&size=2';
    expect(redactSecrets(url)).toBe(url);
  });
});
