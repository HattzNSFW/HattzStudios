/**
 * Contratos de domínio de colecionáveis (badges, molduras, coleções, recompensas) e da posse
 * vinculada a um perfil.
 *
 * Estes tipos são a linguagem comum entre catálogo, seed de demonstração, repositories locais e a
 * futura implementação no backend. Eles espelham — sem duplicar — o modelo já existente em
 * `infrastructure/supabase/migrations/0005_collectibles_collections.sql` e reutilizam
 * `AvailabilityKind` (`./availability`) e `CollectibleRarity`.
 *
 * Nada aqui concede autoridade administrativa nem representa posse real: são apenas contratos.
 */

import type { AvailabilityKind } from './availability';

/** Raridades aprovadas. Espelha o enum `collectible_rarity` do banco (migration 0001). */
export const COLLECTIBLE_RARITIES = [
  'comum',
  'incomum',
  'rara',
  'epica',
  'lendaria',
  'mitica',
  'especial',
] as const;

export type CollectibleRarity = (typeof COLLECTIBLE_RARITIES)[number];

/** Categorias conhecidas. A coluna `category` do banco é texto livre, então o tipo é extensível. */
export const COLLECTIBLE_CATEGORIES = [
  'general',
  'profile',
  'event',
  'collection',
  'community',
] as const;
export type CollectibleCategory =
  | (typeof COLLECTIBLE_CATEGORIES)[number]
  | (string & Record<never, never>);

/** Permanência de uma moldura. Espelha `frames_catalog.permanence` (migration 0005). */
export const FRAME_PERMANENCES = ['permanent', 'temporary', 'limited', 'event'] as const;
export type FramePermanence = (typeof FRAME_PERMANENCES)[number];

/**
 * Origem de aquisição/atribuição. Espelha o enum `grant_source_type` do banco (migration 0001).
 * `manual` e `system_test` são origens administrativas/de teste; as demais derivam de conquistas
 * ou eventos locais/futuros.
 */
export const GRANT_SOURCE_TYPES = [
  'manual',
  'automatic',
  'event',
  'role',
  'collection_reward',
  'system_test',
] as const;
export type GrantSourceType = (typeof GRANT_SOURCE_TYPES)[number];

/** Origens que exigem autorização administrativa. */
export const ADMIN_GRANT_SOURCE_TYPES = ['manual', 'system_test'] as const;
export type AdminGrantSourceType = (typeof ADMIN_GRANT_SOURCE_TYPES)[number];

export function isAdminGrantSource(source: GrantSourceType): source is AdminGrantSourceType {
  return (ADMIN_GRANT_SOURCE_TYPES as readonly string[]).includes(source);
}

/** Tipo de item colecionável que pode ser possuído/equipado diretamente. */
export const COLLECTIBLE_ITEM_TYPES = ['badge', 'frame'] as const;
export type CollectibleItemType = (typeof COLLECTIBLE_ITEM_TYPES)[number];

/** Estado de equipagem derivado do booleano persistido `is_equipped`. */
export const EQUIP_STATES = ['equipped', 'not_equipped'] as const;
export type EquipState = (typeof EQUIP_STATES)[number];

/** Visibilidade pública de um item possuído. */
export const COLLECTIBLE_VISIBILITIES = ['visible', 'hidden'] as const;
export type CollectibleVisibility = (typeof COLLECTIBLE_VISIBILITIES)[number];

export const COLLECTION_STATUSES = ['draft', 'active', 'closed', 'archived'] as const;
export type CollectionStatus = (typeof COLLECTION_STATUSES)[number];

export const COLLECTION_ITEM_TYPES = ['badge', 'frame', 'benefit', 'task', 'other'] as const;
export type CollectionItemType = (typeof COLLECTION_ITEM_TYPES)[number];

export const COLLECTION_PROGRESS_STATUSES = [
  'locked',
  'in_progress',
  'completed',
  'reward_claimed',
  'revoked',
] as const;
export type CollectionProgressStatus = (typeof COLLECTION_PROGRESS_STATUSES)[number];

/** Definição de badge no catálogo (read-only). Não representa posse. */
export interface BadgeDefinition {
  badgeKey: string;
  name: string;
  description: string;
  category: CollectibleCategory;
  rarity: CollectibleRarity;
  availability: AvailabilityKind;
  /** Espelha `is_special`; por CHECK do banco, `rarity === 'especial'` ⇔ `isSpecial`. */
  isSpecial: boolean;
  /** Marca dados fictícios de demonstração (nunca catálogo de produção). */
  isDemo: boolean;
}

/** Definição de moldura no catálogo (read-only). Não representa posse. */
export interface FrameDefinition {
  frameKey: string;
  name: string;
  description: string;
  category: CollectibleCategory;
  rarity: CollectibleRarity;
  permanence: FramePermanence;
  availability: AvailabilityKind;
  isAnimated: boolean;
  isDemo: boolean;
}

/** Item de uma coleção (referência por chave de domínio). */
export interface CollectionItemDefinition {
  itemType: CollectionItemType;
  itemRef: string;
  sortOrder: number;
}

/** Definição de coleção/conjunto (read-only). Não representa progresso nem posse. */
export interface CollectionDefinition {
  collectionKey: string;
  name: string;
  description: string;
  status: CollectionStatus;
  items: readonly CollectionItemDefinition[];
  isDemo: boolean;
}

/** Definição de recompensa concedida por uma coleção. */
export interface CollectionRewardDefinition {
  rewardKey: string;
  name: string;
  description: string;
  itemType: CollectionItemType;
  itemRef: string;
  isDemo: boolean;
}

/** Origem de aquisição de um item possuído. */
export interface AcquisitionSource {
  source: GrantSourceType;
  sourceRef: string | null;
}

/**
 * Posse de um badge por um perfil. Espelha `user_badges` (migration 0005).
 * `revokedAt === null` significa posse ativa; a unicidade de posse ativa por (perfil, badge) é
 * imposta pelo repository (espelhando `ux_user_badges_active_unique`).
 */
export interface BadgeOwnership extends AcquisitionSource {
  profileTechnicalId: string;
  badgeKey: string;
  grantedAt: number;
  revokedAt: number | null;
  revokeReason: string | null;
  isEquipped: boolean;
  isFavorite: boolean;
  sortOrder: number | null;
}

/** Posse de uma moldura por um perfil. Espelha `user_frames` (migration 0005). */
export interface FrameOwnership extends AcquisitionSource {
  profileTechnicalId: string;
  frameKey: string;
  grantedAt: number;
  expiresAt: number | null;
  revokedAt: number | null;
  revokeReason: string | null;
  isEquipped: boolean;
}

/** Progresso de um perfil em uma coleção. Espelha `user_collection_progress`. */
export interface CollectionProgress {
  profileTechnicalId: string;
  collectionKey: string;
  status: CollectionProgressStatus;
  progress: Record<string, unknown>;
  completedAt: number | null;
  rewardGrantedAt: number | null;
  updatedAt: number;
}

/** Item colecionável equipável (visão mínima usada pela autorização de equipagem). */
export interface EquippableItem {
  itemType: CollectibleItemType;
  itemKey: string;
  availability: AvailabilityKind;
}

/**
 * Evidência OPAQUE de autoridade, emitida por uma fonte confiável (backend/sincronização futura).
 *
 * O cliente NUNCA interpreta nem valida este valor: ele apenas o transporta até um verificador
 * confiável (`OwnershipAuthorityVerifier`). O formato e a verificação (ex.: assinatura validada
 * contra uma chave fixada, ou consulta ao servidor) serão definidos pela implementação confiável.
 * Nada disso é implementado localmente.
 */
export type OwnershipAuthorityProof = string;

/**
 * Posse mínima consultada pela autorização de equipagem.
 *
 * ATENÇÃO — FRONTEIRA DE CONFIANÇA: todos estes campos vivem no armazenamento local
 * (IndexedDB/Dexie), que é integralmente controlável pelo usuário. Portanto NENHUM campo aqui —
 * incluindo `source` e `isDemo` — pode, por si só, estabelecer autoridade administrativa. Um
 * usuário pode inserir/alterar diretamente um registro com `source: 'manual'` ou
 * `source: 'system_test'` e `isDemo: false`; isso NÃO deve ser tratado como concessão
 * administrativa. A autoridade só é reconhecida quando uma `TrustedOwnershipAuthority` confiável
 * (código opaco, não dado persistido) a atesta.
 */
export interface OwnershipState {
  profileTechnicalId: string;
  itemKey: string;
  source: GrantSourceType;
  revokedAt: number | null;
  isDemo: boolean;
  /** Evidência opaca de fonte confiável; `null` em qualquer posse puramente local. */
  authorityProof: OwnershipAuthorityProof | null;
}

/** Veredito de autoridade de posse. */
export interface OwnershipAuthorityVerdict {
  readonly authoritative: boolean;
  readonly reason: string | null;
}

/**
 * Função verificadora de autoridade de posse.
 *
 * NÃO é aceita diretamente por nenhuma API pública: fica encapsulada numa `TrustedOwnershipAuthority`
 * opaca, criada apenas pela fábrica interna. A implementação confiável deve validar `authorityProof`
 * contra uma fonte confiável (chave fixada/servidor) e recusar `system_test` em produção. Nenhuma
 * criptografia/assinatura é implementada aqui — apenas o ponto de extensão.
 */
export type OwnershipAuthorityVerifier = (ownership: OwnershipState) => OwnershipAuthorityVerdict;

declare const trustedOwnershipAuthorityBrand: unique symbol;

/**
 * Autoridade de posse CONFIÁVEL e OPACA.
 *
 * Carrega o verificador usado para autorizar a equipagem de itens Exclusivos. A marca
 * (`unique symbol` NÃO exportado) impede que um consumidor comum construa este valor: ele só é
 * obtido por uma fábrica INTERNA, fora da interface pública de produção
 * (`@hattz/local-store/testing`). Consequência: NENHUMA API pública aceita uma função verificadora
 * arbitrária — apenas esta autoridade opaca, produzida por código confiável (ou pelo harness de
 * testes). Um objeto forjado com `as` é recusado em tempo de execução pela fábrica interna.
 */
export interface TrustedOwnershipAuthority {
  readonly [trustedOwnershipAuthorityBrand]: true;
  verify(ownership: OwnershipState): OwnershipAuthorityVerdict;
}

/**
 * Verificador fail-closed padrão: NENHUMA posse é autoritativa sem fonte confiável.
 * É o padrão do ambiente local atual, onde tal fonte ainda não existe.
 */
export const denyAllOwnershipAuthority: OwnershipAuthorityVerifier = () => ({
  authoritative: false,
  reason: 'no_trusted_authority',
});

export function toEquipState(isEquipped: boolean): EquipState {
  return isEquipped ? 'equipped' : 'not_equipped';
}

export function isEquippedState(state: EquipState): boolean {
  return state === 'equipped';
}

/** Uma posse é ativa quando ainda não foi revogada. */
export function isActiveOwnership(ownership: Pick<OwnershipState, 'revokedAt'>): boolean {
  return ownership.revokedAt === null;
}
