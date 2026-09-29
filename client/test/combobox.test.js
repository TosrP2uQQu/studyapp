import { describe, expect, it } from 'vitest';
import { filterOptions } from '../src/components/Combobox';

const LANGS = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'et', label: 'Estonian' },
];

describe('filterOptions', () => {
  it('returns everything on an empty query', () => {
    expect(filterOptions(LANGS, '')).toEqual(LANGS);
  });

  it('filters case-insensitively by visible name', () => {
    expect(filterOptions(LANGS, 'span').map((o) => o.value)).toEqual(['es']);
    expect(filterOptions(LANGS, 'ESTON').map((o) => o.value)).toEqual(['et']);
  });

  it('matches several options on a shared substring', () => {
    expect(filterOptions(LANGS, 's').map((o) => o.value).sort()).toEqual(['en', 'es', 'et']);
  });

  it('matches ISO codes too', () => {
    expect(filterOptions(LANGS, 'en').map((o) => o.value)).toEqual(['en']);
  });

  it('returns an empty list when nothing matches', () => {
    expect(filterOptions(LANGS, 'zzz')).toEqual([]);
  });
});
