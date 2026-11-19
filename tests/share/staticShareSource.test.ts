import { describe, expect, it } from 'vitest';
import { StaticShareDataSource } from '../../apps/share/src/data/staticShareSource';
import { lookupProfile } from '../../apps/share/src/data/types';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

const manifest = {
  schemaVersion: 1,
  profiles: [
    { slug: 'alice', state: 'published', snapshot: 'profiles/alice.json' },
    { slug: 'marina', state: 'unpublished' },
  ],
  media: { avatar_alice: '/share-data/media/avatar-alice.svg' },
};

const aliceSnapshot = {
  slug: 'alice',
  profileVersion: 1,
  content: { schemaVersion: 1, profile: { displayName: 'Alice' }, sections: [] },
};

function fetchByPath(routes: Record<string, Response | (() => Promise<Response>)>): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    for (const [suffix, value] of Object.entries(routes)) {
      if (url.endsWith(suffix)) {
        return typeof value === 'function' ? value() : value;
      }
    }
    return jsonResponse({}, 404);
  }) as typeof fetch;
}

describe('StaticShareDataSource (local dev source, same shape as the public view)', () => {
  it('resolves a published profile through the boundary', async () => {
    const source = new StaticShareDataSource({
      fetchImpl: fetchByPath({
        '/index.json': jsonResponse(manifest),
        '/profiles/alice.json': jsonResponse(aliceSnapshot),
      }),
    });

    const snapshot = await source.getPublishedProfileBySlug('alice');
    expect(snapshot?.slug).toBe('alice');
    expect(source.resolveMediaUrl('avatar_alice')).toBe('/share-data/media/avatar-alice.svg');
    expect(source.resolveMediaUrl('missing')).toBeNull();
  });

  it('distinguishes unpublished from not found', async () => {
    const source = new StaticShareDataSource({
      fetchImpl: fetchByPath({ '/index.json': jsonResponse(manifest) }),
    });

    await expect(lookupProfile(source, 'marina')).resolves.toEqual({ status: 'unpublished' });
    await expect(lookupProfile(source, 'ghost')).resolves.toEqual({ status: 'not_found' });
  });

  it('throws a clear error on transport failure and allows a retry', async () => {
    let failNext = true;
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('/index.json')) {
        if (failNext) {
          failNext = false;
          throw new Error('network down');
        }
        return jsonResponse(manifest);
      }
      return jsonResponse(aliceSnapshot);
    }) as typeof fetch;

    const source = new StaticShareDataSource({ fetchImpl });

    await expect(source.getPublishedProfileBySlug('alice')).rejects.toThrow('network down');
    // A failed manifest load must not be cached: the next attempt can succeed.
    await expect(source.getPublishedProfileBySlug('alice')).resolves.toMatchObject({
      slug: 'alice',
    });
  });

  it('throws when the snapshot payload is malformed', async () => {
    const source = new StaticShareDataSource({
      fetchImpl: fetchByPath({
        '/index.json': jsonResponse(manifest),
        '/profiles/alice.json': jsonResponse({ nope: true }),
      }),
    });
    await expect(source.getPublishedProfileBySlug('alice')).rejects.toThrow(
      'Snapshot público inválido',
    );
  });
});
