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

const testDbName = () => `hattz_studio_fail_${Date.now()}_${Math.random().toString(36).slice(2)}`;

describe('Studio IndexedDB failure scenarios (local resilience)', () => {
  const dbs: StudioDatabase[] = [];

  afterEach(async () => {
    await closeStudioDb();
    for (const db of dbs.splice(0)) {
      try {
        db.close();
      } catch {
        // ignore
      }
      try {
        await db.delete();
      } catch {
        // ignore
      }
    }
  });

  it('rejects invalid persistence operations with explicit errors (no silent success)', async () => {
    const db = new StudioDatabase(testDbName());
    dbs.push(db);
    await ensureStudioDbReady(db);

    // duplicate primary key (operationId) must fail
    const now = Date.now();
    await db.pendingSyncOps.add({
      operationId: 'dup_op',
      profileTechnicalId: 'p1',
      type: 'sync',
      state: 'pendente',
      payload: {},
      baseVersion: 1,
      attemptCount: 0,
      lastError: null,
      createdAt: now,
      updatedAt: now,
    });

    await expect(
      db.pendingSyncOps.add({
        operationId: 'dup_op',
        profileTechnicalId: 'p1',
        type: 'sync',
        state: 'pendente',
        payload: {},
        baseVersion: 1,
        attemptCount: 0,
        lastError: null,
        createdAt: now,
        updatedAt: now,
      }),
    ).rejects.toBeTruthy();

    const rows = await db.pendingSyncOps.where('operationId').equals('dup_op').toArray();
    expect(rows).toHaveLength(1);
  });

  it('reports not-ready/mismatched status when schema meta is missing or stale', async () => {
    const name = testDbName();
    const db = new StudioDatabase(name);
    dbs.push(db);
    await db.open();
    // simulate missing/stale meta without running ensureStudioDbReady
    await db.studioMeta.clear();
    let status = await getLocalMigrationStatus(db);
    expect(status.currentVersion).toBe(0);
    expect(status.expectedVersion).toBe(STUDIO_DB_VERSION);
    expect(status.isReady).toBe(false);

    await db.studioMeta.put({
      key: 'db_schema_version',
      value: STUDIO_DB_VERSION - 1,
      updatedAt: Date.now(),
    });
    status = await getLocalMigrationStatus(db);
    expect(status.isReady).toBe(false);
  });

  it('fails clearly when database is closed during operation', async () => {
    const db = new StudioDatabase(testDbName());
    dbs.push(db);
    await ensureStudioDbReady(db);
    db.close();
    await expect(db.localProfiles.toArray()).rejects.toBeTruthy();
  });
});
