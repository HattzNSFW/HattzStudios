import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  closeStudioDb,
  getStudioDb,
  STUDIO_DB_VERSION,
  type StudioDatabase,
} from '../../apps/studio/src/persistence/db';
import {
  ensureStudioDbReady,
  getLocalMigrationStatus,
} from '../../apps/studio/src/persistence/migrations';
import {
  createLocalDraftProfile,
  createWorkingDraft,
  deleteMediaAsset,
  enqueuePendingSyncOperation,
  MediaAssetInUseError,
} from '../../apps/studio/src/persistence/repository';
import {
  BACKUP_FORMAT,
  MEDIA_SAFETY_LIMITS,
  TransferFormatError,
  blobToDataUrl,
  dataUrlToBlob,
  exportBackup,
  exportProfileDraft,
  importProfileDraft,
  restoreBackup,
} from '../../apps/studio/src/persistence/transfer';
import { createEmptyDraft, slugForPreview, toSnapshotRecord } from '../../apps/studio/src/editor';

describe('Studio — regressões corretivas de transferência e persistência', () => {
  const dbs: StudioDatabase[] = [];

  afterEach(async () => {
    vi.restoreAllMocks();
    await closeStudioDb();
    for (const db of dbs.splice(0)) {
      db.close();
      await db.delete();
    }
  });

  async function seed(technicalId: string, name = 'Alice'): Promise<void> {
    const db = getStudioDb();
    if (!dbs.includes(db)) dbs.push(db);
    await ensureStudioDbReady(db);
    await createLocalDraftProfile({
      technicalId,
      displayName: name,
      publicSlugDraft: slugForPreview(name),
    });
    await createWorkingDraft(technicalId, toSnapshotRecord(createEmptyDraft(name)));
  }

  async function validDraftPayload(technicalId = 'prof_import') {
    await seed(technicalId);
    return JSON.parse(JSON.stringify(await exportProfileDraft(technicalId))) as Record<
      string,
      unknown
    >;
  }

  it('rejeita slugs inválidos, reservados e ausentes na importação (nunca os inventa)', async () => {
    const base = await validDraftPayload('prof_slug_import');

    for (const slug of ['studio', 'Slug Invalido', 'ab', '', 'com__dois']) {
      await expect(importProfileDraft({ ...base, publicSlugDraft: slug })).rejects.toBeInstanceOf(
        TransferFormatError,
      );
    }
    const missing = { ...base };
    delete missing.publicSlugDraft;
    await expect(importProfileDraft(missing)).rejects.toBeInstanceOf(TransferFormatError);

    const valid = await importProfileDraft({ ...base, publicSlugDraft: 'Meu-Endereco' });
    expect(valid.profile.publicSlugDraft).toBe('meu-endereco');
  });

  it('recusa exportar conteúdo que a própria importação rejeitaria', async () => {
    await seed('prof_export_invalid');
    const db = getStudioDb();
    await db.workingDrafts.update('prof_export_invalid', {
      content: { schemaVersion: 1, profile: { displayName: '' }, sections: [] },
    });
    await expect(exportProfileDraft('prof_export_invalid')).rejects.toBeInstanceOf(
      TransferFormatError,
    );
  });

  it('rejeita mídia acima do limite técnico antes de decodificar base64', async () => {
    const atobSpy = vi.spyOn(globalThis, 'atob');
    const base = await validDraftPayload('prof_media_limit');
    const transport = {
      assetId: 'asset_limit',
      profileTechnicalId: 'prof_media_limit',
      kind: 'avatar',
      mimeType: 'image/png',
      size: MEDIA_SAFETY_LIMITS.maxAssetBytes + 1,
      createdAt: Date.now(),
      dataUrl: await blobToDataUrl(new Blob(['x'], { type: 'image/png' })),
    };

    await expect(importProfileDraft({ ...base, mediaAssets: [transport] })).rejects.toBeInstanceOf(
      TransferFormatError,
    );
    expect(atobSpy).not.toHaveBeenCalled();
    expect(await getStudioDb().mediaAssets.count()).toBe(0);
  });

  it('rejeita excesso de arquivos antes de decodificar base64', async () => {
    const atobSpy = vi.spyOn(globalThis, 'atob');
    const base = await validDraftPayload('prof_media_count');
    const dataUrl = await blobToDataUrl(new Blob(['x'], { type: 'image/png' }));
    const transports = Array.from({ length: MEDIA_SAFETY_LIMITS.maxAssets + 1 }, (_, index) => ({
      assetId: `asset_${index}`,
      profileTechnicalId: 'prof_media_count',
      kind: 'image' as const,
      mimeType: 'image/png',
      size: 1,
      createdAt: Date.now(),
      dataUrl,
    }));

    await expect(importProfileDraft({ ...base, mediaAssets: transports })).rejects.toBeInstanceOf(
      TransferFormatError,
    );
    expect(atobSpy).not.toHaveBeenCalled();
  });

  it('rejeita dataUrl grande diretamente em dataUrlToBlob', async () => {
    const atobSpy = vi.spyOn(globalThis, 'atob');
    const encodedLimit = Math.ceil((MEDIA_SAFETY_LIMITS.maxAssetBytes * 4) / 3) + 256;
    const oversized = `data:image/png;base64,${'A'.repeat(encodedLimit + 1)}`;
    expect(() => dataUrlToBlob(oversized)).toThrow(TransferFormatError);
    expect(atobSpy).not.toHaveBeenCalled();
  });

  it('mantém db_schema_version alinhado ao schema ao restaurar backup mais antigo', async () => {
    await seed('prof_schema');
    const backup = JSON.parse(JSON.stringify(await exportBackup())) as Record<string, unknown>;
    backup.source = { dbName: 'hattz_studio', schemaVersion: STUDIO_DB_VERSION - 1 };
    backup.studioMeta = [
      { key: 'db_schema_version', value: STUDIO_DB_VERSION - 1, updatedAt: Date.now() },
    ];

    await restoreBackup(backup);

    expect(backup.format).toBe(BACKUP_FORMAT);
    expect(await getLocalMigrationStatus()).toEqual({
      currentVersion: STUDIO_DB_VERSION,
      expectedVersion: STUDIO_DB_VERSION,
      isReady: true,
    });
  });

  it('lê todas as tabelas em uma única transação de backup', async () => {
    await seed('prof_txn');
    const db = getStudioDb();
    const transaction = vi.spyOn(db, 'transaction');

    await exportBackup();

    expect(transaction).toHaveBeenCalled();
    const readonlyCall = transaction.mock.calls.find((call) => call[0] === 'r');
    expect(readonlyCall).toBeDefined();
    expect(Array.isArray(readonlyCall![1])).toBe(true);
    expect(readonlyCall![1]).toHaveLength(10);
  });

  it('protege mídia referenciada por uma operação pendente na fila local', async () => {
    await seed('prof_pending_ref');
    const asset = await createAsset('prof_pending_ref');
    await enqueuePendingSyncOperation({
      operationId: 'op_media_ref',
      profileTechnicalId: 'prof_pending_ref',
      type: 'upsert_profile',
      payload: { avatarAssetId: asset.assetId },
      baseVersion: 1,
      lastError: null,
    });

    await expect(deleteMediaAsset(asset.assetId)).rejects.toBeInstanceOf(MediaAssetInUseError);
    expect(await getStudioDb().mediaAssets.get(asset.assetId)).toBeDefined();
  });

  async function createAsset(profileTechnicalId: string) {
    const { storeMediaAsset } = await import('../../apps/studio/src/persistence/repository');
    return storeMediaAsset({
      profileTechnicalId,
      kind: 'avatar',
      blob: new Blob(['x'], { type: 'image/png' }),
    });
  }
});
