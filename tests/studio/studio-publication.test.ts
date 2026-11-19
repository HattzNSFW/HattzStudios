import { afterEach, describe, expect, it } from 'vitest';
import {
  closeStudioDb,
  getStudioDb,
  type LocalPublicationRecord,
  type StudioDatabase,
} from '../../apps/studio/src/persistence/db';
import {
  PublicationSlugError,
  PublicationValidationError,
  StaleDraftError,
  createLocalDraftProfile,
  createWorkingDraft,
  getCurrentPublication,
  getLocalProfile,
  getPublicationByVersion,
  getWorkingDraft,
  listPublications,
  publishWorkingDraft,
  saveWorkingDraft,
  unpublishProfile,
} from '../../apps/studio/src/persistence/repository';
import { ensureStudioDbReady } from '../../apps/studio/src/persistence/migrations';
import {
  createEmptyDraft,
  slugForPreview,
  toSnapshotRecord,
  type StudioDraft,
} from '../../apps/studio/src/editor';
import {
  buildPublishedPreview,
  contentDiffers,
  publicationToSnapshot,
} from '../../apps/studio/src/publishing';

describe('Studio local publication (versioned immutable snapshots)', () => {
  const dbs: StudioDatabase[] = [];

  afterEach(async () => {
    await closeStudioDb();
    for (const db of dbs.splice(0)) {
      db.close();
      await db.delete();
    }
  });

  async function seed(id: string, draft: StudioDraft = createEmptyDraft('Alice')): Promise<void> {
    const db = getStudioDb();
    if (!dbs.includes(db)) dbs.push(db);
    await ensureStudioDbReady(db);
    await createLocalDraftProfile({
      technicalId: id,
      displayName: draft.profile.displayName,
      publicSlugDraft: slugForPreview(draft.profile.displayName),
    });
    await createWorkingDraft(id, toSnapshotRecord(draft));
  }

  it('publishes the first version, marks it current and mirrors the profile label', async () => {
    await seed('prof_pub');
    const publication = await publishWorkingDraft('prof_pub', { slug: 'alice' });

    expect(publication.version).toBe(1);
    expect(publication.state).toBe('published');
    expect(publication.slug).toBe('alice');
    expect(publication.unpublishedAt).toBeNull();

    const current = await getCurrentPublication('prof_pub');
    expect(current?.publicationId).toBe(publication.publicationId);

    const profile = await getLocalProfile('prof_pub');
    expect(profile?.lastPublishedVersion).toBe(1);

    const history = await listPublications('prof_pub');
    expect(history.map((record) => record.version)).toEqual([1]);
  });

  it('snapshots the current working draft content and preserves the draft afterwards', async () => {
    await seed('prof_keep');
    const before = await getWorkingDraft('prof_keep');

    const publication = await publishWorkingDraft('prof_keep', { slug: 'alice' });
    expect(publication.content).toEqual(before?.content);

    const after = await getWorkingDraft('prof_keep');
    expect(after?.content).toEqual(before?.content);
    expect(after?.revision).toBe(before?.revision);
  });

  it('publishes a new version without modifying the previous snapshot', async () => {
    await seed('prof_v2');
    const first = await publishWorkingDraft('prof_v2', { slug: 'alice' });
    const firstContent = structuredClone(first.content);

    const working = await getWorkingDraft('prof_v2');
    await saveWorkingDraft(
      'prof_v2',
      toSnapshotRecord(createEmptyDraft('Alice Editada')),
      working!.revision,
    );

    const second = await publishWorkingDraft('prof_v2', { slug: 'alice-editada' });
    expect(second.version).toBe(2);

    const storedFirst = await getPublicationByVersion('prof_v2', 1);
    expect(storedFirst?.content).toEqual(firstContent);
    expect(storedFirst?.state).toBe('unpublished');
    expect(storedFirst?.unpublishedAt).not.toBeNull();

    expect((await getCurrentPublication('prof_v2'))?.version).toBe(2);
    expect((await listPublications('prof_v2')).map((record) => record.version)).toEqual([2, 1]);
  });

  it('selects the current publication by state, not by record order or version', async () => {
    await seed('prof_order');
    const db = getStudioDb();
    const base = {
      profileTechnicalId: 'prof_order',
      slug: 'x',
      content: toSnapshotRecord(createEmptyDraft('X')),
      publishedAt: 1,
      createdAt: 1,
    };
    const higherUnpublished: LocalPublicationRecord = {
      ...base,
      publicationId: 'pub_high',
      version: 9,
      state: 'unpublished',
      unpublishedAt: 2,
    };
    const lowerPublished: LocalPublicationRecord = {
      ...base,
      publicationId: 'pub_low',
      version: 7,
      state: 'published',
      unpublishedAt: null,
    };

    // Insert the higher, unpublished version first so a "last record"/"max version" heuristic
    // would pick the wrong one.
    await db.publications.put(higherUnpublished);
    await db.publications.put(lowerPublished);

    const current = await getCurrentPublication('prof_order');
    expect(current?.publicationId).toBe('pub_low');
    expect(current?.version).toBe(7);
  });

  it('unpublishes the current version and prevents selecting it again', async () => {
    await seed('prof_unpub');
    await publishWorkingDraft('prof_unpub', { slug: 'alice' });

    const result = await unpublishProfile('prof_unpub');
    expect(result?.state).toBe('unpublished');
    expect(result?.unpublishedAt).not.toBeNull();

    expect(await getCurrentPublication('prof_unpub')).toBeNull();
    expect((await getLocalProfile('prof_unpub'))?.lastPublishedVersion).toBeNull();
    expect((await listPublications('prof_unpub'))[0]?.state).toBe('unpublished');

    // Idempotent: unpublishing again does nothing.
    expect(await unpublishProfile('prof_unpub')).toBeNull();
  });

  it('never reuses a version number after an unpublish', async () => {
    await seed('prof_seq');
    await publishWorkingDraft('prof_seq', { slug: 'alice' });
    await unpublishProfile('prof_seq');
    const again = await publishWorkingDraft('prof_seq', { slug: 'alice' });
    expect(again.version).toBe(2);
  });

  it('refuses to publish invalid content and persists nothing', async () => {
    const db = getStudioDb();
    dbs.push(db);
    await ensureStudioDbReady(db);
    await createLocalDraftProfile({
      technicalId: 'prof_invalid',
      displayName: 'X',
      publicSlugDraft: 'x',
    });
    await createWorkingDraft('prof_invalid', {
      schemaVersion: 1,
      profile: { displayName: '' },
      sections: [],
    });

    const error = await publishWorkingDraft('prof_invalid', { slug: 'invalid-profile' }).catch(
      (err: unknown) => err,
    );
    expect(error).toBeInstanceOf(PublicationValidationError);
    expect((error as PublicationValidationError).issues.length).toBeGreaterThan(0);

    expect(await listPublications('prof_invalid')).toEqual([]);
    expect(await getCurrentPublication('prof_invalid')).toBeNull();
    expect((await getLocalProfile('prof_invalid'))?.lastPublishedVersion).toBeNull();
  });

  it('rejects invalid and route-reserved slugs before creating a publication', async () => {
    await seed('prof_bad_slug');
    await expect(publishWorkingDraft('prof_bad_slug', { slug: 'ab' })).rejects.toBeInstanceOf(
      PublicationSlugError,
    );
    await expect(publishWorkingDraft('prof_bad_slug', { slug: 'studio' })).rejects.toBeInstanceOf(
      PublicationSlugError,
    );
    expect(await listPublications('prof_bad_slug')).toEqual([]);
  });

  it('normalizes slugs and rejects a slug already used by another published profile', async () => {
    await seed('prof_slug_a', createEmptyDraft('Alice'));
    await seed('prof_slug_b', createEmptyDraft('Bruno'));

    const first = await publishWorkingDraft('prof_slug_a', { slug: 'Alice-Profile' });
    expect(first.slug).toBe('alice-profile');

    await expect(
      publishWorkingDraft('prof_slug_b', { slug: 'alice-profile' }),
    ).rejects.toBeInstanceOf(PublicationSlugError);
    expect(await getCurrentPublication('prof_slug_b')).toBeNull();
  });

  it('serializes competing profiles that request the same slug', async () => {
    await seed('prof_slug_race_a', createEmptyDraft('Alice'));
    await seed('prof_slug_race_b', createEmptyDraft('Bruno'));

    const results = await Promise.allSettled([
      publishWorkingDraft('prof_slug_race_a', { slug: 'shared-profile' }),
      publishWorkingDraft('prof_slug_race_b', { slug: 'shared-profile' }),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const active = await getCurrentPublication('prof_slug_race_a');
    const other = await getCurrentPublication('prof_slug_race_b');
    expect(Number(active !== null) + Number(other !== null)).toBe(1);
  });

  it('updates local visibility intent when publishing and unpublishing', async () => {
    await seed('prof_visibility');
    await publishWorkingDraft('prof_visibility', { slug: 'alice-profile' });
    expect((await getLocalProfile('prof_visibility'))?.visibility).toBe('public_intent');

    await unpublishProfile('prof_visibility');
    expect((await getLocalProfile('prof_visibility'))?.visibility).toBe('unpublished');
  });

  it('serializes concurrent publishes: distinct versions and exactly one current', async () => {
    await seed('prof_race');
    const [first, second] = await Promise.all([
      publishWorkingDraft('prof_race', { slug: 'race-profile' }),
      publishWorkingDraft('prof_race', { slug: 'race-profile' }),
    ]);

    expect(new Set([first.version, second.version]).size).toBe(2);
    const history = await listPublications('prof_race');
    expect(history).toHaveLength(2);
    expect(history.filter((record) => record.state === 'published')).toHaveLength(1);
    expect((await getCurrentPublication('prof_race'))?.version).toBe(2);
  });

  it('rejects publishing a draft that changed since the caller last saw it', async () => {
    await seed('prof_conflict');
    const working = await getWorkingDraft('prof_conflict');
    await saveWorkingDraft(
      'prof_conflict',
      toSnapshotRecord(createEmptyDraft('Alice Nova')),
      working!.revision,
    );

    await expect(
      publishWorkingDraft('prof_conflict', { slug: 'alice', expectedRevision: working!.revision }),
    ).rejects.toBeInstanceOf(StaleDraftError);
    expect(await listPublications('prof_conflict')).toEqual([]);
  });

  it('keeps the current publication and history after the database is reopened', async () => {
    await seed('prof_reload_pub');
    await publishWorkingDraft('prof_reload_pub', { slug: 'alice' });
    const working = await getWorkingDraft('prof_reload_pub');
    await saveWorkingDraft(
      'prof_reload_pub',
      toSnapshotRecord(createEmptyDraft('Alice Nova')),
      working!.revision,
    );
    await publishWorkingDraft('prof_reload_pub', { slug: 'alice-nova' });

    await closeStudioDb();
    const reopened = getStudioDb();
    dbs.push(reopened);
    await ensureStudioDbReady(reopened);

    expect((await getCurrentPublication('prof_reload_pub'))?.version).toBe(2);
    const history = await listPublications('prof_reload_pub');
    expect(history.map((record) => record.version)).toEqual([2, 1]);
    expect(history[1]?.content).toMatchObject({ profile: { displayName: 'Alice' } });
    expect((await getLocalProfile('prof_reload_pub'))?.lastPublishedVersion).toBe(2);
  });
});

describe('Publication -> public snapshot / published preview', () => {
  const publicationTime = Date.UTC(2026, 0, 2, 3, 4, 5);

  function record(overrides: Partial<LocalPublicationRecord> = {}): LocalPublicationRecord {
    return {
      publicationId: 'pub_1',
      profileTechnicalId: 'prof_internal',
      version: 3,
      slug: 'alice',
      state: 'published',
      content: toSnapshotRecord(createEmptyDraft('Alice')),
      publishedAt: publicationTime,
      unpublishedAt: null,
      createdAt: publicationTime,
      ...overrides,
    };
  }

  it('exposes only the public contract fields (no internal/administrative data)', () => {
    const snapshot = publicationToSnapshot(record());
    expect(Object.keys(snapshot).sort()).toEqual(
      ['content', 'profileVersion', 'publishedAt', 'seoDescription', 'seoTitle', 'slug'].sort(),
    );
    expect(JSON.stringify(snapshot)).not.toContain('prof_internal');
    expect(snapshot.profileVersion).toBe(3);
    expect(snapshot.slug).toBe('alice');
    expect(snapshot.publishedAt).toBe(new Date(publicationTime).toISOString());
  });

  it('renders the published preview from the stored snapshot', () => {
    const preview = buildPublishedPreview(record());
    expect(preview.issues).toEqual([]);
    expect(preview.profile?.displayName).toBe('Alice');
    expect(preview.profile?.profileVersion).toBe(3);
  });

  it('presents a clear empty state when nothing is published', () => {
    expect(buildPublishedPreview(null)).toEqual({ profile: null, issues: [] });
  });

  it('keeps older snapshots renderable and ignores unknown section/block types', () => {
    const content = toSnapshotRecord(createEmptyDraft('Alice'));
    content.sections = [
      {
        id: 'sec_future',
        type: 'future_section',
        visible: true,
        order: 0,
        blocks: [
          {
            id: 'blk_future',
            type: 'future_block',
            visible: true,
            order: 0,
            props: { anything: 'ok' },
          },
        ],
      },
    ];

    const preview = buildPublishedPreview(record({ content }));
    expect(preview.issues).toEqual([]);
    expect(preview.profile).not.toBeNull();
    expect(preview.profile?.sections[0]?.blocks[0]?.type).toBe('future_block');
  });

  it('surfaces issues instead of rendering when a stored snapshot is invalid', () => {
    const preview = buildPublishedPreview(
      record({ content: { schemaVersion: 1, profile: { displayName: '' }, sections: [] } }),
    );
    expect(preview.profile).toBeNull();
    expect(preview.issues.length).toBeGreaterThan(0);
  });

  it('detects when the draft differs from the published content', () => {
    const published = toSnapshotRecord(createEmptyDraft('Alice'));
    expect(contentDiffers(toSnapshotRecord(createEmptyDraft('Alice')), published)).toBe(false);
    expect(contentDiffers(toSnapshotRecord(createEmptyDraft('Alice Editada')), published)).toBe(
      true,
    );
    expect(contentDiffers(null, published)).toBe(true);
    expect(contentDiffers(published, null)).toBe(true);
    expect(contentDiffers(null, null)).toBe(false);
  });
});
