/**
 * Transferência local de dados do Studio (sem rede, sem backend).
 *
 * Dois formatos versionados:
 * - `hattz-studio-draft`: um perfil/rascunho, para importação como NOVO perfil local;
 * - `hattz-studio-backup`: base local inteira, para restauração explícita e destrutiva.
 *
 * Nenhum formato carrega autoridade administrativa, segredos ou dados de sessão: apenas registros
 * locais já existentes no IndexedDB. Todo conteúdo importado passa pelo validador canônico.
 */

import { createLocalId } from '@hattz/shared-utils';
import { validatePublishableSnapshotContent } from '@hattz/validation';
import {
  STUDIO_DB_NAME,
  STUDIO_DB_VERSION,
  type DraftSnapshotRecord,
  type LocalProfileRecord,
  type LocalPublicationRecord,
  type MediaAssetKind,
  type MediaAssetRecord,
  type PendingSyncOperationRecord,
  type StudioMetaRecord,
  type UserBadgeRecord,
  type UserCollectionProgressRecord,
  type UserFrameRecord,
  type WorkingDraftRecord,
} from './db';
import { getStudioDb } from './db';
import { ensureStudioDbReady } from './migrations';

export const DRAFT_FORMAT = 'hattz-studio-draft';
export const DRAFT_FORMAT_VERSION = 1;
export const BACKUP_FORMAT = 'hattz-studio-backup';
export const BACKUP_FORMAT_VERSION = 1;

const MEDIA_KINDS = new Set<MediaAssetKind>(['avatar', 'banner', 'image', 'audio', 'cover']);

/* ------------------------------------------------------------------ */
/* Tipos de transporte                                                 */
/* ------------------------------------------------------------------ */

export interface MediaAssetTransport {
  assetId: string;
  profileTechnicalId: string;
  kind: MediaAssetKind;
  mimeType: string;
  size: number;
  createdAt: number;
  /** Blob codificado como data URL (`data:<mime>;base64,...`). */
  dataUrl: string;
}

export interface StudioDraftExport {
  format: typeof DRAFT_FORMAT;
  formatVersion: typeof DRAFT_FORMAT_VERSION;
  exportedAt: string;
  profileTechnicalId: string;
  publicSlugDraft: string;
  displayName: string;
  content: Record<string, unknown>;
  mediaAssets: MediaAssetTransport[];
}

export interface StudioBackup {
  format: typeof BACKUP_FORMAT;
  formatVersion: typeof BACKUP_FORMAT_VERSION;
  exportedAt: string;
  source: { dbName: string; schemaVersion: number };
  profiles: LocalProfileRecord[];
  draftSnapshots: DraftSnapshotRecord[];
  workingDrafts: WorkingDraftRecord[];
  publications: LocalPublicationRecord[];
  mediaAssets: MediaAssetTransport[];
  pendingSyncOps: PendingSyncOperationRecord[];
  studioMeta: StudioMetaRecord[];
  userBadges: UserBadgeRecord[];
  userFrames: UserFrameRecord[];
  userCollectionProgress: UserCollectionProgressRecord[];
}

export class TransferFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TransferFormatError';
  }
}

/* ------------------------------------------------------------------ */
/* Blob <-> data URL                                                   */
/* ------------------------------------------------------------------ */

/**
 * Codifica um Blob como data URL. Usa `FileReader` (presente em navegadores e jsdom) e aceita
 * `arrayBuffer()` como alternativa para ambientes onde o FileReader não reconhece o objeto.
 * Se nenhum caminho conseguir ler os bytes, falha explicitamente — nunca gera um dado fictício.
 */
export async function blobToDataUrl(blob: Blob): Promise<string> {
  if (typeof blob?.arrayBuffer === 'function') {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (let index = 0; index < bytes.length; index += 8192) {
      binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
    }
    return `data:${blob.type || 'application/octet-stream'};base64,${btoa(binary)}`;
  }
  if (typeof FileReader === 'function') {
    try {
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
        reader.onerror = () => reject(new Error('FileReader falhou.'));
        reader.readAsDataURL(blob);
      });
    } catch {
      // cai no erro explícito abaixo
    }
  }
  throw new TransferFormatError('Não foi possível ler os bytes do arquivo de mídia.');
}

export function dataUrlToBlob(
  dataUrl: string,
  fallbackMimeType = 'application/octet-stream',
): Blob {
  const match = /^data:([^;,]*)(;base64)?,([\s\S]*)$/.exec(dataUrl);
  if (!match || !match[2]) {
    throw new TransferFormatError('Arquivo de mídia inválido no arquivo importado.');
  }
  const mimeType = match[1] || fallbackMimeType;
  const bytes = Uint8Array.from(atob(match[3]!), (character) => character.charCodeAt(0));
  return new Blob([bytes], { type: mimeType });
}

async function toTransport(asset: MediaAssetRecord): Promise<MediaAssetTransport> {
  return {
    assetId: asset.assetId,
    profileTechnicalId: asset.profileTechnicalId,
    kind: asset.kind,
    mimeType: asset.mimeType,
    size: asset.size,
    createdAt: asset.createdAt,
    dataUrl: await blobToDataUrl(asset.blob),
  };
}

function fromTransport(asset: MediaAssetTransport): MediaAssetRecord {
  if (
    !asset ||
    typeof asset.assetId !== 'string' ||
    typeof asset.profileTechnicalId !== 'string' ||
    !MEDIA_KINDS.has(asset.kind)
  ) {
    throw new TransferFormatError('Ativo de mídia inválido no arquivo importado.');
  }
  const blob = dataUrlToBlob(asset.dataUrl, asset.mimeType);
  return {
    assetId: asset.assetId,
    profileTechnicalId: asset.profileTechnicalId,
    kind: asset.kind,
    mimeType: asset.mimeType || blob.type || 'application/octet-stream',
    size: asset.size,
    blob,
    createdAt: asset.createdAt,
  };
}

/* ------------------------------------------------------------------ */
/* Validação de envelope                                               */
/* ------------------------------------------------------------------ */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new TransferFormatError(`Campo "${field}" inválido no arquivo importado.`);
  }
  return value;
}

function requireContent(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new TransferFormatError('Conteúdo do perfil inválido no arquivo importado.');
  }
  return value;
}

function assertPublishable(content: Record<string, unknown>): void {
  const result = validatePublishableSnapshotContent(content);
  if (!result.ok) {
    throw new TransferFormatError('O conteúdo importado não corresponde ao contrato público.');
  }
}

/* ------------------------------------------------------------------ */
/* Exportação / importação de um perfil                                */
/* ------------------------------------------------------------------ */

export async function exportProfileDraft(profileTechnicalId: string): Promise<StudioDraftExport> {
  const db = getStudioDb();
  await ensureStudioDbReady(db);
  const profile = await db.localProfiles.get(profileTechnicalId);
  if (!profile || profile.isDeleted) {
    throw new TransferFormatError('Perfil local não encontrado para exportação.');
  }
  const working = await db.workingDrafts.get(profileTechnicalId);
  if (!working) {
    throw new TransferFormatError('Rascunho de trabalho não encontrado para exportação.');
  }
  const media = await db.mediaAssets
    .where('profileTechnicalId')
    .equals(profileTechnicalId)
    .toArray();
  return {
    format: DRAFT_FORMAT,
    formatVersion: DRAFT_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    profileTechnicalId: profile.technicalId,
    publicSlugDraft: profile.publicSlugDraft,
    displayName: profile.displayName,
    content: requireContent(working.content),
    mediaAssets: await Promise.all(media.map(toTransport)),
  };
}

/** Reescreve recursivamente referências de assetId preservando o restante do conteúdo. */
export function remapAssetIds(value: unknown, mapping: ReadonlyMap<string, string>): unknown {
  if (typeof value === 'string') return mapping.get(value) ?? value;
  if (Array.isArray(value)) return value.map((item) => remapAssetIds(item, mapping));
  if (isRecord(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) out[key] = remapAssetIds(item, mapping);
    return out;
  }
  return value;
}

export interface ImportedProfileDraft {
  profile: LocalProfileRecord;
  workingDraft: WorkingDraftRecord;
  mediaAssets: MediaAssetRecord[];
}

/**
 * Importa um rascunho como NOVO perfil local. IDs técnicos e de mídia são sempre regenerados para
 * não sobrescrever dados existentes. Nenhuma publicação é criada: o perfil entra como rascunho
 * local e precisa ser validado/publicado explicitamente pelo Studio.
 */
export async function importProfileDraft(payload: unknown): Promise<ImportedProfileDraft> {
  if (!isRecord(payload) || payload.format !== DRAFT_FORMAT) {
    throw new TransferFormatError('Arquivo não é um rascunho exportado pelo Hättz Studio.');
  }
  if (payload.formatVersion !== DRAFT_FORMAT_VERSION) {
    throw new TransferFormatError('Versão deste arquivo de rascunho não é suportada.');
  }
  const content = requireContent(payload.content);
  assertPublishable(content);

  const db = getStudioDb();
  await ensureStudioDbReady(db);
  const now = Date.now();
  const technicalId = createLocalId('prof');
  const displayName =
    typeof payload.displayName === 'string' && payload.displayName.trim()
      ? payload.displayName.trim()
      : 'Perfil importado';

  const mapping = new Map<string, string>();
  const transports = requireArray(payload.mediaAssets ?? [], 'mediaAssets').map((item) => {
    if (!isRecord(item)) throw new TransferFormatError('Ativo de mídia inválido.');
    return item as unknown as MediaAssetTransport;
  });
  for (const asset of transports) {
    if (typeof asset.assetId !== 'string') {
      throw new TransferFormatError('Ativo de mídia sem identificador.');
    }
    mapping.set(asset.assetId, createLocalId('asset'));
  }
  const remapped = remapAssetIds(content, mapping) as Record<string, unknown>;

  const profile: LocalProfileRecord = {
    technicalId,
    publicSlugDraft:
      typeof payload.publicSlugDraft === 'string' && payload.publicSlugDraft
        ? payload.publicSlugDraft
        : createLocalId('perfil'),
    displayName,
    visibility: 'unpublished',
    schemaVersion: 1,
    contentVersion: 1,
    createdAt: now,
    updatedAt: now,
    lastPublishedVersion: null,
    isDeleted: false,
  };
  const workingDraft: WorkingDraftRecord = {
    profileTechnicalId: technicalId,
    content: remapped,
    revision: 1,
    createdAt: now,
    updatedAt: now,
  };
  const mediaAssets = transports.map((transport) => {
    const asset = fromTransport(transport);
    return { ...asset, assetId: mapping.get(transport.assetId)!, profileTechnicalId: technicalId };
  });

  await db.transaction('rw', db.localProfiles, db.workingDrafts, db.mediaAssets, async () => {
    await db.localProfiles.add(profile);
    await db.workingDrafts.add(workingDraft);
    if (mediaAssets.length > 0) await db.mediaAssets.bulkAdd(mediaAssets);
  });
  return { profile, workingDraft, mediaAssets };
}

/* ------------------------------------------------------------------ */
/* Backup / restauração completa                                       */
/* ------------------------------------------------------------------ */

export async function exportBackup(): Promise<StudioBackup> {
  const db = getStudioDb();
  await ensureStudioDbReady(db);
  const [
    profiles,
    draftSnapshots,
    workingDrafts,
    publications,
    mediaAssets,
    pendingSyncOps,
    studioMeta,
    userBadges,
    userFrames,
    userCollectionProgress,
  ] = await Promise.all([
    db.localProfiles.toArray(),
    db.draftSnapshots.toArray(),
    db.workingDrafts.toArray(),
    db.publications.toArray(),
    db.mediaAssets.toArray(),
    db.pendingSyncOps.toArray(),
    db.studioMeta.toArray(),
    db.userBadges.toArray(),
    db.userFrames.toArray(),
    db.userCollectionProgress.toArray(),
  ]);
  return {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    source: { dbName: STUDIO_DB_NAME, schemaVersion: STUDIO_DB_VERSION },
    profiles,
    draftSnapshots,
    workingDrafts,
    publications,
    mediaAssets: await Promise.all(mediaAssets.map(toTransport)),
    pendingSyncOps,
    studioMeta,
    userBadges,
    userFrames,
    userCollectionProgress,
  };
}

function parseBackup(payload: unknown): StudioBackup {
  if (!isRecord(payload) || payload.format !== BACKUP_FORMAT) {
    throw new TransferFormatError('Arquivo não é um backup do Hättz Studio.');
  }
  if (payload.formatVersion !== BACKUP_FORMAT_VERSION) {
    throw new TransferFormatError('Versão deste arquivo de backup não é suportada.');
  }
  if (!isRecord(payload.source) || typeof payload.source.schemaVersion !== 'number') {
    throw new TransferFormatError('Metadados de origem do backup inválidos.');
  }
  if (payload.source.schemaVersion > STUDIO_DB_VERSION) {
    throw new TransferFormatError('O backup foi criado por uma versão mais recente do Studio.');
  }
  const profiles = requireArray(payload.profiles, 'profiles') as LocalProfileRecord[];
  const draftSnapshots = requireArray(
    payload.draftSnapshots,
    'draftSnapshots',
  ) as DraftSnapshotRecord[];
  const workingDrafts = requireArray(
    payload.workingDrafts,
    'workingDrafts',
  ) as WorkingDraftRecord[];
  const publications = requireArray(
    payload.publications,
    'publications',
  ) as LocalPublicationRecord[];
  const pendingSyncOps = requireArray(
    payload.pendingSyncOps,
    'pendingSyncOps',
  ) as PendingSyncOperationRecord[];
  const studioMeta = requireArray(payload.studioMeta, 'studioMeta') as StudioMetaRecord[];
  const userBadges = requireArray(payload.userBadges, 'userBadges') as UserBadgeRecord[];
  const userFrames = requireArray(payload.userFrames, 'userFrames') as UserFrameRecord[];
  const userCollectionProgress = requireArray(
    payload.userCollectionProgress,
    'userCollectionProgress',
  ) as UserCollectionProgressRecord[];
  const mediaAssets = requireArray(payload.mediaAssets, 'mediaAssets').map((item) => {
    if (!isRecord(item)) throw new TransferFormatError('Ativo de mídia inválido no backup.');
    return item as unknown as MediaAssetTransport;
  });

  for (const record of [...draftSnapshots, ...workingDrafts, ...publications]) {
    requireContent(record.content);
  }
  for (const publication of publications) assertPublishable(publication.content);
  for (const asset of mediaAssets) fromTransport(asset);

  return {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    exportedAt: typeof payload.exportedAt === 'string' ? payload.exportedAt : '',
    source: payload.source as StudioBackup['source'],
    profiles,
    draftSnapshots,
    workingDrafts,
    publications,
    mediaAssets,
    pendingSyncOps,
    studioMeta,
    userBadges,
    userFrames,
    userCollectionProgress,
  };
}

export interface BackupRestoreResult {
  profiles: number;
  publications: number;
  mediaAssets: number;
  schemaVersion: number;
}

/**
 * Restaura um backup completo. SUBSTITUI todo o banco local — a UI deve exigir confirmação
 * explícita antes de chamar. Tudo acontece em uma única transação: se qualquer escrita falhar,
 * nenhum dado parcial permanece.
 */
export async function restoreBackup(payload: unknown): Promise<BackupRestoreResult> {
  const backup = parseBackup(payload);
  const db = getStudioDb();
  await ensureStudioDbReady(db);
  const mediaAssets: MediaAssetRecord[] = backup.mediaAssets.map(fromTransport);

  await db.transaction(
    'rw',
    [
      db.localProfiles,
      db.draftSnapshots,
      db.workingDrafts,
      db.publications,
      db.mediaAssets,
      db.pendingSyncOps,
      db.studioMeta,
      db.userBadges,
      db.userFrames,
      db.userCollectionProgress,
    ],
    async () => {
      await Promise.all([
        db.localProfiles.clear(),
        db.draftSnapshots.clear(),
        db.workingDrafts.clear(),
        db.publications.clear(),
        db.mediaAssets.clear(),
        db.pendingSyncOps.clear(),
        db.studioMeta.clear(),
        db.userBadges.clear(),
        db.userFrames.clear(),
        db.userCollectionProgress.clear(),
      ]);
      await Promise.all([
        db.localProfiles.bulkAdd(backup.profiles),
        db.draftSnapshots.bulkAdd(backup.draftSnapshots),
        db.workingDrafts.bulkAdd(backup.workingDrafts),
        db.publications.bulkAdd(backup.publications),
        db.mediaAssets.bulkAdd(mediaAssets),
        db.pendingSyncOps.bulkAdd(backup.pendingSyncOps),
        db.studioMeta.bulkAdd(backup.studioMeta),
        db.userBadges.bulkAdd(backup.userBadges),
        db.userFrames.bulkAdd(backup.userFrames),
        db.userCollectionProgress.bulkAdd(backup.userCollectionProgress),
      ]);
    },
  );
  return {
    profiles: backup.profiles.length,
    publications: backup.publications.length,
    mediaAssets: mediaAssets.length,
    schemaVersion: backup.source.schemaVersion,
  };
}

/* ------------------------------------------------------------------ */
/* Helpers de arquivo (navegador)                                      */
/* ------------------------------------------------------------------ */

export function downloadJson(value: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function readJsonFile(file: File): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(JSON.parse(String(reader.result)));
      } catch {
        reject(new TransferFormatError('O arquivo selecionado não contém JSON válido.'));
      }
    };
    reader.onerror = () => reject(new TransferFormatError('Não foi possível ler o arquivo.'));
    reader.readAsText(file);
  });
}
