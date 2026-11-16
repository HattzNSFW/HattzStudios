import { createLocalId } from '@hattz/shared-utils';
import {
  getStudioDb,
  type DraftSnapshotRecord,
  type LocalProfileRecord,
  type PendingSyncOperationRecord,
} from './db';
import { ensureStudioDbReady } from './migrations';

export interface CreateLocalProfileInput {
  technicalId: string;
  displayName: string;
  publicSlugDraft: string;
}

export async function createLocalDraftProfile(
  input: CreateLocalProfileInput,
): Promise<LocalProfileRecord> {
  const db = getStudioDb();
  await ensureStudioDbReady(db);
  const now = Date.now();
  const record: LocalProfileRecord = {
    technicalId: input.technicalId,
    displayName: input.displayName,
    publicSlugDraft: input.publicSlugDraft,
    visibility: 'unpublished',
    schemaVersion: 1,
    contentVersion: 1,
    createdAt: now,
    updatedAt: now,
    lastPublishedVersion: null,
    isDeleted: false,
  };
  await db.localProfiles.put(record);
  return record;
}

export async function saveDraftSnapshot(
  profileTechnicalId: string,
  content: Record<string, unknown>,
  source: DraftSnapshotRecord['source'] = 'manual',
): Promise<DraftSnapshotRecord> {
  const db = getStudioDb();
  await ensureStudioDbReady(db);
  const profile = await db.localProfiles.get(profileTechnicalId);
  if (!profile || profile.isDeleted) {
    throw new Error('Perfil local não encontrado para salvar rascunho.');
  }
  const nextVersion = profile.contentVersion + 1;
  const snapshot: DraftSnapshotRecord = {
    id: createLocalId('snap'),
    profileTechnicalId,
    version: nextVersion,
    label: `${source}-${nextVersion}`,
    content,
    createdAt: Date.now(),
    source,
  };
  await db.transaction('rw', db.draftSnapshots, db.localProfiles, async () => {
    await db.draftSnapshots.put(snapshot);
    await db.localProfiles.update(profileTechnicalId, {
      contentVersion: nextVersion,
      updatedAt: Date.now(),
    });
  });
  return snapshot;
}

export async function enqueuePendingSyncOperation(
  op: Omit<PendingSyncOperationRecord, 'createdAt' | 'updatedAt' | 'attemptCount' | 'state'> & {
    state?: PendingSyncOperationRecord['state'];
    attemptCount?: number;
  },
): Promise<PendingSyncOperationRecord> {
  const db = getStudioDb();
  await ensureStudioDbReady(db);
  const now = Date.now();
  const record: PendingSyncOperationRecord = {
    operationId: op.operationId,
    profileTechnicalId: op.profileTechnicalId,
    type: op.type,
    state: op.state ?? 'pendente',
    payload: op.payload,
    baseVersion: op.baseVersion,
    attemptCount: op.attemptCount ?? 0,
    lastError: op.lastError,
    createdAt: now,
    updatedAt: now,
  };
  await db.pendingSyncOps.put(record);
  return record;
}

export async function listLocalProfiles(): Promise<LocalProfileRecord[]> {
  const db = getStudioDb();
  await ensureStudioDbReady(db);
  return db.localProfiles.filter((p) => !p.isDeleted).sortBy('updatedAt');
}
