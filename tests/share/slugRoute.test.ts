import { describe, expect, it } from 'vitest';
import { buildPathForSlug, resolveSlugRoute } from '../../apps/share/src/routing/slugRoute';

describe('Share slug routing (path-based)', () => {
  it('resolves the root path', () => {
    expect(resolveSlugRoute('/')).toEqual({ kind: 'root' });
    expect(resolveSlugRoute('')).toEqual({ kind: 'root' });
  });

  it('resolves a canonical slug, ignoring trailing slashes', () => {
    expect(resolveSlugRoute('/alice')).toEqual({ kind: 'slug', slug: 'alice' });
    expect(resolveSlugRoute('/alice/')).toEqual({ kind: 'slug', slug: 'alice' });
    expect(resolveSlugRoute('/bruno-sato')).toEqual({ kind: 'slug', slug: 'bruno-sato' });
  });

  it('treats non-canonical or nested paths as invalid (not found)', () => {
    expect(resolveSlugRoute('/Alice')).toEqual({ kind: 'invalid' });
    expect(resolveSlugRoute('/a')).toEqual({ kind: 'invalid' });
    expect(resolveSlugRoute('/alice/extra')).toEqual({ kind: 'invalid' });
    expect(resolveSlugRoute('/-leading')).toEqual({ kind: 'invalid' });
    expect(resolveSlugRoute('/trailing-')).toEqual({ kind: 'invalid' });
    expect(resolveSlugRoute('/%E0%A4%A')).toEqual({ kind: 'invalid' });
  });

  it('builds canonical public paths', () => {
    expect(buildPathForSlug('alice')).toBe('/alice');
  });
});
