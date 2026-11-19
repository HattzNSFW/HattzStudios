import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import {
  closeStudioDb,
  getStudioDb,
  type StudioDatabase,
} from '../../apps/studio/src/persistence/db';
import {
  createLocalDraftProfile,
  listMediaAssets,
  storeMediaAsset,
} from '../../apps/studio/src/persistence/repository';
import { ensureStudioDbReady } from '../../apps/studio/src/persistence/migrations';
import { useStudioMedia } from '../../apps/studio/src/hooks/useStudioMedia';

const PROFILE_ID = 'prof_media';

describe('Studio media persistence (blobs survive reload; object URLs are recreated)', () => {
  const dbs: StudioDatabase[] = [];
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;

  afterEach(async () => {
    await closeStudioDb();
    for (const db of dbs.splice(0)) {
      db.close();
      await db.delete();
    }
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: originalCreate,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: originalRevoke,
    });
    vi.restoreAllMocks();
  });

  async function seedProfile(): Promise<StudioDatabase> {
    const db = getStudioDb();
    if (!dbs.includes(db)) dbs.push(db);
    await ensureStudioDbReady(db);
    await createLocalDraftProfile({
      technicalId: PROFILE_ID,
      displayName: 'Mídia',
      publicSlugDraft: 'midia',
    });
    return db;
  }

  it('keeps avatar/banner/image blobs persisted across a full reopen', async () => {
    await seedProfile();

    const avatar = await storeMediaAsset({
      profileTechnicalId: PROFILE_ID,
      kind: 'avatar',
      blob: new Blob(['avatar-bytes'], { type: 'image/png' }),
    });
    const banner = await storeMediaAsset({
      profileTechnicalId: PROFILE_ID,
      kind: 'banner',
      blob: new Blob(['banner-bytes'], { type: 'image/jpeg' }),
    });
    const image = await storeMediaAsset({
      profileTechnicalId: PROFILE_ID,
      kind: 'image',
      blob: new Blob(['image-bytes'], { type: 'image/webp' }),
    });

    await closeStudioDb();
    const reopened = getStudioDb();
    dbs.push(reopened);
    await ensureStudioDbReady(reopened);

    const assets = await listMediaAssets(PROFILE_ID);
    expect(assets.map((asset) => asset.assetId).sort()).toEqual(
      [avatar.assetId, banner.assetId, image.assetId].sort(),
    );
    for (const asset of assets) {
      // jsdom's fake IndexedDB does not preserve Blob internals across structured clone; we assert
      // the blob field is present (the real browser stores the Blob natively).
      expect(asset.blob).toBeDefined();
      expect(asset.size).toBeGreaterThan(0);
      expect(asset.mimeType).toMatch(/^image\//);
    }
  });

  it('recreates object URLs on reload and revokes the previous ones', async () => {
    let counter = 0;
    const createObjectURL = vi.fn(() => `blob:mock-${++counter}`);
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: revokeObjectURL,
    });

    await seedProfile();
    const avatar = await storeMediaAsset({
      profileTechnicalId: PROFILE_ID,
      kind: 'avatar',
      blob: new Blob(['a'], { type: 'image/png' }),
    });

    const { result, unmount } = renderHook(() => useStudioMedia(PROFILE_ID));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.resolver.resolveMediaUrl(avatar.assetId)).toBe('blob:mock-1');

    // A reload must recreate the object URL (the old one is revoked).
    act(() => result.current.reload());
    await waitFor(() =>
      expect(result.current.resolver.resolveMediaUrl(avatar.assetId)).toBe('blob:mock-2'),
    );
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-1');

    unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-2');
  });

  it('resolves nothing for an unknown asset id', async () => {
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: vi.fn(() => 'blob:mock'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });

    await seedProfile();
    const { result } = renderHook(() => useStudioMedia(PROFILE_ID));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.resolver.resolveMediaUrl('asset_inexistente')).toBeNull();
  });
});
