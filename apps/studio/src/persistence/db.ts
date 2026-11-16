import Dexie, { type Table } from 'dexie';

export type LocalProfileVisibility = 'private' | 'unpublished' | 'public_intent';

export interface LocalProfileRecord {
  technicalId: string; // permanente, independente de nome público
  publicSlugDraft: string;
  displayName: string;
  visibility: LocalProfileVisibility;
  schemaVersion: number;
  contentVersion: number;
  createdAt: number;
  updatedAt: number;
  lastPublishedVersion: number | null;
  isDeleted: boolean;
}

export interface DraftSnapshotRecord {
  id: string;
  profileTechnicalId: string;
  version: number;
  label: string;
  content: Record<string, unknown>;
  createdAt: number;
  source: 'manual' | 'autosave' | 'migration';
}

export interface PendingSyncOperationRecord {
  operationId: string;
  profileTechnicalId: string | null;
  type: string;
  state: 'pendente' | 'falhou' | 'conflito' | 'sincronizando';
  payload: Record<string, unknown>;
  baseVersion: number | null;
  attemptCount: number;
  lastError: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface StudioMetaRecord {
  key: string;
  value: unknown;
  updatedAt: number;
}

export const STUDIO_DB_NAME = 'hattz_studio';
export const STUDIO_DB_VERSION = 1;

export class StudioDatabase extends Dexie {
  localProfiles!: Table<LocalProfileRecord, string>;
  draftSnapshots!: Table<DraftSnapshotRecord, string>;
  pendingSyncOps!: Table<PendingSyncOperationRecord, string>;
  studioMeta!: Table<StudioMetaRecord, string>;

  constructor(name = STUDIO_DB_NAME) {
    super(name);

    // v1: base local-first (rascunhos, snapshots, fila de sync, metadados)
    this.version(1).stores({
      localProfiles: 'technicalId, publicSlugDraft, updatedAt, isDeleted',
      draftSnapshots: 'id, profileTechnicalId, version, createdAt, source',
      pendingSyncOps: 'operationId, profileTechnicalId, state, type, updatedAt',
      studioMeta: 'key, updatedAt',
    });

    // Exemplo de evolução futura: incrementar versão e adicionar .upgrade(tx => {...})
    // this.version(2).stores({...}).upgrade(async (tx) => { /* migração local */ });
  }
}

let dbInstance: StudioDatabase | null = null;

export function getStudioDb(): StudioDatabase {
  if (!dbInstance) {
    dbInstance = new StudioDatabase();
  }
  return dbInstance;
}

export async function closeStudioDb(): Promise<void> {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
