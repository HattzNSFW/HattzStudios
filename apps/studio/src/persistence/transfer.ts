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

import { createLocalId, isReservedPublicSlug } from '@hattz/shared-utils';
import { validatePublishableSnapshotContent, validateSlug } from '@hattz/validation';
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
import { isMediaAssetKind } from '@hattz/contracts';

export const DRAFT_FORMAT = 'hattz-studio-draft';
export const DRAFT_FORMAT_VERSION = 1;
export const BACKUP_FORMAT = 'hattz-studio-backup';
export const BACKUP_FORMAT_VERSION = 1;

const FORBIDDEN_BACKUP_OFFICIAL_KEYS = [
  'officialCode',
  'official_code',
  'isOfficial',
  'is_official',
  'officialIdentity',
  'externalOfficialCode',
] as const;

function assertNoOfficialIdentityFields(record: Record<string, unknown>, field: string): void {
  const found = FORBIDDEN_BACKUP_OFFICIAL_KEYS.find((key) => key in record);
  if (found) {
    throw new TransferFormatError(
      `Campo de identidade oficial não é aceito em backup: ${field}.${found}`,
    );
  }
}

/** Varredura recursiva: nenhum registro restaurado pode carregar campos de identidade oficial. */
function assertNoOfficialIdentityValue(value: unknown, field: string): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoOfficialIdentityValue(item, `${field}[${index}]`));
    return;
  }
  if (!isRecord(value)) return;
  assertNoOfficialIdentityFields(value, field);
  for (const [key, nested] of Object.entries(value)) {
    assertNoOfficialIdentityValue(nested, `${field}.${key}`);
  }
}

/**
 * Posses criadas localmente nunca carregam evidência de autoridade. Um backup forjado não pode
 * plantar `authorityProof` para um importador futuro confiar nela.
 */
function assertNoBackupAuthorityProof(records: readonly unknown[], field: string): void {
  records.forEach((item, index) => {
    const record = requireRecordBackup(item, `${field}[${index}]`);
    const proof = record.authorityProof;
    if (proof !== null && proof !== undefined) {
      throw new TransferFormatError(
        `Evidência de autoridade não é aceita em backup: ${field}[${index}].authorityProof`,
      );
    }
  });
}

/**
 * Limites TÉCNICOS de segurança para importação/restauração (proteção contra esgotamento de
 * memória/cota e corrupção). Não são cotas de produto: quotas editoriais permanecem decisão do
 * Owner. São aplicados ANTES de `atob()` e da alocação do Blob.
 */
export const MEDIA_SAFETY_LIMITS = {
  maxAssets: 30,
  maxAssetBytes: 12 * 1024 * 1024,
  maxTotalBytes: 60 * 1024 * 1024,
} as const;

const MAX_BASE64_LENGTH = Math.ceil((MEDIA_SAFETY_LIMITS.maxAssetBytes * 4) / 3) + 256;
/** Teto do arquivo JSON antes de qualquer parsing/base64 (limite técnico, não cota editorial). */
const MAX_TRANSFER_FILE_BYTES = 128 * 1024 * 1024;

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
  const encoded = match[3]!;
  // Validação antes da decodificação: um dataUrl gigante não pode virar um Blob gigante.
  if (encoded.length > MAX_BASE64_LENGTH) {
    throw new TransferFormatError('Arquivo de mídia excede o limite técnico de tamanho.');
  }
  const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
  if (bytes.length > MEDIA_SAFETY_LIMITS.maxAssetBytes) {
    throw new TransferFormatError('Arquivo de mídia excede o limite técnico de tamanho.');
  }
  const mimeType = match[1] || fallbackMimeType;
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
    !isMediaAssetKind(asset.kind)
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
/* Integridade do backup (mesmas regras do fluxo normal de escrita)    */
/* ------------------------------------------------------------------ */

const BACKUP_PROFILE_VISIBILITIES = new Set<LocalProfileRecord['visibility']>([
  'private',
  'unpublished',
  'public_intent',
]);
const BACKUP_SNAPSHOT_SOURCES = new Set<DraftSnapshotRecord['source']>([
  'manual',
  'autosave',
  'migration',
]);
const BACKUP_PUBLICATION_STATES = new Set<LocalPublicationRecord['state']>([
  'published',
  'unpublished',
]);
const BACKUP_SYNC_STATES = new Set<PendingSyncOperationRecord['state']>([
  'pendente',
  'falhou',
  'conflito',
  'sincronizando',
]);

function requireRecordBackup(value: unknown, field: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new TransferFormatError(`Registro inválido no backup: ${field}.`);
  }
  return value;
}

function requireStringBackup(value: unknown, field: string, allowEmpty = false): string {
  if (typeof value !== 'string' || (!allowEmpty && value.trim().length === 0)) {
    throw new TransferFormatError(`Campo "${field}" inválido no backup.`);
  }
  return value;
}

function requireFiniteBackup(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TransferFormatError(`Campo "${field}" inválido no backup.`);
  }
  return value;
}

function requireIntegerBackup(value: unknown, field: string, min = 0): number {
  const number = requireFiniteBackup(value, field);
  if (!Number.isSafeInteger(number) || number < min) {
    throw new TransferFormatError(`Campo "${field}" inválido no backup.`);
  }
  return number;
}

function requireNullableIntegerBackup(value: unknown, field: string): number | null {
  if (value === null) return null;
  return requireIntegerBackup(value, field, 1);
}

function requireNullableFiniteBackup(value: unknown, field: string): number | null {
  if (value === null) return null;
  return requireFiniteBackup(value, field);
}

function requireBooleanBackup(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') {
    throw new TransferFormatError(`Campo "${field}" inválido no backup.`);
  }
  return value;
}

function requireEnumBackup<T extends string>(
  value: unknown,
  allowed: ReadonlySet<T>,
  field: string,
): T {
  if (typeof value !== 'string' || !allowed.has(value as T)) {
    throw new TransferFormatError(`Campo "${field}" inválido no backup.`);
  }
  return value as T;
}

function requirePublicationSlugBackup(value: unknown, field: string): string {
  const slug = requireStringBackup(value, field).trim().toLowerCase();
  const result = validateSlug(slug);
  if (!result.ok || !result.value || isReservedPublicSlug(result.value)) {
    throw new TransferFormatError(`Slug publicado inválido ou reservado no backup: ${field}.`);
  }
  return result.value;
}

/**
 * Revalida o backup com as mesmas invariantes do fluxo normal: perfis de existência obrigatória,
 * slug publicado válido/não reservado/único, no máximo uma publicação ativa por perfil, versões
 * íntegras e referências de mídia/fila pertencentes a perfis existentes. Um arquivo corrompido ou
 * manipulado não pode plantar estado que o Studio rejeitaria na escrita.
 */
function assertBackupIntegrity(input: {
  profiles: readonly unknown[];
  draftSnapshots: readonly unknown[];
  workingDrafts: readonly unknown[];
  publications: readonly unknown[];
  mediaAssets: readonly MediaAssetTransport[];
  pendingSyncOps: readonly unknown[];
  studioMeta: readonly unknown[];
  userBadges: readonly unknown[];
  userFrames: readonly unknown[];
  userCollectionProgress: readonly unknown[];
}): void {
  assertNoOfficialIdentityValue(input, 'backup');

  const profileIds = new Set<string>();
  const deletedProfileIds = new Set<string>();
  input.profiles.forEach((item, index) => {
    const field = `profiles[${index}]`;
    const record = requireRecordBackup(item, field);
    const technicalId = requireStringBackup(record.technicalId, `${field}.technicalId`);
    if (profileIds.has(technicalId)) {
      throw new TransferFormatError(`technicalId duplicado no backup: ${field}.`);
    }
    profileIds.add(technicalId);
    requireStringBackup(record.publicSlugDraft, `${field}.publicSlugDraft`);
    requireStringBackup(record.displayName, `${field}.displayName`);
    requireEnumBackup(record.visibility, BACKUP_PROFILE_VISIBILITIES, `${field}.visibility`);
    requireIntegerBackup(record.schemaVersion, `${field}.schemaVersion`, 1);
    requireIntegerBackup(record.contentVersion, `${field}.contentVersion`, 1);
    requireFiniteBackup(record.createdAt, `${field}.createdAt`);
    requireFiniteBackup(record.updatedAt, `${field}.updatedAt`);
    requireNullableIntegerBackup(record.lastPublishedVersion, `${field}.lastPublishedVersion`);
    if (requireBooleanBackup(record.isDeleted, `${field}.isDeleted`)) {
      deletedProfileIds.add(technicalId);
    }
  });

  const snapshotIds = new Set<string>();
  input.draftSnapshots.forEach((item, index) => {
    const field = `draftSnapshots[${index}]`;
    const record = requireRecordBackup(item, field);
    const id = requireStringBackup(record.id, `${field}.id`);
    if (snapshotIds.has(id)) throw new TransferFormatError(`Snapshot duplicado no backup: ${id}.`);
    snapshotIds.add(id);
    const profileId = requireStringBackup(record.profileTechnicalId, `${field}.profileTechnicalId`);
    if (!profileIds.has(profileId))
      throw new TransferFormatError(`Snapshot órfão no backup: ${field}.`);
    requireIntegerBackup(record.version, `${field}.version`, 1);
    requireStringBackup(record.label, `${field}.label`, true);
    requireContent(record.content);
    requireFiniteBackup(record.createdAt, `${field}.createdAt`);
    requireEnumBackup(record.source, BACKUP_SNAPSHOT_SOURCES, `${field}.source`);
  });

  const workingProfileIds = new Set<string>();
  input.workingDrafts.forEach((item, index) => {
    const field = `workingDrafts[${index}]`;
    const record = requireRecordBackup(item, field);
    const profileId = requireStringBackup(record.profileTechnicalId, `${field}.profileTechnicalId`);
    if (!profileIds.has(profileId)) {
      throw new TransferFormatError(`Rascunho de trabalho órfão no backup: ${field}.`);
    }
    if (workingProfileIds.has(profileId)) {
      throw new TransferFormatError(`Mais de um rascunho de trabalho para ${profileId} no backup.`);
    }
    workingProfileIds.add(profileId);
    requireContent(record.content);
    requireIntegerBackup(record.revision, `${field}.revision`, 1);
    requireFiniteBackup(record.createdAt, `${field}.createdAt`);
    requireFiniteBackup(record.updatedAt, `${field}.updatedAt`);
  });

  const publicationIds = new Set<string>();
  const versionsByProfile = new Map<string, Set<number>>();
  const publishedByProfile = new Set<string>();
  const publishedSlugOwners = new Map<string, string>();
  input.publications.forEach((item, index) => {
    const field = `publications[${index}]`;
    const record = requireRecordBackup(item, field);
    const id = requireStringBackup(record.publicationId, `${field}.publicationId`);
    if (publicationIds.has(id)) {
      throw new TransferFormatError(`Publicação duplicada no backup: ${id}.`);
    }
    publicationIds.add(id);
    const profileId = requireStringBackup(record.profileTechnicalId, `${field}.profileTechnicalId`);
    if (!profileIds.has(profileId)) {
      throw new TransferFormatError(`Publicação órfã no backup: ${field}.`);
    }
    const version = requireIntegerBackup(record.version, `${field}.version`, 1);
    let versions = versionsByProfile.get(profileId);
    if (!versions) {
      versions = new Set<number>();
      versionsByProfile.set(profileId, versions);
    }
    if (versions.has(version)) {
      throw new TransferFormatError(`Versão de publicação duplicada no backup: ${field}.`);
    }
    versions.add(version);

    const slug = requirePublicationSlugBackup(record.slug, `${field}.slug`);
    const state = requireEnumBackup(record.state, BACKUP_PUBLICATION_STATES, `${field}.state`);
    assertPublishable(requireContent(record.content));
    requireFiniteBackup(record.publishedAt, `${field}.publishedAt`);
    if (state === 'published') {
      if (deletedProfileIds.has(profileId)) {
        throw new TransferFormatError(
          `Perfil oculto não pode manter publicação ativa no backup: ${profileId}.`,
        );
      }
      if (publishedByProfile.has(profileId)) {
        throw new TransferFormatError(`Mais de uma publicação ativa para ${profileId} no backup.`);
      }
      publishedByProfile.add(profileId);
      if (record.unpublishedAt !== null) {
        throw new TransferFormatError(
          `Publicação ativa com data de despublicação no backup: ${field}.`,
        );
      }
      const owner = publishedSlugOwners.get(slug);
      if (owner && owner !== profileId) {
        throw new TransferFormatError(
          `Slug publicado disputado por dois perfis no backup: ${slug}.`,
        );
      }
      publishedSlugOwners.set(slug, profileId);
    } else {
      requireNullableFiniteBackup(record.unpublishedAt, `${field}.unpublishedAt`);
    }
    requireFiniteBackup(record.createdAt, `${field}.createdAt`);
  });

  const mediaIds = new Set<string>();
  input.mediaAssets.forEach((asset, index) => {
    const field = `mediaAssets[${index}]`;
    if (mediaIds.has(asset.assetId)) {
      throw new TransferFormatError(`Ativo de mídia duplicado no backup: ${field}.`);
    }
    mediaIds.add(asset.assetId);
    if (!profileIds.has(asset.profileTechnicalId)) {
      throw new TransferFormatError(`Ativo de mídia órfão no backup: ${field}.`);
    }
  });

  const operationIds = new Set<string>();
  input.pendingSyncOps.forEach((item, index) => {
    const field = `pendingSyncOps[${index}]`;
    const record = requireRecordBackup(item, field);
    const operationId = requireStringBackup(record.operationId, `${field}.operationId`);
    if (operationIds.has(operationId)) {
      throw new TransferFormatError(`Operação de fila duplicada no backup: ${field}.`);
    }
    operationIds.add(operationId);
    if (record.profileTechnicalId !== null) {
      const profileId = requireStringBackup(
        record.profileTechnicalId,
        `${field}.profileTechnicalId`,
      );
      if (!profileIds.has(profileId)) {
        throw new TransferFormatError(`Operação de fila órfã no backup: ${field}.`);
      }
    }
    requireStringBackup(record.type, `${field}.type`);
    requireEnumBackup(record.state, BACKUP_SYNC_STATES, `${field}.state`);
    requireRecordBackup(record.payload, `${field}.payload`);
    requireNullableIntegerBackup(record.baseVersion, `${field}.baseVersion`);
    requireIntegerBackup(record.attemptCount, `${field}.attemptCount`, 0);
    if (record.lastError !== null)
      requireStringBackup(record.lastError, `${field}.lastError`, true);
    requireFiniteBackup(record.createdAt, `${field}.createdAt`);
    requireFiniteBackup(record.updatedAt, `${field}.updatedAt`);
  });
}

/** Slugs inválidos, reservados ou ausentes são rejeitados — nunca inventados nem normalizados. */
function requireImportableSlug(value: unknown): string {
  if (typeof value !== 'string' || !validateSlug(value).ok || isReservedPublicSlug(value)) {
    throw new TransferFormatError(
      'O endereço público do rascunho importado é inválido ou reservado.',
    );
  }
  return value.trim().toLowerCase();
}

/** Checa contagem/tamanhos antes de qualquer decodificação de base64. */
function assertMediaLimits(items: readonly unknown[], field: string): void {
  if (items.length > MEDIA_SAFETY_LIMITS.maxAssets) {
    throw new TransferFormatError(
      `Campo "${field}" excede o limite técnico de ${MEDIA_SAFETY_LIMITS.maxAssets} arquivos.`,
    );
  }
  let total = 0;
  for (const item of items) {
    if (!isRecord(item)) throw new TransferFormatError('Ativo de mídia inválido no arquivo.');
    const size = item.size;
    if (typeof size !== 'number' || !Number.isFinite(size) || size < 0) {
      throw new TransferFormatError('Tamanho de mídia inválido no arquivo importado.');
    }
    if (size > MEDIA_SAFETY_LIMITS.maxAssetBytes) {
      throw new TransferFormatError('Arquivo de mídia excede o limite técnico de tamanho.');
    }
    total += size;
    if (typeof item.dataUrl !== 'string' || item.dataUrl.length > MAX_BASE64_LENGTH) {
      throw new TransferFormatError('Arquivo de mídia excede o limite técnico de tamanho.');
    }
  }
  if (total > MEDIA_SAFETY_LIMITS.maxTotalBytes) {
    throw new TransferFormatError('O total de mídia excede o limite técnico de tamanho.');
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
  const content = requireContent(working.content);
  // Exportar um conteúdo que a própria importação rejeitaria geraria um arquivo inútil e uma
  // mensagem de erro confusa. A validação canônica é a mesma usada na publicação.
  assertPublishable(content);
  return {
    format: DRAFT_FORMAT,
    formatVersion: DRAFT_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    profileTechnicalId: profile.technicalId,
    publicSlugDraft: profile.publicSlugDraft,
    displayName: profile.displayName,
    content,
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
  const importedSlug = requireImportableSlug(payload.publicSlugDraft);

  const db = getStudioDb();
  await ensureStudioDbReady(db);
  const now = Date.now();
  const technicalId = createLocalId('prof');
  const displayName =
    typeof payload.displayName === 'string' && payload.displayName.trim()
      ? payload.displayName.trim()
      : 'Perfil importado';

  const mapping = new Map<string, string>();
  const mediaItems = requireArray(payload.mediaAssets ?? [], 'mediaAssets');
  assertMediaLimits(mediaItems, 'mediaAssets');
  const transports = mediaItems.map((item) => {
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
    publicSlugDraft: importedSlug,
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
  // Todas as tabelas são lidas em UMA transação de somente leitura: um backup não pode misturar
  // uma metade pré-save e outra pós-save de um autosave concorrente.
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
  ] = await db.transaction(
    'r',
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
    async () =>
      Promise.all([
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
      ]),
  );
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
  const mediaItems = requireArray(payload.mediaAssets, 'mediaAssets');
  assertMediaLimits(mediaItems, 'mediaAssets');
  const mediaAssets = mediaItems.map((item) => {
    if (!isRecord(item)) throw new TransferFormatError('Ativo de mídia inválido no backup.');
    return item as unknown as MediaAssetTransport;
  });

  assertNoBackupAuthorityProof(userBadges, 'userBadges');
  assertNoBackupAuthorityProof(userFrames, 'userFrames');
  for (const record of [...draftSnapshots, ...workingDrafts, ...publications]) {
    requireContent(record.content);
  }
  for (const publication of publications) assertPublishable(publication.content);
  const decodedMedia = mediaAssets.map(fromTransport);
  const decodedTotal = decodedMedia.reduce((total, asset) => total + asset.blob.size, 0);
  if (decodedTotal > MEDIA_SAFETY_LIMITS.maxTotalBytes) {
    throw new TransferFormatError('Mídia do backup excede o limite total após decodificação.');
  }
  assertBackupIntegrity({
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
  });

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
  // O schema físico é o da versão corrente do app, mesmo que o backup venha de uma versão anterior:
  // os metadados restaurados não podem dizer que o banco está desatualizado.
  const restoredMeta = [
    ...backup.studioMeta.filter((record) => record.key !== 'db_schema_version'),
    { key: 'db_schema_version', value: STUDIO_DB_VERSION, updatedAt: Date.now() },
  ];

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
        db.studioMeta.bulkAdd(restoredMeta),
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
  if (file.size > MAX_TRANSFER_FILE_BYTES) {
    return Promise.reject(new TransferFormatError('O arquivo selecionado é grande demais.'));
  }
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
