import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeStudioDb, getStudioDb, StudioDatabase } from '@hattz/local-store';
import {
  createLocalDraftProfile,
  createWorkingDraft,
  publishWorkingDraft,
  saveWorkingDraft,
  storeMediaAsset,
  unpublishProfile,
} from '../../apps/studio/src/persistence/repository';
import { ensureStudioDbReady } from '../../apps/studio/src/persistence/migrations';
import { LocalPublicationSource } from '../../apps/share/src/data/localPublicationSource';

interface ContentOptions {
  avatarAssetId?: string;
  imageAssetId?: string;
}

function makeContent(
  displayName: string,
  bio: string,
  options: ContentOptions = {},
): Record<string, unknown> {
  const profile: Record<string, unknown> = { displayName };
  if (bio) profile.bio = bio;
  if (options.avatarAssetId) profile.avatarAssetId = options.avatarAssetId;

  const sections = options.imageAssetId
    ? [
        {
          id: 'sec_1',
          type: 'content',
          visible: true,
          order: 0,
          blocks: [
            {
              id: 'blk_1',
              type: 'image',
              visible: true,
              order: 0,
              props: { alt: 'Foto', assetId: options.imageAssetId },
            },
          ],
        },
      ]
    : [];

  return {
    schemaVersion: 1,
    profile,
    sections,
    theme: { backgroundStyle: 'gradient' },
    effects: { grain: false, glow: false },
  };
}

async function seedProfile(
  technicalId: string,
  displayName: string,
  content: Record<string, unknown>,
): Promise<void> {
  const db = getStudioDb();
  await ensureStudioDbReady(db);
  await createLocalDraftProfile({ technicalId, displayName, publicSlugDraft: 'alice' });
  await createWorkingDraft(technicalId, content);
}

describe('Share LocalPublicationSource (reads only what the Studio published)', () => {
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;
  let urlCounter = 0;

  beforeEach(() => {
    urlCounter = 0;
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: () => `blob:mock/${++urlCounter}`,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: () => undefined,
    });
  });

  afterEach(async () => {
    await closeStudioDb();
    const cleanup = new StudioDatabase();
    await cleanup.delete();

    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: originalCreateObjectURL,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: originalRevokeObjectURL,
    });
  });

  it('does not expose a saved draft and reports an unknown slug as not found', async () => {
    await seedProfile('prof_draft', 'Alice', makeContent('Alice', 'Bio do rascunho'));
    const source = new LocalPublicationSource();

    expect(await source.getPublishedProfileBySlug('alice')).toBeNull();
    // A profile that was never published is "not found", not "unpublished".
    expect(await source.isKnownUnpublishedSlug('alice')).toBe(false);
  });

  it('returns only the published snapshot and never internal fields', async () => {
    await seedProfile('prof_pub', 'Alice', makeContent('Alice', 'Bio publicada'));
    await publishWorkingDraft('prof_pub', { slug: 'alice' });

    const source = new LocalPublicationSource();
    const snapshot = await source.getPublishedProfileBySlug('alice');

    expect(snapshot).not.toBeNull();
    expect(snapshot?.slug).toBe('alice');
    expect(snapshot?.profileVersion).toBe(1);
    expect(snapshot?.content).toMatchObject({
      profile: { displayName: 'Alice', bio: 'Bio publicada' },
    });

    // The public projection must not leak the local publication record shape.
    expect(snapshot).not.toHaveProperty('profileTechnicalId');
    expect(snapshot).not.toHaveProperty('state');
    expect(snapshot).not.toHaveProperty('publicationId');
  });

  it('keeps showing the previous published version while the draft changes', async () => {
    await seedProfile('prof_ver', 'Alice', makeContent('Alice', 'Bio v1'));
    await publishWorkingDraft('prof_ver', { slug: 'alice' });

    // Edit the working draft WITHOUT publishing.
    await saveWorkingDraft('prof_ver', makeContent('Alice', 'Bio v2 (rascunho)'), 1);

    const source = new LocalPublicationSource();
    const snapshot = await source.getPublishedProfileBySlug('alice');
    expect(snapshot?.profileVersion).toBe(1);
    expect((snapshot?.content.profile as Record<string, unknown>).bio).toBe('Bio v1');
  });

  it('shows the new version once it is published', async () => {
    await seedProfile('prof_ver2', 'Alice', makeContent('Alice', 'Bio v1'));
    await publishWorkingDraft('prof_ver2', { slug: 'alice' });
    await saveWorkingDraft('prof_ver2', makeContent('Alice', 'Bio v2'), 1);
    await publishWorkingDraft('prof_ver2', { slug: 'alice' });

    const source = new LocalPublicationSource();
    const snapshot = await source.getPublishedProfileBySlug('alice');
    expect(snapshot?.profileVersion).toBe(2);
    expect((snapshot?.content.profile as Record<string, unknown>).bio).toBe('Bio v2');
  });

  it('stops returning the profile after it is unpublished', async () => {
    await seedProfile('prof_unpub', 'Alice', makeContent('Alice', 'Bio'));
    await publishWorkingDraft('prof_unpub', { slug: 'alice' });

    const source = new LocalPublicationSource();
    expect(await source.getPublishedProfileBySlug('alice')).not.toBeNull();

    await unpublishProfile('prof_unpub');

    expect(await source.getPublishedProfileBySlug('alice')).toBeNull();
    expect(await source.isKnownUnpublishedSlug('alice')).toBe(true);
  });

  it('persists across a reload (new DB connection reads the same origin data)', async () => {
    await seedProfile('prof_persist', 'Alice', makeContent('Alice', 'Bio persistida'));
    await publishWorkingDraft('prof_persist', { slug: 'alice' });

    // Simulate a page reload: drop the connection and read again with a fresh source.
    await closeStudioDb();
    const reopened = new LocalPublicationSource();
    const snapshot = await reopened.getPublishedProfileBySlug('alice');

    expect(snapshot?.profileVersion).toBe(1);
    expect((snapshot?.content.profile as Record<string, unknown>).bio).toBe('Bio persistida');
  });

  it('does not resolve a media asset owned by a different profile', async () => {
    const db = getStudioDb();
    await ensureStudioDbReady(db);
    await createLocalDraftProfile({
      technicalId: 'prof_media_owner',
      displayName: 'Dona',
      publicSlugDraft: 'dona',
    });
    const foreignAsset = await storeMediaAsset({
      profileTechnicalId: 'prof_media_owner',
      kind: 'avatar',
      blob: new Blob(['private-avatar'], { type: 'image/png' }),
    });

    await seedProfile(
      'prof_media_other',
      'Outra',
      makeContent('Outra', 'Referência cruzada', { avatarAssetId: foreignAsset.assetId }),
    );
    await publishWorkingDraft('prof_media_other', { slug: 'outra' });

    const source = new LocalPublicationSource();
    await source.getPublishedProfileBySlug('outra');
    expect(source.resolveMediaUrl(foreignAsset.assetId)).toBeNull();
  });

  it('pre-resolves the media referenced by the published snapshot', async () => {
    const asset = await (async () => {
      const db = getStudioDb();
      await ensureStudioDbReady(db);
      await createLocalDraftProfile({
        technicalId: 'prof_media',
        displayName: 'Alice',
        publicSlugDraft: 'alice',
      });
      return storeMediaAsset({
        profileTechnicalId: 'prof_media',
        kind: 'avatar',
        blob: new Blob(['avatar-bytes'], { type: 'image/png' }),
      });
    })();

    await createWorkingDraft(
      'prof_media',
      makeContent('Alice', 'Com mídia', { avatarAssetId: asset.assetId }),
    );
    await publishWorkingDraft('prof_media', { slug: 'alice' });

    const source = new LocalPublicationSource();
    expect(source.resolveMediaUrl(asset.assetId)).toBeNull();

    await source.getPublishedProfileBySlug('alice');
    expect(source.resolveMediaUrl(asset.assetId)).toMatch(/^blob:mock\//);

    // Reading another profile (without media) releases the previous object URLs.
    await seedProfile('prof_plain', 'Bruno', makeContent('Bruno', 'Sem mídia'));
    await publishWorkingDraft('prof_plain', { slug: 'bruno' });
    await source.getPublishedProfileBySlug('bruno');
    expect(source.resolveMediaUrl(asset.assetId)).toBeNull();
  });
});
