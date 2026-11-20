import Dexie, { type Table } from 'dexie';
import type { CollectionProgressStatus, GrantSourceType } from '@hattz/core';
import type { MediaAssetKind } from '@hattz/contracts';

export { MEDIA_ASSET_KINDS, isMediaAssetKind } from '@hattz/contracts';
export type { MediaAssetKind } from '@hattz/contracts';

/**
 * Esquema local-first compartilhado (`hattz_studio`).
 *
 * Esta base é a única fonte de dados locais dos três aplicativos. Ela vive em um pacote
 * compartilhado porque o IndexedDB é isolado por origem: quando o Studio (escritor) e o Share
 * (leitor) rodam na MESMA origem (o hub local), ambos abrem exatamente esta base. O contrato é
 * apenas a persistência — a leitura pública continua passando por `queries.ts`, que nunca expõe
 * campos internos.
 *
 * NOTA: a semântica de versionamento/upgrade é idêntica à definida na Entrega 3; nenhum dado é
 * transformado aqui. O pacote apenas centraliza o schema para evitar duas cópias divergentes.
 */

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

/**
 * Rascunho de trabalho (v2): a cópia mutável que o editor carrega e salva continuamente.
 *
 * Diferente de `DraftSnapshotRecord` (checkpoints versionados e imutáveis), existe **um** registro
 * por perfil e ele é sobrescrito. `revision` habilita concorrência otimista: um salvamento só é
 * aplicado se a revisão esperada ainda for a atual, evitando sobrescrita silenciosa.
 */
export interface WorkingDraftRecord {
  profileTechnicalId: string;
  content: Record<string, unknown>;
  revision: number;
  createdAt: number;
  updatedAt: number;
}

export type LocalPublicationState = 'published' | 'unpublished';

/**
 * Publicação local (v3): snapshot imutável e versionado do rascunho no instante da publicação.
 *
 * Diferente de `WorkingDraftRecord` (mutável, sobrescrito), o `content` de um registro de
 * publicação NUNCA é alterado depois de criado. `state` indica se a versão é a publicação atual;
 * ao publicar uma nova versão, a anterior passa para `unpublished` mas mantém o conteúdo intacto.
 *
 * Existe no máximo um registro `published` por perfil, garantido dentro de uma transação
 * read-write — a versão atual é encontrada pelo índice composto `[profileTechnicalId+state]`,
 * nunca por suposição sobre a ordem dos registros.
 */
export interface LocalPublicationRecord {
  publicationId: string;
  profileTechnicalId: string;
  version: number;
  slug: string;
  state: LocalPublicationState;
  content: Record<string, unknown>;
  publishedAt: number;
  unpublishedAt: number | null;
  createdAt: number;
}

/**
 * Posse de badge por perfil (v4). Espelha `public.user_badges` (migration 0005).
 *
 * `revokedAt === null` = posse ativa. A unicidade de posse ativa por (perfil, badge) é imposta
 * dentro de uma transação read-write (espelhando `ux_user_badges_active_unique`).
 * `isDemo` marca dados fictícios de demonstração; nunca indexado (IndexedDB não indexa booleanos).
 */
export interface UserBadgeRecord {
  id: string;
  profileTechnicalId: string;
  badgeKey: string;
  source: GrantSourceType;
  sourceRef: string | null;
  grantedAt: number;
  revokedAt: number | null;
  revokeReason: string | null;
  isEquipped: boolean;
  isFavorite: boolean;
  sortOrder: number | null;
  isDemo: boolean;
  /**
   * Evidência OPAQUE de autoridade de uma fonte confiável (sincronização futura). `null` em
   * qualquer posse criada localmente. NUNCA interpretada pelo cliente; validada por uma
   * `TrustedOwnershipAuthority` confiável na equipagem de itens Exclusivos.
   */
  authorityProof: string | null;
  metadata: Record<string, unknown>;
}

/** Posse de moldura por perfil (v4). Espelha `public.user_frames` (migration 0005). */
export interface UserFrameRecord {
  id: string;
  profileTechnicalId: string;
  frameKey: string;
  source: GrantSourceType;
  sourceRef: string | null;
  grantedAt: number;
  expiresAt: number | null;
  revokedAt: number | null;
  revokeReason: string | null;
  isEquipped: boolean;
  isDemo: boolean;
  /**
   * Evidência OPAQUE de autoridade de uma fonte confiável (sincronização futura). `null` em
   * qualquer posse criada localmente. NUNCA interpretada pelo cliente; validada por uma
   * `TrustedOwnershipAuthority` confiável na equipagem de itens Exclusivos.
   */
  authorityProof: string | null;
  metadata: Record<string, unknown>;
}

/** Progresso de coleção por perfil (v4). Espelha `public.user_collection_progress`. */
export interface UserCollectionProgressRecord {
  id: string;
  profileTechnicalId: string;
  collectionKey: string;
  status: CollectionProgressStatus;
  progress: Record<string, unknown>;
  completedAt: number | null;
  rewardGrantedAt: number | null;
  updatedAt: number;
  isDemo: boolean;
}

/** Ativo de mídia local (v2): binário enviado pelo usuário, guardado no IndexedDB (offline-first). */
export interface MediaAssetRecord {
  assetId: string;
  profileTechnicalId: string;
  kind: MediaAssetKind;
  mimeType: string;
  size: number;
  blob: Blob;
  createdAt: number;
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
export const STUDIO_DB_VERSION = 4;

export class StudioDatabase extends Dexie {
  localProfiles!: Table<LocalProfileRecord, string>;
  draftSnapshots!: Table<DraftSnapshotRecord, string>;
  pendingSyncOps!: Table<PendingSyncOperationRecord, string>;
  studioMeta!: Table<StudioMetaRecord, string>;
  workingDrafts!: Table<WorkingDraftRecord, string>;
  mediaAssets!: Table<MediaAssetRecord, string>;
  publications!: Table<LocalPublicationRecord, string>;
  userBadges!: Table<UserBadgeRecord, string>;
  userFrames!: Table<UserFrameRecord, string>;
  userCollectionProgress!: Table<UserCollectionProgressRecord, string>;

  constructor(name = STUDIO_DB_NAME) {
    super(name);

    // v1: base local-first (rascunhos, snapshots, fila de sync, metadados)
    this.version(1).stores({
      localProfiles: 'technicalId, publicSlugDraft, updatedAt, isDeleted',
      draftSnapshots: 'id, profileTechnicalId, version, createdAt, source',
      pendingSyncOps: 'operationId, profileTechnicalId, state, type, updatedAt',
      studioMeta: 'key, updatedAt',
    });

    // v2: rascunho de trabalho mutável (autosave + concorrência otimista) e ativos de mídia locais.
    this.version(2)
      .stores({
        localProfiles: 'technicalId, publicSlugDraft, updatedAt, isDeleted',
        draftSnapshots: 'id, profileTechnicalId, version, createdAt, source',
        pendingSyncOps: 'operationId, profileTechnicalId, state, type, updatedAt',
        studioMeta: 'key, updatedAt',
        workingDrafts: 'profileTechnicalId, updatedAt',
        mediaAssets: 'assetId, profileTechnicalId, kind, createdAt',
      })
      .upgrade(async (tx) => {
        // v1 -> v2: a tabela de rascunho de trabalho é nova. Semeamos a partir do snapshot mais
        // recente de cada perfil para preservar qualquer conteúdo já existente como cópia editável.
        const profiles = await tx.table<LocalProfileRecord, string>('localProfiles').toArray();
        const snapshots = tx.table<DraftSnapshotRecord, string>('draftSnapshots');
        const working = tx.table<WorkingDraftRecord, string>('workingDrafts');

        for (const profile of profiles) {
          const existing = await working.get(profile.technicalId);
          if (existing) continue;
          const ordered = await snapshots
            .where('profileTechnicalId')
            .equals(profile.technicalId)
            .sortBy('version');
          const latest = ordered[ordered.length - 1];
          const now = Date.now();
          await working.put({
            profileTechnicalId: profile.technicalId,
            content: latest?.content ?? {},
            revision: 1,
            createdAt: now,
            updatedAt: now,
          });
        }
      });

    // v3: publicações locais (snapshots imutáveis e versionados). A tabela é nova; nenhum dado
    // existente precisa ser transformado, então o upgrade apenas garante o schema. `publications`
    // é indexada por `[profileTechnicalId+state]` para localizar a publicação atual sem depender
    // da ordem dos registros.
    this.version(3).stores({
      localProfiles: 'technicalId, publicSlugDraft, updatedAt, isDeleted',
      draftSnapshots: 'id, profileTechnicalId, version, createdAt, source',
      pendingSyncOps: 'operationId, profileTechnicalId, state, type, updatedAt',
      studioMeta: 'key, updatedAt',
      workingDrafts: 'profileTechnicalId, updatedAt',
      mediaAssets: 'assetId, profileTechnicalId, kind, createdAt',
      publications:
        'publicationId, profileTechnicalId, version, state, [profileTechnicalId+state], createdAt',
    });

    // v4: colecionáveis e permissões (aditivo, sem transformação de dados). Adiciona a posse de
    // badges/molduras e o progresso de coleções por perfil. Índices mínimos: localizar por perfil,
    // ordenar por data e garantir unicidade de posse ativa por (perfil, item) via índice composto.
    // Booleanos (`isEquipped`, `isDemo`) e `null` NÃO são indexados (IndexedDB não os indexa).
    this.version(4).stores({
      localProfiles: 'technicalId, publicSlugDraft, updatedAt, isDeleted',
      draftSnapshots: 'id, profileTechnicalId, version, createdAt, source',
      pendingSyncOps: 'operationId, profileTechnicalId, state, type, updatedAt',
      studioMeta: 'key, updatedAt',
      workingDrafts: 'profileTechnicalId, updatedAt',
      mediaAssets: 'assetId, profileTechnicalId, kind, createdAt',
      publications:
        'publicationId, profileTechnicalId, version, state, [profileTechnicalId+state], createdAt',
      userBadges: 'id, profileTechnicalId, [profileTechnicalId+badgeKey], grantedAt',
      userFrames: 'id, profileTechnicalId, [profileTechnicalId+frameKey], grantedAt',
      userCollectionProgress: 'id, profileTechnicalId, [profileTechnicalId+collectionKey], status',
    });
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
