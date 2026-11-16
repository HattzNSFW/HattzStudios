import { afterEach, describe, expect, it } from 'vitest';
import {
  StudioDatabase,
  closeStudioDb,
  STUDIO_DB_VERSION,
} from '../../apps/studio/src/persistence/db';
import {
  ensureStudioDbReady,
  getLocalMigrationStatus,
} from '../../apps/studio/src/persistence/migrations';

const testDbName = () => `hattz_studio_test_${Date.now()}_${Math.random().toString(36).slice(2)}`;

describe('Studio IndexedDB persistence (Dexie)', () => {
  const dbs: StudioDatabase[] = [];

  afterEach(async () => {
    await closeStudioDb();
    for (const db of dbs.splice(0)) {
      db.close();
      await db.delete();
    }
  });

  it('initializes schema metadata/versioning and remains usable offline-locally', async () => {
    const db = new StudioDatabase(testDbName());
    dbs.push(db);
    await ensureStudioDbReady(db);
    const status = await getLocalMigrationStatus(db);
    expect(status.expectedVersion).toBe(STUDIO_DB_VERSION);
    expect(status.currentVersion).toBe(STUDIO_DB_VERSION);
    expect(status.isReady).toBe(true);
  });

  it('persists local draft profiles with permanent technical ids and versioned snapshots', async () => {
    const db = new StudioDatabase(testDbName());
    dbs.push(db);
    // inject test db by using it directly through helpers pattern: temporarily set global by ensuring ready on this db
    await ensureStudioDbReady(db);

    // Use direct db operations to validate persistence without relying on singleton instance name
    const now = Date.now();
    await db.localProfiles.put({
      technicalId: 'prof_tech_001',
      displayName: 'Perfil Local',
      publicSlugDraft: 'perfil-local',
      visibility: 'unpublished',
      schemaVersion: 1,
      contentVersion: 1,
      createdAt: now,
      updatedAt: now,
      lastPublishedVersion: null,
      isDeleted: false,
    });

    await db.transaction('rw', db.draftSnapshots, db.localProfiles, async () => {
      await db.draftSnapshots.put({
        id: 'snap_1',
        profileTechnicalId: 'prof_tech_001',
        version: 2,
        label: 'manual-2',
        content: { hero: { title: 'Olá' } },
        createdAt: Date.now(),
        source: 'manual',
      });
      await db.localProfiles.update('prof_tech_001', { contentVersion: 2, updatedAt: Date.now() });
    });

    const profile = await db.localProfiles.get('prof_tech_001');
    const snapshots = await db.draftSnapshots
      .where('profileTechnicalId')
      .equals('prof_tech_001')
      .toArray();
    expect(profile?.technicalId).toBe('prof_tech_001');
    expect(profile?.contentVersion).toBe(2);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]?.content).toEqual({ hero: { title: 'Olá' } });
  });

  it('stores pending sync operations with idempotent operation ids and states', async () => {
    const db = new StudioDatabase(testDbName());
    dbs.push(db);
    await ensureStudioDbReady(db);

    await db.pendingSyncOps.put({
      operationId: 'op_123',
      profileTechnicalId: 'prof_tech_001',
      type: 'publish_snapshot',
      state: 'pendente',
      payload: { snapshotVersion: 2 },
      baseVersion: 2,
      attemptCount: 0,
      lastError: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const op = await db.pendingSyncOps.get('op_123');
    expect(op?.state).toBe('pendente');
    expect(op?.operationId).toBe('op_123');
  });
});
