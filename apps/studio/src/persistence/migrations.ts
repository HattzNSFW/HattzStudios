import { getStudioDb, STUDIO_DB_VERSION, type StudioDatabase } from './db';

export interface LocalMigrationStatus {
  currentVersion: number;
  expectedVersion: number;
  isReady: boolean;
}

export async function ensureStudioDbReady(db: StudioDatabase = getStudioDb()): Promise<void> {
  await db.open();
  const meta = await db.studioMeta.get('db_schema_version');
  if (!meta || meta.value !== STUDIO_DB_VERSION) {
    await db.studioMeta.put({
      key: 'db_schema_version',
      value: STUDIO_DB_VERSION,
      updatedAt: Date.now(),
    });
  }
}

export async function getLocalMigrationStatus(
  db: StudioDatabase = getStudioDb(),
): Promise<LocalMigrationStatus> {
  await db.open();
  const meta = await db.studioMeta.get('db_schema_version');
  const currentVersion = typeof meta?.value === 'number' ? meta.value : 0;
  return {
    currentVersion,
    expectedVersion: STUDIO_DB_VERSION,
    isReady: currentVersion === STUDIO_DB_VERSION,
  };
}
