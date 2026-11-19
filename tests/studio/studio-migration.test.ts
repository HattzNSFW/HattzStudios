import Dexie, { type Table } from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import {
  STUDIO_DB_VERSION,
  StudioDatabase,
  type DraftSnapshotRecord,
  type LocalProfileRecord,
  type MediaAssetRecord,
  type PendingSyncOperationRecord,
  type StudioMetaRecord,
  type WorkingDraftRecord,
} from '../../apps/studio/src/persistence/db';
import {
  ensureStudioDbReady,
  getLocalMigrationStatus,
} from '../../apps/studio/src/persistence/migrations';

/** Minimal v1-only database, used to exercise the real v1 -> v2 -> v3 upgrade path. */
class V1Database extends Dexie {
  localProfiles!: Table<LocalProfileRecord, string>;
  draftSnapshots!: Table<DraftSnapshotRecord, string>;
  pendingSyncOps!: Table<PendingSyncOperationRecord, string>;
  studioMeta!: Table<StudioMetaRecord, string>;
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

/** Minimal v2-only database, used to exercise the real v2 -> v3 upgrade path. */
class V2Database extends Dexie {
  localProfiles!: Table<LocalProfileRecord, string>;
  draftSnapshots!: Table<DraftSnapshotRecord, string>;
  pendingSyncOps!: Table<PendingSyncOperationRecord, string>;
  studioMeta!: Table<StudioMetaRecord, string>;
  workingDrafts!: Table<WorkingDraftRecord, string>;
  mediaAssets!: Table<MediaAssetRecord, string>;
  constructor(name: string) {
    super(name);
    this.version(1).stores({
      localProfiles: 'technicalId, publicSlugDraft, updatedAt, isDeleted',
      draftSnapshots: 'id, profileTechnicalId, version, createdAt, source',
      pendingSyncOps: 'operationId, profileTechnicalId, state, type, updatedAt',
      studioMeta: 'key, updatedAt',
    });
    this.version(2).stores({
      localProfiles: 'technicalId, publicSlugDraft, updatedAt, isDeleted',
      draftSnapshots: 'id, profileTechnicalId, version, createdAt, source',
      pendingSyncOps: 'operationId, profileTechnicalId, state, type, updatedAt',
      studioMeta: 'key, updatedAt',
      workingDrafts: 'profileTechnicalId, updatedAt',
      mediaAssets: 'assetId, profileTechnicalId, kind, createdAt',
    });
  }
}

const testDbName = () =>
  `hattz_studio_migration_${Date.now()}_${Math.random().toString(36).slice(2)}`;

function profileRecord(technicalId: string, overrides: Partial<LocalProfileRecord> = {}) {
  const now = Date.now();
  return {
    technicalId,
    displayName: 'Legado',
    publicSlugDraft: 'legado',
    visibility: 'unpublished' as const,
    schemaVersion: 1,
    contentVersion: 3,
    createdAt: now,
    updatedAt: now,
    lastPublishedVersion: null,
    isDeleted: false,
    ...overrides,
  };
}

describe('Studio persistence migrations (v1 -> v2 -> v3)', () => {
  const dbs: StudioDatabase[] = [];
  const extraNames: string[] = [];

  afterEach(async () => {
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

  it('upgrades v1 data, seeds the working draft from the latest snapshot, without duplication', async () => {
    const name = testDbName();
    extraNames.push(name);

    const v1 = new V1Database(name);
    await v1.open();
    const now = Date.now();
    await v1.localProfiles.put(profileRecord('prof_v1'));
    await v1.draftSnapshots.bulkPut([
      {
        id: 'snap_2',
        profileTechnicalId: 'prof_v1',
        version: 2,
        label: 'manual-2',
        content: { profile: { displayName: 'Antigo' } },
        createdAt: now,
        source: 'manual',
      },
      {
        id: 'snap_3',
        profileTechnicalId: 'prof_v1',
        version: 3,
        label: 'manual-3',
        content: { profile: { displayName: 'Recente' } },
        createdAt: now,
        source: 'manual',
      },
    ]);
    await v1.pendingSyncOps.put({
      operationId: 'op_v1',
      profileTechnicalId: 'prof_v1',
      type: 'publish_snapshot',
      state: 'pendente',
      payload: { snapshotVersion: 3 },
      baseVersion: 3,
      attemptCount: 0,
      lastError: null,
      createdAt: now,
      updatedAt: now,
    });
    await v1.studioMeta.put({ key: 'legacy_flag', value: 42, updatedAt: now });
    v1.close();

    const upgraded = new StudioDatabase(name);
    dbs.push(upgraded);
    await ensureStudioDbReady(upgraded);

    // Existing data is preserved.
    expect((await upgraded.localProfiles.get('prof_v1'))?.displayName).toBe('Legado');
    expect(await upgraded.draftSnapshots.count()).toBe(2);
    expect(await upgraded.pendingSyncOps.count()).toBe(1);
    expect((await upgraded.studioMeta.get('legacy_flag'))?.value).toBe(42);

    // Working draft seeded from the latest snapshot (no duplication, revision starts at 1).
    expect(await upgraded.workingDrafts.count()).toBe(1);
    const seeded = await upgraded.workingDrafts.get('prof_v1');
    expect(seeded?.content).toEqual({ profile: { displayName: 'Recente' } });
    expect(seeded?.revision).toBe(1);

    // v3 adds the (empty) publications table.
    expect(await upgraded.publications.count()).toBe(0);
    expect((await getLocalMigrationStatus(upgraded)).currentVersion).toBe(STUDIO_DB_VERSION);

    // Reopening (migration already applied) must not duplicate or reseed anything.
    upgraded.close();
    const reopened = new StudioDatabase(name);
    dbs.push(reopened);
    await ensureStudioDbReady(reopened);
    expect(await reopened.workingDrafts.count()).toBe(1);
    const again = await reopened.workingDrafts.get('prof_v1');
    expect(again?.content).toEqual({ profile: { displayName: 'Recente' } });
    expect(again?.revision).toBe(1);
  });

  it('upgrades v2 -> v3 keeping drafts and media and adding an empty publications table', async () => {
    const name = testDbName();
    extraNames.push(name);

    const v2 = new V2Database(name);
    await v2.open();
    const now = Date.now();
    await v2.localProfiles.put(profileRecord('prof_v2', { displayName: 'Vivo' }));
    await v2.workingDrafts.put({
      profileTechnicalId: 'prof_v2',
      content: { profile: { displayName: 'Vivo Editado' } },
      revision: 4,
      createdAt: now,
      updatedAt: now,
    });
    await v2.mediaAssets.put({
      assetId: 'asset_1',
      profileTechnicalId: 'prof_v2',
      kind: 'avatar',
      mimeType: 'image/png',
      size: 10,
      blob: new Blob(['x'], { type: 'image/png' }),
      createdAt: now,
    });
    v2.close();

    const upgraded = new StudioDatabase(name);
    dbs.push(upgraded);
    await ensureStudioDbReady(upgraded);

    const working = await upgraded.workingDrafts.get('prof_v2');
    expect(working?.revision).toBe(4);
    expect(working?.content).toEqual({ profile: { displayName: 'Vivo Editado' } });
    expect(await upgraded.mediaAssets.count()).toBe(1);
    expect(await upgraded.publications.count()).toBe(0);
    expect((await getLocalMigrationStatus(upgraded)).currentVersion).toBe(STUDIO_DB_VERSION);
  });
});
