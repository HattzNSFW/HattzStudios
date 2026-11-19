import Dexie, { type Table } from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import {
  STUDIO_DB_NAME,
  StudioDatabase,
  closeStudioDb,
  getStudioDb,
  type DraftSnapshotRecord,
  type LocalProfileRecord,
} from '../../apps/studio/src/persistence/db';
import {
  StaleDraftError,
  createLocalDraftProfile,
  createWorkingDraft,
  getLocalProfile,
  getMediaAsset,
  getWorkingDraft,
  listMediaAssets,
  listLocalProfiles,
  saveWorkingDraft,
  storeMediaAsset,
} from '../../apps/studio/src/persistence/repository';
import { ensureStudioDbReady } from '../../apps/studio/src/persistence/migrations';

/** Minimal v1-only database, used to exercise the real v1 -> v2 upgrade path. */
class V1Database extends Dexie {
  localProfiles!: Table<LocalProfileRecord, string>;
  draftSnapshots!: Table<DraftSnapshotRecord, string>;
  constructor(name: string) {
    super(name);
    this.version(1).stores({
      localProfiles: 'technicalId, publicSlugDraft, updatedAt, isDeleted',
      draftSnapshots: 'id, profileTechnicalId, version, createdAt, source',
      pendingSyncOps: 'operationId, profileTechnicalId, state, type, updatedAt',
      studioMeta: 'key, updatedAt',
    });
  }
}

const testDbName = () => `hattz_studio_editor_${Date.now()}_${Math.random().toString(36).slice(2)}`;

describe('Studio working-draft persistence (autosave + optimistic concurrency)', () => {
  const dbs: StudioDatabase[] = [];
  const extraNames: string[] = [];

  afterEach(async () => {
    await closeStudioDb();
    for (const name of extraNames.splice(0)) {
      try {
        await Dexie.delete(name);
      } catch {
        // ignore
      }
    }
    for (const db of dbs.splice(0)) {
      db.close();
      await db.delete();
    }
  });

  async function seedProfile(technicalId: string) {
    const db = getStudioDb();
    dbs.push(db);
    await ensureStudioDbReady(db);
    await createLocalDraftProfile({ technicalId, displayName: 'Alice', publicSlugDraft: 'alice' });
    return db;
  }

  it('creates, reads and saves a working draft, bumping the revision and mirroring the name', async () => {
    await seedProfile('prof_wd');

    const created = await createWorkingDraft('prof_wd', { profile: { displayName: 'Alice' } });
    expect(created.revision).toBe(1);

    const loaded = await getWorkingDraft('prof_wd');
    expect(loaded?.content).toEqual({ profile: { displayName: 'Alice' } });

    const saved = await saveWorkingDraft(
      'prof_wd',
      { profile: { displayName: 'Alice Andrade' } },
      created.revision,
    );
    expect(saved.revision).toBe(2);
    expect(saved.content).toEqual({ profile: { displayName: 'Alice Andrade' } });

    const profile = await getLocalProfile('prof_wd');
    expect(profile?.displayName).toBe('Alice Andrade');
    // Saving a working draft never bumps the versioned checkpoint counter.
    expect(profile?.contentVersion).toBe(1);
  });

  it('rejects a stale save with StaleDraftError and does not overwrite the newest content', async () => {
    await seedProfile('prof_stale');
    const created = await createWorkingDraft('prof_stale', { n: 1 });
    await saveWorkingDraft('prof_stale', { n: 2 }, created.revision);

    await expect(
      saveWorkingDraft('prof_stale', { n: 99 }, created.revision),
    ).rejects.toBeInstanceOf(StaleDraftError);

    const current = await getWorkingDraft('prof_stale');
    expect(current?.content).toEqual({ n: 2 });
    expect(current?.revision).toBe(2);
  });

  it('fails explicitly for duplicate creation and for saving a missing draft', async () => {
    await seedProfile('prof_dup_wd');
    await createWorkingDraft('prof_dup_wd', {});
    await expect(createWorkingDraft('prof_dup_wd', {})).rejects.toThrow(/já existe/i);
    await expect(saveWorkingDraft('prof_missing', {}, 1)).rejects.toThrow(/não encontrado/i);
    await expect(getWorkingDraft('prof_missing')).resolves.toBeNull();
  });

  it('keeps the working draft after the database is closed and reopened (reload survives)', async () => {
    await seedProfile('prof_reload');
    const created = await createWorkingDraft('prof_reload', { profile: { displayName: 'Viva' } });
    await saveWorkingDraft(
      'prof_reload',
      { profile: { displayName: 'Viva Editado' } },
      created.revision,
    );

    await closeStudioDb();

    const reopened = getStudioDb();
    dbs.push(reopened);
    await ensureStudioDbReady(reopened);
    const persisted = await getWorkingDraft('prof_reload');
    expect(persisted?.content).toEqual({ profile: { displayName: 'Viva Editado' } });
    expect(persisted?.revision).toBe(2);
    const profiles = await listLocalProfiles();
    expect(profiles.map((p) => p.technicalId)).toContain('prof_reload');
  });

  it('seeds a working draft from the latest snapshot when upgrading v1 -> v2', async () => {
    const name = testDbName();
    extraNames.push(name);

    const v1 = new V1Database(name);
    await v1.open();
    const now = Date.now();
    await v1.localProfiles.put({
      technicalId: 'prof_legacy',
      displayName: 'Legado',
      publicSlugDraft: 'legado',
      visibility: 'unpublished',
      schemaVersion: 1,
      contentVersion: 3,
      createdAt: now,
      updatedAt: now,
      lastPublishedVersion: null,
      isDeleted: false,
    });
    await v1.draftSnapshots.bulkPut([
      {
        id: 'snap_old',
        profileTechnicalId: 'prof_legacy',
        version: 2,
        label: 'manual-2',
        content: { profile: { displayName: 'Antigo' } },
        createdAt: now,
        source: 'manual',
      },
      {
        id: 'snap_new',
        profileTechnicalId: 'prof_legacy',
        version: 3,
        label: 'manual-3',
        content: { profile: { displayName: 'Recente' } },
        createdAt: now,
        source: 'manual',
      },
    ]);
    v1.close();

    const upgraded = new StudioDatabase(name);
    dbs.push(upgraded);
    await ensureStudioDbReady(upgraded);

    const seeded = await upgraded.workingDrafts.get('prof_legacy');
    expect(seeded?.content).toEqual({ profile: { displayName: 'Recente' } });
    expect(seeded?.revision).toBe(1);
  });
});

describe('Studio local media assets', () => {
  const dbs: StudioDatabase[] = [];

  afterEach(async () => {
    await closeStudioDb();
    for (const db of dbs.splice(0)) {
      db.close();
      await db.delete();
    }
  });

  it('stores, lists and reads media blobs offline (IndexedDB)', async () => {
    const db = getStudioDb();
    dbs.push(db);
    await ensureStudioDbReady(db);
    await createLocalDraftProfile({
      technicalId: 'prof_media',
      displayName: 'Mídia',
      publicSlugDraft: 'midia',
    });

    const blob = new Blob(['hello'], { type: 'text/plain' });
    const avatar = await storeMediaAsset({
      profileTechnicalId: 'prof_media',
      kind: 'avatar',
      blob,
    });
    expect(avatar.assetId).toMatch(/^[a-zA-Z0-9_-]{1,128}$/);
    expect(avatar.kind).toBe('avatar');
    expect(avatar.mimeType).toBe('text/plain');
    expect(avatar.size).toBe(blob.size);

    await storeMediaAsset({ profileTechnicalId: 'prof_media', kind: 'banner', blob });

    const stored = await getMediaAsset(avatar.assetId);
    expect(stored?.kind).toBe('avatar');
    expect(stored?.mimeType).toBe('text/plain');
    expect(stored?.size).toBe(blob.size);
    // jsdom's fake IndexedDB does not preserve Blob internals across structured clone; in a real
    // browser the Blob is stored natively. We assert the blob field survives the round-trip.
    expect(stored?.blob).toBeDefined();

    const list = await listMediaAssets('prof_media');
    expect(list.map((asset) => asset.kind).sort()).toEqual(['avatar', 'banner']);
    expect(await getMediaAsset('asset_inexistente')).toBeNull();
  });

  it('uses the default database name for the singleton connection', () => {
    expect(getStudioDb().name).toBe(STUDIO_DB_NAME);
  });
});
