import { createLocalId, isReservedPublicSlug } from '@hattz/shared-utils';
import {
  validatePublishableSnapshotContent,
  validateSlug,
  type ValidationIssue,
} from '@hattz/validation';
import {
  getStudioDb,
  type DraftSnapshotRecord,
  type LocalProfileRecord,
  type LocalPublicationRecord,
  type MediaAssetKind,
  type MediaAssetRecord,
  type PendingSyncOperationRecord,
  type WorkingDraftRecord,
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
  // `add` (not `put`): the technical id is permanent, so a collision must fail explicitly
  // instead of silently resetting an existing profile's version/creation metadata.
  try {
    await db.localProfiles.add(record);
  } catch (error) {
    throw new Error(`Perfil local já existe para o technicalId "${input.technicalId}".`, {
      cause: error,
    });
  }
  return record;
}

export async function saveDraftSnapshot(
  profileTechnicalId: string,
  content: Record<string, unknown>,
  source: DraftSnapshotRecord['source'] = 'manual',
): Promise<DraftSnapshotRecord> {
  const db = getStudioDb();
  await ensureStudioDbReady(db);
  // The profile read and the version increment must happen inside the same read-write
  // transaction. Otherwise two concurrent saves read the same contentVersion and both
  // write the same next version (duplicate snapshot versions + lost update).
  return db.transaction('rw', db.draftSnapshots, db.localProfiles, async () => {
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
    await db.draftSnapshots.put(snapshot);
    await db.localProfiles.update(profileTechnicalId, {
      contentVersion: nextVersion,
      updatedAt: Date.now(),
    });
    return snapshot;
  });
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
  // Duplicate operationId must fail explicitly (ADR-004): `put` would silently replace the
  // previous record and lose its payload/attempt/lastError state.
  try {
    await db.pendingSyncOps.add(record);
  } catch (error) {
    throw new Error(`Operação de sync já existe para operationId "${op.operationId}".`, {
      cause: error,
    });
  }
  return record;
}

export async function listLocalProfiles(): Promise<LocalProfileRecord[]> {
  const db = getStudioDb();
  await ensureStudioDbReady(db);
  return db.localProfiles.filter((p) => !p.isDeleted).sortBy('updatedAt');
}

export async function getLocalProfile(technicalId: string): Promise<LocalProfileRecord | null> {
  const db = getStudioDb();
  await ensureStudioDbReady(db);
  const profile = await db.localProfiles.get(technicalId);
  return profile && !profile.isDeleted ? profile : null;
}

/* ------------------------------------------------------------------ */
/* Rascunho de trabalho (autosave + concorrência otimista)            */
/* ------------------------------------------------------------------ */

/**
 * Erro de concorrência: a revisão esperada não corresponde à revisão atual no banco.
 *
 * Sinaliza que outra escrita aconteceu (outra aba, ou uma operação que já salvou) e que este
 * salvamento NÃO deve sobrescrever silenciosamente o conteúdo mais recente.
 */
export class StaleDraftError extends Error {
  constructor(
    readonly profileTechnicalId: string,
    readonly expectedRevision: number,
    readonly actualRevision: number,
  ) {
    super(
      `Rascunho desatualizado para "${profileTechnicalId}" (esperado v${expectedRevision}, atual v${actualRevision}).`,
    );
    this.name = 'StaleDraftError';
  }
}

export async function createWorkingDraft(
  profileTechnicalId: string,
  content: Record<string, unknown>,
): Promise<WorkingDraftRecord> {
  const db = getStudioDb();
  await ensureStudioDbReady(db);
  const now = Date.now();
  const record: WorkingDraftRecord = {
    profileTechnicalId,
    content,
    revision: 1,
    createdAt: now,
    updatedAt: now,
  };
  try {
    await db.workingDrafts.add(record);
  } catch (error) {
    throw new Error(`Rascunho de trabalho já existe para "${profileTechnicalId}".`, {
      cause: error,
    });
  }
  return record;
}

export async function getWorkingDraft(
  profileTechnicalId: string,
): Promise<WorkingDraftRecord | null> {
  const db = getStudioDb();
  await ensureStudioDbReady(db);
  return (await db.workingDrafts.get(profileTechnicalId)) ?? null;
}

function readDisplayName(content: Record<string, unknown>): string | null {
  const profile = content.profile;
  if (typeof profile !== 'object' || profile === null) return null;
  const name = (profile as Record<string, unknown>).displayName;
  return typeof name === 'string' && name.trim() !== '' ? name : null;
}

/**
 * Salva o rascunho de trabalho de forma atômica e com verificação de revisão.
 *
 * A leitura da revisão atual e a escrita acontecem na mesma transação read-write; se a revisão
 * esperada divergir, lança `StaleDraftError` (nunca sobrescreve silenciosamente).
 */
export async function saveWorkingDraft(
  profileTechnicalId: string,
  content: Record<string, unknown>,
  expectedRevision: number,
): Promise<WorkingDraftRecord> {
  const db = getStudioDb();
  await ensureStudioDbReady(db);
  return db.transaction('rw', db.workingDrafts, db.localProfiles, async () => {
    const current = await db.workingDrafts.get(profileTechnicalId);
    if (!current) {
      throw new Error(`Rascunho de trabalho não encontrado para "${profileTechnicalId}".`);
    }
    if (current.revision !== expectedRevision) {
      throw new StaleDraftError(profileTechnicalId, expectedRevision, current.revision);
    }
    const now = Date.now();
    const next: WorkingDraftRecord = {
      ...current,
      content,
      revision: current.revision + 1,
      updatedAt: now,
    };
    await db.workingDrafts.put(next);

    // Mantém o rótulo do perfil na lista alinhado ao nome editado (sem tocar em versionamento).
    const displayName = readDisplayName(content);
    await db.localProfiles.update(profileTechnicalId, {
      updatedAt: now,
      ...(displayName ? { displayName } : {}),
    });
    return next;
  });
}

/* ------------------------------------------------------------------ */
/* Ativos de mídia locais                                             */
/* ------------------------------------------------------------------ */

export interface StoreMediaAssetInput {
  profileTechnicalId: string;
  kind: MediaAssetKind;
  blob: Blob;
  mimeType?: string;
}

export async function storeMediaAsset(input: StoreMediaAssetInput): Promise<MediaAssetRecord> {
  const db = getStudioDb();
  await ensureStudioDbReady(db);
  const record: MediaAssetRecord = {
    assetId: createLocalId('asset'),
    profileTechnicalId: input.profileTechnicalId,
    kind: input.kind,
    mimeType: input.mimeType ?? input.blob.type ?? 'application/octet-stream',
    size: input.blob.size,
    blob: input.blob,
    createdAt: Date.now(),
  };
  await db.mediaAssets.add(record);
  return record;
}

export async function getMediaAsset(assetId: string): Promise<MediaAssetRecord | null> {
  const db = getStudioDb();
  await ensureStudioDbReady(db);
  return (await db.mediaAssets.get(assetId)) ?? null;
}

export async function listMediaAssets(profileTechnicalId: string): Promise<MediaAssetRecord[]> {
  const db = getStudioDb();
  await ensureStudioDbReady(db);
  return db.mediaAssets.where('profileTechnicalId').equals(profileTechnicalId).toArray();
}

/**
 * Erro de exclusão de mídia: o ativo ainda é referenciado por um rascunho, checkpoint ou
 * publicação. A exclusão é recusada para não deixar referências quebradas no perfil publicado.
 */
export class MediaAssetInUseError extends Error {
  constructor(
    readonly assetId: string,
    readonly references: readonly string[],
  ) {
    super(
      `Este arquivo ainda é usado por ${references.length} conteúdo(s) e não pode ser excluído.`,
    );
    this.name = 'MediaAssetInUseError';
  }
}

/** Varredura recursiva e à prova de ciclos de um conteúdo JSON em busca de um assetId. */
function contentReferencesAssetId(value: unknown, assetId: string, seen = new WeakSet()): boolean {
  if (typeof value === 'string') return value === assetId;
  if (typeof value !== 'object' || value === null) return false;
  if (seen.has(value)) return false;
  seen.add(value);
  return Object.values(value as Record<string, unknown>).some((item) =>
    contentReferencesAssetId(item, assetId, seen),
  );
}

/**
 * Exclui um ativo de mídia somente se nenhum rascunho/checkpoint/publicação o referenciar.
 * A checagem e a exclusão acontecem na mesma transação read-write.
 */
export async function deleteMediaAsset(assetId: string): Promise<void> {
  const db = getStudioDb();
  await ensureStudioDbReady(db);
  await db.transaction(
    'rw',
    db.mediaAssets,
    db.workingDrafts,
    db.draftSnapshots,
    db.publications,
    async () => {
      const references: string[] = [];
      const working = await db.workingDrafts
        .filter((record) => contentReferencesAssetId(record.content, assetId))
        .toArray();
      references.push(...working.map((record) => `rascunho:${record.profileTechnicalId}`));
      const snapshots = await db.draftSnapshots
        .filter((record) => contentReferencesAssetId(record.content, assetId))
        .toArray();
      references.push(...snapshots.map((record) => `checkpoint:${record.id}`));
      const publications = await db.publications
        .filter((record) => contentReferencesAssetId(record.content, assetId))
        .toArray();
      references.push(...publications.map((record) => `publicacao:${record.publicationId}`));
      if (references.length > 0) throw new MediaAssetInUseError(assetId, references);
      await db.mediaAssets.delete(assetId);
    },
  );
}

/** Checkpoints salvos explicitamente, do mais recente para o mais antigo. */
export async function listDraftSnapshots(
  profileTechnicalId: string,
): Promise<DraftSnapshotRecord[]> {
  const db = getStudioDb();
  await ensureStudioDbReady(db);
  const records = await db.draftSnapshots
    .where('profileTechnicalId')
    .equals(profileTechnicalId)
    .toArray();
  return records.sort((a, b) => b.version - a.version);
}

/**
 * Restaura um checkpoint para o rascunho de trabalho usando a revisão esperada. Nunca apaga o
 * checkpoint: a restauração é uma nova escrita do rascunho, auditável pelo número da revisão.
 */
export async function restoreDraftSnapshot(
  profileTechnicalId: string,
  version: number,
  expectedRevision: number,
): Promise<WorkingDraftRecord> {
  const db = getStudioDb();
  await ensureStudioDbReady(db);
  const snapshot = await db.draftSnapshots
    .where('profileTechnicalId')
    .equals(profileTechnicalId)
    .filter((record) => record.version === version)
    .first();
  if (!snapshot) throw new Error('Checkpoint não encontrado para este perfil.');
  return saveWorkingDraft(profileTechnicalId, cloneContent(snapshot.content), expectedRevision);
}

/** Restaura o conteúdo de uma versão publicada para o rascunho de trabalho, sem republicar. */
export async function restorePublishedVersion(
  profileTechnicalId: string,
  version: number,
  expectedRevision: number,
): Promise<WorkingDraftRecord> {
  const publication = await getPublicationByVersion(profileTechnicalId, version);
  if (!publication) throw new Error('Versão publicada não encontrada para este perfil.');
  return saveWorkingDraft(profileTechnicalId, cloneContent(publication.content), expectedRevision);
}

/** Estado da fila de sincronização (somente leitura — não há drenagem remota nesta fase). */
export async function listPendingSyncOperations(
  profileTechnicalId?: string,
): Promise<PendingSyncOperationRecord[]> {
  const db = getStudioDb();
  await ensureStudioDbReady(db);
  const records = profileTechnicalId
    ? await db.pendingSyncOps.where('profileTechnicalId').equals(profileTechnicalId).toArray()
    : await db.pendingSyncOps.toArray();
  return records.sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Atualiza o endereço público rascunho com validação canônica, sem publicar automaticamente. */
export async function updatePublicSlugDraft(
  profileTechnicalId: string,
  slug: string,
): Promise<LocalProfileRecord> {
  const db = getStudioDb();
  await ensureStudioDbReady(db);
  const validation = validateSlug(slug);
  if (!validation.ok || !validation.value) {
    throw new PublicationSlugError(
      'O endereço precisa ter entre 3 e 48 caracteres e usar apenas letras minúsculas, números e hífens.',
      slug,
    );
  }
  if (isReservedPublicSlug(validation.value)) {
    throw new PublicationSlugError(
      `O endereço /${validation.value} é reservado para uma rota interna do Hättz.`,
      validation.value,
    );
  }
  await db.localProfiles.update(profileTechnicalId, {
    publicSlugDraft: validation.value,
    updatedAt: Date.now(),
  });
  const updated = await db.localProfiles.get(profileTechnicalId);
  if (!updated) throw new Error('Perfil local não encontrado.');
  return updated;
}

/* ------------------------------------------------------------------ */
/* Publicação local (snapshots imutáveis e versionados)               */
/* ------------------------------------------------------------------ */

/**
 * Erro de validação de publicação: o rascunho não corresponde ao contrato público e NÃO deve
 * ser persistido como snapshot. Carrega as issues para a UI explicar o que precisa ser corrigido.
 */
export class PublicationValidationError extends Error {
  constructor(readonly issues: ValidationIssue[]) {
    super('O rascunho não pode ser publicado: o conteúdo não corresponde ao contrato público.');
    this.name = 'PublicationValidationError';
  }
}

/** Erro de slug: evita endereços inválidos, rotas internas do hub e colisões entre perfis. */
export class PublicationSlugError extends Error {
  constructor(
    message: string,
    readonly slug: string,
  ) {
    super(message);
    this.name = 'PublicationSlugError';
  }
}

/** Cópia profunda do conteúdo JSON para garantir que o snapshot não compartilhe referência mutável. */
function cloneContent(content: Record<string, unknown>): Record<string, unknown> {
  if (typeof structuredClone === 'function') {
    return structuredClone(content);
  }
  return JSON.parse(JSON.stringify(content)) as Record<string, unknown>;
}

export interface PublishWorkingDraftOptions {
  /** Slug público congelado no snapshot (derivado do nome no momento da publicação). */
  slug: string;
  /**
   * Revisão esperada do rascunho. Quando informada, a publicação falha com `StaleDraftError` se
   * o rascunho tiver mudado — nunca publica silenciosamente um conteúdo diferente do esperado.
   */
  expectedRevision?: number;
}

/**
 * Publica o rascunho de trabalho como uma nova versão imutável.
 *
 * Tudo acontece em uma única transação read-write: ler a publicação atual, calcular
 * `max(versão)+1`, validar, superar a publicação anterior (apenas o `state`) e inserir o novo
 * registro. Assim não há sobrescrita silenciosa nem reuso de versão em cenários de concorrência.
 * O `content` do rascunho é clonado — o snapshot não compartilha referência com o editor.
 */
export async function publishWorkingDraft(
  profileTechnicalId: string,
  options: PublishWorkingDraftOptions,
): Promise<LocalPublicationRecord> {
  const db = getStudioDb();
  await ensureStudioDbReady(db);
  return db.transaction('rw', db.publications, db.workingDrafts, db.localProfiles, async () => {
    const profile = await db.localProfiles.get(profileTechnicalId);
    if (!profile || profile.isDeleted) {
      throw new Error('Perfil local não encontrado para publicar.');
    }
    const working = await db.workingDrafts.get(profileTechnicalId);
    if (!working) {
      throw new Error('Rascunho de trabalho não encontrado para publicar.');
    }
    if (options.expectedRevision !== undefined && working.revision !== options.expectedRevision) {
      throw new StaleDraftError(profileTechnicalId, options.expectedRevision, working.revision);
    }

    // O slug público precisa respeitar o contrato (3–48, minúsculas/números/hífens), não pode
    // ocupar uma rota interna do hub nem ser disputado por dois perfis publicados.
    const slugValidation = validateSlug(options.slug);
    if (!slugValidation.ok || !slugValidation.value) {
      throw new PublicationSlugError(
        'O endereço do perfil precisa ter entre 3 e 48 caracteres e usar apenas letras minúsculas, números e hífens.',
        options.slug,
      );
    }
    const slug = slugValidation.value;
    if (isReservedPublicSlug(slug)) {
      throw new PublicationSlugError(
        `O endereço /${slug} é reservado para uma rota interna do Hättz.`,
        slug,
      );
    }

    // Slugs publicados são globais: dois perfis não podem disputar o mesmo endereço. A leitura
    // ocorre dentro da mesma transação read-write que cria a publicação, então a checagem e a
    // escrita são atômicas (sem janela para corrida entre perfis).
    const slugOwner = await db.publications
      .where('state')
      .equals('published')
      .filter((record) => record.slug === slug && record.profileTechnicalId !== profileTechnicalId)
      .first();
    if (slugOwner) {
      throw new PublicationSlugError(
        `O endereço /${slug} já está sendo usado por outro perfil publicado.`,
        slug,
      );
    }

    // Validar ANTES de persistir: conteúdo inválido nunca vira snapshot publicado.
    const validation = validatePublishableSnapshotContent(working.content);
    if (!validation.ok || !validation.value) {
      throw new PublicationValidationError(validation.issues);
    }

    // A publicação atual é encontrada pelo índice composto (independente de ordenação).
    const current = await db.publications
      .where('[profileTechnicalId+state]')
      .equals([profileTechnicalId, 'published'])
      .first();

    const existing = await db.publications
      .where('profileTechnicalId')
      .equals(profileTechnicalId)
      .toArray();
    const nextVersion = existing.reduce((max, record) => Math.max(max, record.version), 0) + 1;

    const now = Date.now();
    if (current) {
      // Nova publicação supera a anterior: só o estado muda; o conteúdo anterior é preservado.
      await db.publications.update(current.publicationId, {
        state: 'unpublished',
        unpublishedAt: now,
      });
    }

    const publication: LocalPublicationRecord = {
      publicationId: createLocalId('pub'),
      profileTechnicalId,
      version: nextVersion,
      slug,
      state: 'published',
      content: cloneContent(working.content),
      publishedAt: now,
      unpublishedAt: null,
      createdAt: now,
    };
    await db.publications.add(publication);
    // `lastPublishedVersion` é mantido apenas para exibição; a fonte da verdade é o registro.
    await db.localProfiles.update(profileTechnicalId, {
      lastPublishedVersion: nextVersion,
      visibility: 'public_intent',
      updatedAt: now,
    });
    return publication;
  });
}

/** Publicação atual (a única com `state === 'published'`), ou `null` se não há versão publicada. */
export async function getCurrentPublication(
  profileTechnicalId: string,
): Promise<LocalPublicationRecord | null> {
  const db = getStudioDb();
  await ensureStudioDbReady(db);
  const record = await db.publications
    .where('[profileTechnicalId+state]')
    .equals([profileTechnicalId, 'published'])
    .first();
  return record ?? null;
}

/** Histórico de versões publicadas, da mais recente para a mais antiga (ordenação explícita). */
export async function listPublications(
  profileTechnicalId: string,
): Promise<LocalPublicationRecord[]> {
  const db = getStudioDb();
  await ensureStudioDbReady(db);
  const records = await db.publications
    .where('profileTechnicalId')
    .equals(profileTechnicalId)
    .toArray();
  return records.sort((a, b) => b.version - a.version);
}

export async function getPublicationByVersion(
  profileTechnicalId: string,
  version: number,
): Promise<LocalPublicationRecord | null> {
  const db = getStudioDb();
  await ensureStudioDbReady(db);
  const record = await db.publications
    .where('profileTechnicalId')
    .equals(profileTechnicalId)
    .filter((entry) => entry.version === version)
    .first();
  return record ?? null;
}

/**
 * Despublica o perfil: a versão atual passa para `unpublished` e deixa de ser selecionável como
 * publicação atual. O snapshot permanece no histórico com o conteúdo intacto. Idempotente.
 */
export async function unpublishProfile(
  profileTechnicalId: string,
): Promise<LocalPublicationRecord | null> {
  const db = getStudioDb();
  await ensureStudioDbReady(db);
  return db.transaction('rw', db.publications, db.localProfiles, async () => {
    const current = await db.publications
      .where('[profileTechnicalId+state]')
      .equals([profileTechnicalId, 'published'])
      .first();
    if (!current) return null;
    const now = Date.now();
    await db.publications.update(current.publicationId, {
      state: 'unpublished',
      unpublishedAt: now,
    });
    await db.localProfiles.update(profileTechnicalId, {
      lastPublishedVersion: null,
      visibility: 'unpublished',
      updatedAt: now,
    });
    return { ...current, state: 'unpublished' as const, unpublishedAt: now };
  });
}
