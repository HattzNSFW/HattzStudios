/**
 * Repositório de colecionáveis (badges, molduras e progresso de coleções).
 *
 * Consultas e mutações são separadas. Toda mutação VALIDA antes de persistir e passa pelo motor de
 * autorização (`@hattz/permissions`): mutações administrativas exigem sessão confiável e são
 * RECUSADAS no ambiente local. O isolamento por perfil é preservado em todas as operações.
 *
 * A unicidade de posse ativa por (perfil, item) é imposta DENTRO de uma transação read-write,
 * espelhando `ux_user_badges_active_unique` (migration 0005). Não equipar item não possuído.
 *
 * FRONTEIRA DE CONFIANÇA: o IndexedDB é integralmente controlável pelo usuário. Um registro com
 * `source: 'manual'`/`'system_test'` e `isDemo: false` pode ser forjado localmente. Por isso a
 * autoridade de posse NUNCA é lida dos campos do registro: ela só é reconhecida por uma
 * `TrustedOwnershipAuthority` OPACA (código confiável), injetada via `EquipOptions.authority`. Sem
 * autoridade (padrão local), itens Exclusivos não são equipáveis (fail-closed). A fábrica dessa
 * autoridade vive em `./trustedAuthority` (interna, fora da API pública).
 */

import {
  findBadgeDefinition,
  findFrameDefinition,
  isAdminGrantSource,
  isAvailabilityKind,
  type AvailabilityKind,
  type CollectionProgressStatus,
  type GrantSourceType,
  type TrustedOwnershipAuthority,
} from '@hattz/core';
import { canEquipItem, hasAdminSession, type AuthorizationContext } from '@hattz/permissions';
import { isTrustedOwnershipAuthority } from './trustedAuthority';
import {
  getStudioDb,
  type UserBadgeRecord,
  type UserCollectionProgressRecord,
  type UserFrameRecord,
} from './db';

/* ------------------------------------------------------------------ */
/* Erros                                                              */
/* ------------------------------------------------------------------ */

export class CollectibleValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CollectibleValidationError';
  }
}

export class CollectibleAuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CollectibleAuthorizationError';
  }
}

/** Posse ativa duplicada do mesmo item para o mesmo perfil. */
export class DuplicateActiveOwnershipError extends Error {
  constructor(profileTechnicalId: string, itemKey: string) {
    super(`Posse ativa já existe para "${itemKey}" no perfil "${profileTechnicalId}".`);
    this.name = 'DuplicateActiveOwnershipError';
  }
}

/** Tentativa de equipar um item que o perfil não possui ativamente. */
export class ItemNotOwnedError extends Error {
  constructor(profileTechnicalId: string, itemKey: string) {
    super(`Perfil "${profileTechnicalId}" não possui ativamente o item "${itemKey}".`);
    this.name = 'ItemNotOwnedError';
  }
}

function createRecordId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function assertNonEmpty(value: string, field: string): void {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new CollectibleValidationError(`Campo "${field}" é obrigatório.`);
  }
}

function assertKnownSource(source: GrantSourceType): void {
  if (!isKnownGrantSource(source)) {
    throw new CollectibleValidationError(`Origem de aquisição inválida: "${String(source)}".`);
  }
}

const KNOWN_GRANT_SOURCES: ReadonlySet<string> = new Set([
  'manual',
  'automatic',
  'event',
  'role',
  'collection_reward',
  'system_test',
]);

function isKnownGrantSource(source: string): boolean {
  return KNOWN_GRANT_SOURCES.has(source);
}

/**
 * Uma concessão não administrativa (conquista/evento/sistema) só é permitida quando:
 * - o item tem disponibilidade `standard` (nunca VIP/exclusivo por caminho não administrativo);
 * - o alvo é o próprio perfil do contexto (isolamento por perfil).
 */
function assertNonAdminGrant(
  ctx: AuthorizationContext,
  profileTechnicalId: string,
  availability: AvailabilityKind,
): void {
  if (availability !== 'standard') {
    throw new CollectibleAuthorizationError(
      `Concessão não administrativa exige disponibilidade "standard" (recebido "${availability}").`,
    );
  }
  if (ctx.profileTechnicalId === null || ctx.profileTechnicalId !== profileTechnicalId) {
    throw new CollectibleAuthorizationError(
      'Concessão não administrativa restrita ao próprio perfil.',
    );
  }
}

/* ------------------------------------------------------------------ */
/* Consultas (somente leitura)                                        */
/* ------------------------------------------------------------------ */

export async function listBadgesForProfile(profileTechnicalId: string): Promise<UserBadgeRecord[]> {
  return getStudioDb()
    .userBadges.where('profileTechnicalId')
    .equals(profileTechnicalId)
    .sortBy('grantedAt');
}

export async function listActiveBadges(profileTechnicalId: string): Promise<UserBadgeRecord[]> {
  const badges = await listBadgesForProfile(profileTechnicalId);
  return badges.filter((badge) => badge.revokedAt === null);
}

export async function getActiveBadge(
  profileTechnicalId: string,
  badgeKey: string,
): Promise<UserBadgeRecord | null> {
  const match = await getStudioDb()
    .userBadges.where('[profileTechnicalId+badgeKey]')
    .equals([profileTechnicalId, badgeKey])
    .filter((badge) => badge.revokedAt === null)
    .first();
  return match ?? null;
}

export async function listFramesForProfile(profileTechnicalId: string): Promise<UserFrameRecord[]> {
  return getStudioDb()
    .userFrames.where('profileTechnicalId')
    .equals(profileTechnicalId)
    .sortBy('grantedAt');
}

export async function listActiveFrames(profileTechnicalId: string): Promise<UserFrameRecord[]> {
  const frames = await listFramesForProfile(profileTechnicalId);
  return frames.filter((frame) => frame.revokedAt === null);
}

export async function getActiveFrame(
  profileTechnicalId: string,
  frameKey: string,
): Promise<UserFrameRecord | null> {
  const match = await getStudioDb()
    .userFrames.where('[profileTechnicalId+frameKey]')
    .equals([profileTechnicalId, frameKey])
    .filter((frame) => frame.revokedAt === null)
    .first();
  return match ?? null;
}

export async function listCollectionProgress(
  profileTechnicalId: string,
): Promise<UserCollectionProgressRecord[]> {
  return getStudioDb()
    .userCollectionProgress.where('profileTechnicalId')
    .equals(profileTechnicalId)
    .sortBy('updatedAt');
}

export async function getCollectionProgress(
  profileTechnicalId: string,
  collectionKey: string,
): Promise<UserCollectionProgressRecord | null> {
  const match = await getStudioDb()
    .userCollectionProgress.where('[profileTechnicalId+collectionKey]')
    .equals([profileTechnicalId, collectionKey])
    .first();
  return match ?? null;
}

/* ------------------------------------------------------------------ */
/* Mutações                                                           */
/* ------------------------------------------------------------------ */

export interface GrantBadgeInput {
  profileTechnicalId: string;
  badgeKey: string;
  source: GrantSourceType;
  sourceRef?: string | null;
  isDemo?: boolean;
  grantedAt?: number;
  metadata?: Record<string, unknown>;
}

export async function grantBadge(
  ctx: AuthorizationContext,
  input: GrantBadgeInput,
): Promise<UserBadgeRecord> {
  assertNonEmpty(input.profileTechnicalId, 'profileTechnicalId');
  assertNonEmpty(input.badgeKey, 'badgeKey');
  assertKnownSource(input.source);

  const definition = findBadgeDefinition(input.badgeKey);
  if (!definition) {
    throw new CollectibleValidationError(`Badge desconhecido no catálogo: "${input.badgeKey}".`);
  }

  if (isAdminGrantSource(input.source)) {
    // Fail-closed: sem sessão administrativa confiável, a concessão administrativa é recusada.
    if (!hasAdminSession(ctx)) {
      throw new CollectibleAuthorizationError(
        'Concessão administrativa de badge exige sessão administrativa confiável (indisponível localmente).',
      );
    }
  } else {
    assertNonAdminGrant(ctx, input.profileTechnicalId, definition.availability);
  }

  const db = getStudioDb();
  const grantedAt = input.grantedAt ?? Date.now();
  return db.transaction('rw', db.userBadges, async () => {
    const existing = await db.userBadges
      .where('[profileTechnicalId+badgeKey]')
      .equals([input.profileTechnicalId, input.badgeKey])
      .filter((badge) => badge.revokedAt === null)
      .first();
    if (existing) {
      throw new DuplicateActiveOwnershipError(input.profileTechnicalId, input.badgeKey);
    }
    const record: UserBadgeRecord = {
      id: createRecordId('ubadge'),
      profileTechnicalId: input.profileTechnicalId,
      badgeKey: input.badgeKey,
      source: input.source,
      sourceRef: input.sourceRef ?? null,
      grantedAt,
      revokedAt: null,
      revokeReason: null,
      isEquipped: false,
      isFavorite: false,
      sortOrder: null,
      isDemo: input.isDemo ?? false,
      // Concessões locais NUNCA carregam evidência de autoridade: não há fonte confiável local.
      authorityProof: null,
      metadata: input.metadata ?? {},
    };
    await db.userBadges.put(record);
    return record;
  });
}

/**
 * Opções de equipagem.
 *
 * `authority` é uma `TrustedOwnershipAuthority` OPACA — CÓDIGO confiável, nunca dado persistido e
 * nunca uma função verificadora arbitrária. A interface pública NÃO permite substituir o
 * verificador por uma função: a autoridade só pode ser criada pela fábrica interna
 * (`@hattz/local-store/testing`), inalcançável por consumidores comuns. Ausente => fail-closed
 * (`denyAllOwnershipAuthority`): nenhum item Exclusivo é equipável no ambiente local atual.
 * Mesmo um objeto forjado com `as` é recusado (registro interno de autoridades legítimas).
 */
export interface EquipOptions {
  authority?: TrustedOwnershipAuthority;
}

/** Resolve a autoridade apenas se ela vier da fábrica interna; caso contrário, fail-closed. */
function resolveAuthority(
  authority: TrustedOwnershipAuthority | undefined,
): TrustedOwnershipAuthority | null {
  return isTrustedOwnershipAuthority(authority) ? authority : null;
}

export async function equipBadge(
  ctx: AuthorizationContext,
  profileTechnicalId: string,
  badgeKey: string,
  options: EquipOptions = {},
): Promise<UserBadgeRecord> {
  assertNonEmpty(profileTechnicalId, 'profileTechnicalId');
  assertNonEmpty(badgeKey, 'badgeKey');
  const definition = findBadgeDefinition(badgeKey);
  if (!definition) {
    throw new CollectibleValidationError(`Badge desconhecido no catálogo: "${badgeKey}".`);
  }

  const authority = resolveAuthority(options.authority);
  const db = getStudioDb();
  return db.transaction('rw', db.userBadges, async () => {
    const ownership = await db.userBadges
      .where('[profileTechnicalId+badgeKey]')
      .equals([profileTechnicalId, badgeKey])
      .filter((badge) => badge.revokedAt === null)
      .first();
    if (!ownership) {
      throw new ItemNotOwnedError(profileTechnicalId, badgeKey);
    }
    const decision = canEquipItem(
      ctx,
      { itemType: 'badge', itemKey: badgeKey, availability: definition.availability },
      {
        profileTechnicalId: ownership.profileTechnicalId,
        itemKey: ownership.badgeKey,
        source: ownership.source,
        revokedAt: ownership.revokedAt,
        isDemo: ownership.isDemo,
        authorityProof: ownership.authorityProof ?? null,
      },
      authority,
    );
    if (!decision.allowed) {
      throw new CollectibleAuthorizationError(
        `Equipar badge recusado (${decision.reason ?? 'motivo desconhecido'}).`,
      );
    }
    await db.userBadges.update(ownership.id, { isEquipped: true });
    return { ...ownership, isEquipped: true };
  });
}

export async function revokeBadge(
  ctx: AuthorizationContext,
  profileTechnicalId: string,
  badgeKey: string,
  reason: string | null = null,
): Promise<UserBadgeRecord | null> {
  assertNonEmpty(profileTechnicalId, 'profileTechnicalId');
  assertNonEmpty(badgeKey, 'badgeKey');
  if (!hasAdminSession(ctx)) {
    throw new CollectibleAuthorizationError(
      'Revogação de badge exige sessão administrativa confiável (indisponível localmente).',
    );
  }
  const db = getStudioDb();
  return db.transaction('rw', db.userBadges, async () => {
    const ownership = await db.userBadges
      .where('[profileTechnicalId+badgeKey]')
      .equals([profileTechnicalId, badgeKey])
      .filter((badge) => badge.revokedAt === null)
      .first();
    if (!ownership) return null;
    const revokedAt = Date.now();
    await db.userBadges.update(ownership.id, {
      revokedAt,
      revokeReason: reason,
      isEquipped: false,
    });
    return { ...ownership, revokedAt, revokeReason: reason, isEquipped: false };
  });
}

export interface GrantFrameInput {
  profileTechnicalId: string;
  frameKey: string;
  source: GrantSourceType;
  sourceRef?: string | null;
  isDemo?: boolean;
  grantedAt?: number;
  metadata?: Record<string, unknown>;
}

export async function grantFrame(
  ctx: AuthorizationContext,
  input: GrantFrameInput,
): Promise<UserFrameRecord> {
  assertNonEmpty(input.profileTechnicalId, 'profileTechnicalId');
  assertNonEmpty(input.frameKey, 'frameKey');
  assertKnownSource(input.source);

  const definition = findFrameDefinition(input.frameKey);
  if (!definition) {
    throw new CollectibleValidationError(`Moldura desconhecida no catálogo: "${input.frameKey}".`);
  }

  if (isAdminGrantSource(input.source)) {
    if (!hasAdminSession(ctx)) {
      throw new CollectibleAuthorizationError(
        'Concessão administrativa de moldura exige sessão administrativa confiável (indisponível localmente).',
      );
    }
  } else {
    assertNonAdminGrant(ctx, input.profileTechnicalId, definition.availability);
  }

  const db = getStudioDb();
  const grantedAt = input.grantedAt ?? Date.now();
  return db.transaction('rw', db.userFrames, async () => {
    const existing = await db.userFrames
      .where('[profileTechnicalId+frameKey]')
      .equals([input.profileTechnicalId, input.frameKey])
      .filter((frame) => frame.revokedAt === null)
      .first();
    if (existing) {
      throw new DuplicateActiveOwnershipError(input.profileTechnicalId, input.frameKey);
    }
    const record: UserFrameRecord = {
      id: createRecordId('uframe'),
      profileTechnicalId: input.profileTechnicalId,
      frameKey: input.frameKey,
      source: input.source,
      sourceRef: input.sourceRef ?? null,
      grantedAt,
      expiresAt: null,
      revokedAt: null,
      revokeReason: null,
      isEquipped: false,
      isDemo: input.isDemo ?? false,
      // Concessões locais NUNCA carregam evidência de autoridade: não há fonte confiável local.
      authorityProof: null,
      metadata: input.metadata ?? {},
    };
    await db.userFrames.put(record);
    return record;
  });
}

export async function equipFrame(
  ctx: AuthorizationContext,
  profileTechnicalId: string,
  frameKey: string,
  options: EquipOptions = {},
): Promise<UserFrameRecord> {
  assertNonEmpty(profileTechnicalId, 'profileTechnicalId');
  assertNonEmpty(frameKey, 'frameKey');
  const definition = findFrameDefinition(frameKey);
  if (!definition) {
    throw new CollectibleValidationError(`Moldura desconhecida no catálogo: "${frameKey}".`);
  }

  const authority = resolveAuthority(options.authority);
  const db = getStudioDb();
  return db.transaction('rw', db.userFrames, async () => {
    const ownership = await db.userFrames
      .where('[profileTechnicalId+frameKey]')
      .equals([profileTechnicalId, frameKey])
      .filter((frame) => frame.revokedAt === null)
      .first();
    if (!ownership) {
      throw new ItemNotOwnedError(profileTechnicalId, frameKey);
    }
    const decision = canEquipItem(
      ctx,
      { itemType: 'frame', itemKey: frameKey, availability: definition.availability },
      {
        profileTechnicalId: ownership.profileTechnicalId,
        itemKey: ownership.frameKey,
        source: ownership.source,
        revokedAt: ownership.revokedAt,
        isDemo: ownership.isDemo,
        authorityProof: ownership.authorityProof ?? null,
      },
      authority,
    );
    if (!decision.allowed) {
      throw new CollectibleAuthorizationError(
        `Equipar moldura recusado (${decision.reason ?? 'motivo desconhecido'}).`,
      );
    }
    await db.userFrames.update(ownership.id, { isEquipped: true });
    return { ...ownership, isEquipped: true };
  });
}

export async function revokeFrame(
  ctx: AuthorizationContext,
  profileTechnicalId: string,
  frameKey: string,
  reason: string | null = null,
): Promise<UserFrameRecord | null> {
  assertNonEmpty(profileTechnicalId, 'profileTechnicalId');
  assertNonEmpty(frameKey, 'frameKey');
  if (!hasAdminSession(ctx)) {
    throw new CollectibleAuthorizationError(
      'Revogação de moldura exige sessão administrativa confiável (indisponível localmente).',
    );
  }
  const db = getStudioDb();
  return db.transaction('rw', db.userFrames, async () => {
    const ownership = await db.userFrames
      .where('[profileTechnicalId+frameKey]')
      .equals([profileTechnicalId, frameKey])
      .filter((frame) => frame.revokedAt === null)
      .first();
    if (!ownership) return null;
    const revokedAt = Date.now();
    await db.userFrames.update(ownership.id, {
      revokedAt,
      revokeReason: reason,
      isEquipped: false,
    });
    return { ...ownership, revokedAt, revokeReason: reason, isEquipped: false };
  });
}

export interface RecordCollectionProgressInput {
  profileTechnicalId: string;
  collectionKey: string;
  status: CollectionProgressStatus;
  progress?: Record<string, unknown>;
  isDemo?: boolean;
}

/**
 * Registra/atualiza progresso de coleção. Operação de sistema (não administrativa): não concede
 * posse nem benefícios por si só. A validação de conclusão/recompensa pertence a uma entrega futura.
 */
export async function recordCollectionProgress(
  input: RecordCollectionProgressInput,
): Promise<UserCollectionProgressRecord> {
  assertNonEmpty(input.profileTechnicalId, 'profileTechnicalId');
  assertNonEmpty(input.collectionKey, 'collectionKey');
  const db = getStudioDb();
  const now = Date.now();
  return db.transaction('rw', db.userCollectionProgress, async () => {
    const existing = await db.userCollectionProgress
      .where('[profileTechnicalId+collectionKey]')
      .equals([input.profileTechnicalId, input.collectionKey])
      .first();
    const completedAt =
      input.status === 'completed' || input.status === 'reward_claimed'
        ? (existing?.completedAt ?? now)
        : (existing?.completedAt ?? null);
    const record: UserCollectionProgressRecord = {
      id: existing?.id ?? createRecordId('uprog'),
      profileTechnicalId: input.profileTechnicalId,
      collectionKey: input.collectionKey,
      status: input.status,
      progress: input.progress ?? existing?.progress ?? {},
      completedAt,
      rewardGrantedAt: existing?.rewardGrantedAt ?? null,
      updatedAt: now,
      isDemo: input.isDemo ?? existing?.isDemo ?? false,
    };
    await db.userCollectionProgress.put(record);
    return record;
  });
}

/** Reexportado para conveniência de validação externa (ex.: testes). */
export function isKnownAvailability(value: unknown): value is AvailabilityKind {
  return isAvailabilityKind(value);
}
