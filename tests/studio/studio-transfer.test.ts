import { afterEach, describe, expect, it } from 'vitest';
import {
  closeStudioDb,
  getStudioDb,
  STUDIO_DB_VERSION,
  type StudioDatabase,
} from '../../apps/studio/src/persistence/db';
import { ensureStudioDbReady } from '../../apps/studio/src/persistence/migrations';
import {
  MediaAssetInUseError,
  PublicationSlugError,
  StaleDraftError,
  createLocalDraftProfile,
  createWorkingDraft,
  deleteMediaAsset,
  listDraftSnapshots,
  listPendingSyncOperations,
  publishWorkingDraft,
  restoreDraftSnapshot,
  restorePublishedVersion,
  saveDraftSnapshot,
  storeMediaAsset,
  updatePublicSlugDraft,
} from '../../apps/studio/src/persistence/repository';
import {
  BACKUP_FORMAT,
  DRAFT_FORMAT,
  TransferFormatError,
  blobToDataUrl,
  dataUrlToBlob,
  exportBackup,
  exportProfileDraft,
  importProfileDraft,
  restoreBackup,
} from '../../apps/studio/src/persistence/transfer';
import { createEmptyDraft, slugForPreview, toSnapshotRecord } from '../../apps/studio/src/editor';

describe('Studio — transferência, histórico e mídia referência-segura', () => {
  const dbs: StudioDatabase[] = [];

  afterEach(async () => {
    await closeStudioDb();
    for (const db of dbs.splice(0)) {
      db.close();
      await db.delete();
    }
  });

  async function seed(id: string, name = 'Alice'): Promise<void> {
    const db = getStudioDb();
    if (!dbs.includes(db)) dbs.push(db);
    await ensureStudioDbReady(db);
    await createLocalDraftProfile({
      technicalId: id,
      displayName: name,
      publicSlugDraft: slugForPreview(name),
    });
    await createWorkingDraft(id, toSnapshotRecord(createEmptyDraft(name)));
  }

  it('codifica e decodifica mídia sem perder bytes', async () => {
    const original = new Blob(['conteudo-avatar'], { type: 'image/png' });
    const dataUrl = await blobToDataUrl(original);
    expect(dataUrl).toMatch(/^data:image\/png;base64,/);
    const restored = dataUrlToBlob(dataUrl);
    expect(restored.type).toBe('image/png');
    expect(await blobToDataUrl(restored)).toBe(dataUrl);
  });

  it('exporta e importa um rascunho como novo perfil, remapeando IDs de mídia', async () => {
    // fake-indexeddb neste ambiente serializa Blob como objeto vazio; por isso o transporte é
    // construído explicitamente com bytes reais, exatamente como o exportador faz no navegador.
    const dataUrl = await blobToDataUrl(new Blob(['conteudo-avatar'], { type: 'image/png' }));
    await seed('prof_origem');
    const db = getStudioDb();
    const working = await db.workingDrafts.get('prof_origem');
    expect(working).not.toBeNull();
    await db.workingDrafts.update('prof_origem', {
      content: {
        ...working!.content,
        profile: { displayName: 'Alice', avatarAssetId: 'asset_fixture' },
      },
    });

    const exported = JSON.parse(JSON.stringify(await exportProfileDraft('prof_origem')));
    exported.mediaAssets = [
      {
        assetId: 'asset_fixture',
        profileTechnicalId: 'prof_origem',
        kind: 'avatar',
        mimeType: 'image/png',
        size: 15,
        createdAt: Date.now(),
        dataUrl,
      },
    ];
    expect(exported.format).toBe(DRAFT_FORMAT);
    expect(exported.content).toMatchObject({ profile: { avatarAssetId: 'asset_fixture' } });

    const imported = await importProfileDraft(exported);
    expect(imported.profile.technicalId).not.toBe('prof_origem');
    expect(imported.profile.visibility).toBe('unpublished');
    expect(imported.mediaAssets).toHaveLength(1);
    expect(imported.mediaAssets[0]!.assetId).not.toBe('asset_fixture');
    expect(imported.mediaAssets[0]!.profileTechnicalId).toBe(imported.profile.technicalId);
    expect(imported.workingDraft.content).toMatchObject({
      profile: { avatarAssetId: imported.mediaAssets[0]!.assetId },
    });
    expect(await db.mediaAssets.count()).toBe(1);
  });

  it('rejeita rascunho importado com conteúdo fora do contrato público', async () => {
    await expect(
      importProfileDraft({
        format: DRAFT_FORMAT,
        formatVersion: 1,
        content: { admin: { secreto: true }, profile: { displayName: 'X' } },
        mediaAssets: [],
      }),
    ).rejects.toBeInstanceOf(TransferFormatError);
  });

  it('faz round-trip de backup completo e restaura mídia com o dono correto', async () => {
    await seed('prof_backup');
    await saveDraftSnapshot('prof_backup', toSnapshotRecord(createEmptyDraft('Alice')), 'manual');
    await publishWorkingDraft('prof_backup', { slug: 'alice' });

    const backup = JSON.parse(JSON.stringify(await exportBackup()));
    backup.mediaAssets = [
      {
        assetId: 'asset_backup',
        profileTechnicalId: 'prof_backup',
        kind: 'banner',
        mimeType: 'image/png',
        size: 6,
        createdAt: Date.now(),
        dataUrl: await blobToDataUrl(new Blob(['banner'], { type: 'image/png' })),
      },
    ];
    expect(backup.format).toBe(BACKUP_FORMAT);
    expect(backup.source.schemaVersion).toBe(STUDIO_DB_VERSION);
    expect(backup.publications).toHaveLength(1);

    // Mutação destrutiva controlada: apaga tudo e restaura.
    const db = getStudioDb();
    await db.localProfiles.clear();
    await db.publications.clear();
    await db.mediaAssets.clear();
    const result = await restoreBackup(backup);

    expect(result.profiles).toBe(1);
    expect(result.publications).toBe(1);
    expect(result.mediaAssets).toBe(1);
    const restoredAsset = await db.mediaAssets.toArray();
    expect(restoredAsset[0]!.profileTechnicalId).toBe('prof_backup');
    expect(await db.publications.toArray()).toHaveLength(1);
  });

  it('recusa backup de versão mais recente que o schema local', async () => {
    const backup = await exportBackup();
    const future = {
      ...backup,
      source: { ...backup.source, schemaVersion: STUDIO_DB_VERSION + 1 },
    };
    await expect(restoreBackup(future)).rejects.toThrow(/versão mais recente/i);
  });

  it('salva e restaura checkpoints sem apagar o histórico', async () => {
    await seed('prof_hist');
    const first = await saveDraftSnapshot(
      'prof_hist',
      toSnapshotRecord(createEmptyDraft('Alice')),
      'manual',
    );
    await saveDraftSnapshot('prof_hist', toSnapshotRecord(createEmptyDraft('Alice 2')), 'autosave');
    const snapshots = await listDraftSnapshots('prof_hist');
    expect(snapshots.map((entry) => entry.version)).toEqual([3, 2]);

    await restoreDraftSnapshot('prof_hist', first.version, 1);
    const working = await getStudioDbInstanceDraft('prof_hist');
    expect(working.revision).toBe(2);
    expect(await listDraftSnapshots('prof_hist')).toHaveLength(2);

    await expect(restoreDraftSnapshot('prof_hist', first.version, 1)).rejects.toBeInstanceOf(
      StaleDraftError,
    );
  });

  async function getStudioDbInstanceDraft(id: string) {
    const record = await getStudioDb().workingDrafts.get(id);
    if (!record) throw new Error('rascunho ausente');
    return record;
  }

  it('copia uma versão publicada para o rascunho sem criar nova publicação', async () => {
    await seed('prof_pub');
    const publication = await publishWorkingDraft('prof_pub', { slug: 'alice' });
    const saved = await restorePublishedVersion('prof_pub', publication.version, 1);
    expect(saved.revision).toBe(2);
    expect(await getStudioDb().publications.count()).toBe(1);
  });

  it('exibe a fila de sincronização sem drená-la', async () => {
    await seed('prof_sync');
    const operations = await listPendingSyncOperations('prof_sync');
    expect(operations).toEqual([]);
  });

  it('recusa excluir mídia referenciada e permite excluir após remover a referência', async () => {
    await seed('prof_media');
    const asset = await storeMediaAsset({
      profileTechnicalId: 'prof_media',
      kind: 'avatar',
      blob: new Blob(['x'], { type: 'image/png' }),
    });
    const db = getStudioDb();
    const working = await db.workingDrafts.get('prof_media');
    await db.workingDrafts.update('prof_media', {
      content: {
        ...working!.content,
        profile: { displayName: 'Alice', avatarAssetId: asset.assetId },
      },
    });

    await expect(deleteMediaAsset(asset.assetId)).rejects.toBeInstanceOf(MediaAssetInUseError);
    await db.workingDrafts.update('prof_media', {
      content: toSnapshotRecord(createEmptyDraft('Alice')),
    });
    await deleteMediaAsset(asset.assetId);
    expect(await db.mediaAssets.get(asset.assetId)).toBeUndefined();
  });

  it('valida e atualiza o endereço rascunho sem publicar', async () => {
    await seed('prof_slug');
    await expect(updatePublicSlugDraft('prof_slug', 'Slug Invalido')).rejects.toBeInstanceOf(
      PublicationSlugError,
    );
    await expect(updatePublicSlugDraft('prof_slug', 'control')).rejects.toBeInstanceOf(
      PublicationSlugError,
    );
    const updated = await updatePublicSlugDraft('prof_slug', 'meu-endereco');
    expect(updated.publicSlugDraft).toBe('meu-endereco');
    expect(await getStudioDb().publications.count()).toBe(0);
  });
});
