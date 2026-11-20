import { afterEach, describe, expect, it } from 'vitest';
import { isMediaAssetKind, MEDIA_ASSET_KINDS } from '@hattz/contracts';
import {
  closeStudioDb,
  getStudioDb,
  type StudioDatabase,
} from '../../apps/studio/src/persistence/db';
import { ensureStudioDbReady } from '../../apps/studio/src/persistence/migrations';
import {
  createLocalDraftProfile,
  createWorkingDraft,
  listMediaAssets,
  storeMediaAsset,
} from '../../apps/studio/src/persistence/repository';
import {
  blobToDataUrl,
  exportBackup,
  restoreBackup,
  TransferFormatError,
} from '../../apps/studio/src/persistence/transfer';
import { createEmptyDraft, slugForPreview, toSnapshotRecord } from '../../apps/studio/src/editor';

describe('Fase corretiva — contrato de mídia e blindagem de oficialidade', () => {
  const dbs: StudioDatabase[] = [];

  afterEach(async () => {
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

  it('expõe exatamente os 11 valores canônicos no pacote compartilhado', () => {
    // A lista de valores e a paridade com o CHECK SQL são verificadas por
    // tests/integrity/media-parity.test.ts contra a fonte canônica.
    expect(MEDIA_ASSET_KINDS).toHaveLength(11);
    for (const kind of MEDIA_ASSET_KINDS) expect(isMediaAssetKind(kind)).toBe(true);
    expect(isMediaAssetKind('unknown')).toBe(false);
    expect(isMediaAssetKind(123)).toBe(false);
  });

  it('aceita os 11 valores na persistência local', async () => {
    await seed('prof_all_kinds');
    for (const kind of MEDIA_ASSET_KINDS) {
      await storeMediaAsset({
        profileTechnicalId: 'prof_all_kinds',
        kind,
        blob: new Blob([kind], { type: 'application/octet-stream' }),
      });
    }
    const assets = await listMediaAssets('prof_all_kinds');
    expect(assets.map((asset) => asset.kind).sort()).toEqual([...MEDIA_ASSET_KINDS].sort());
  });

  it('rejeita kind desconhecido em runtime, não apenas por tipo', async () => {
    await seed('prof_bad_kind');
    await expect(
      storeMediaAsset({
        profileTechnicalId: 'prof_bad_kind',
        kind: 'unknown' as never,
        blob: new Blob(['x'], { type: 'application/octet-stream' }),
      }),
    ).rejects.toThrow(/Tipo de mídia desconhecido/);
    expect(await listMediaAssets('prof_bad_kind')).toHaveLength(0);
  });

  async function backupWithProfile() {
    await seed('prof_backup_guard', 'Alice');
    return JSON.parse(JSON.stringify(await exportBackup())) as {
      profiles: Array<Record<string, unknown>>;
    } & Record<string, unknown>;
  }

  it('rejeita backup que tenta injetar identidade oficial', async () => {
    const backup = await backupWithProfile();
    backup.profiles[0]!.officialCode = 'MT7QTEVMZY';
    await expect(restoreBackup(backup)).rejects.toBeInstanceOf(TransferFormatError);
  });

  it('rejeita a flag booleana de oficialidade em backup', async () => {
    const backup = await backupWithProfile();
    backup.profiles[0]!.isOfficial = true;
    await expect(restoreBackup(backup)).rejects.toBeInstanceOf(TransferFormatError);
  });

  it('rejeita backup com kind de mídia desconhecido', async () => {
    // O blob lido de volta do fake-IndexedDB não expõe arrayBuffer() neste ambiente de teste;
    // por isso o ativo é injetado diretamente no backup — é exatamente a fronteira que valida
    // `kind` em runtime durante a importação.
    const backup = await backupWithProfile();
    const dataUrl = await blobToDataUrl(new Blob(['x'], { type: 'image/png' }));
    const withMedia = backup as typeof backup & { mediaAssets: Array<Record<string, unknown>> };
    withMedia.mediaAssets = [
      {
        assetId: 'asset_unknown_kind',
        profileTechnicalId: 'prof_backup_guard',
        kind: 'unknown',
        mimeType: 'image/png',
        size: 1,
        createdAt: Date.now(),
        dataUrl,
      },
    ];
    await expect(restoreBackup(withMedia)).rejects.toBeInstanceOf(TransferFormatError);
  });

  it('mantém o dataUrl de mídia no formato de backup', async () => {
    const dataUrl = await blobToDataUrl(new Blob(['x'], { type: 'image/png' }));
    expect(dataUrl).toMatch(/^data:image\/png;base64,/);
  });
});
