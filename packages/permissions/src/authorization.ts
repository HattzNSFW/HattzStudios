/**
 * Motor de autorização — puro, centralizado, tipado e independente da interface.
 *
 * FAIL-CLOSED: no ambiente local atual NÃO existe sessão administrativa confiável. O tipo
 * `TrustedAdminSession` é opaco (marca por símbolo não exportado), portanto nenhum código local —
 * inclusive o seed de demonstração — consegue construí-lo. `assertAdminSession` nega qualquer
 * operação administrativa localmente.
 *
 * O cargo público do perfil (`ctx.role`) NUNCA concede autoridade administrativa: apenas a sessão
 * administrativa confiável o faz. Isso separa o cargo público Owner do Owner administrativo.
 */

import {
  denyAllOwnershipAuthority,
  type AvailabilityKind,
  type EquippableItem,
  type OwnershipState,
  type TrustedOwnershipAuthority,
} from '@hattz/core';
import { isPrivateRole, isRoleFreelySelectable, roleHierarchy, type RoleKey } from './roles';
import { resolveInheritedRoleBenefits, type BenefitKey } from './benefits';

declare const trustedAdminSessionBrand: unique symbol;

/**
 * Sessão administrativa confiável. Opaca: o símbolo de marca não é exportado, então apenas o
 * futuro backend (fora do ambiente local) pode produzi-la.
 */
export interface TrustedAdminSession {
  readonly [trustedAdminSessionBrand]: true;
  readonly adminId: string;
  readonly issuedAt: number;
}

export interface AuthorizationContext {
  /** Cargo público do perfil. NÃO concede autoridade administrativa. */
  readonly role: RoleKey | null;
  /** Perfil alvo/atual. Dados de perfil nunca elevam privilégio. */
  readonly profileTechnicalId: string | null;
  /** Sessão administrativa confiável. Sempre `null` no ambiente local atual. */
  readonly adminSession: TrustedAdminSession | null;
}

export type AuthorizationDenyReason =
  | 'no_admin_session'
  | 'role_not_selectable'
  | 'role_assignment_forbidden'
  | 'role_revoke_forbidden'
  | 'benefit_grant_forbidden'
  | 'benefit_revoke_forbidden'
  | 'badge_publication_forbidden'
  | 'availability_denied'
  | 'demo_not_authoritative'
  | 'ownership_not_verified'
  | 'item_not_owned'
  | 'profile_mismatch';

export interface AuthorizationDecision {
  readonly allowed: boolean;
  readonly reason: AuthorizationDenyReason | null;
}

function allow(): AuthorizationDecision {
  return { allowed: true, reason: null };
}

function deny(reason: AuthorizationDenyReason): AuthorizationDecision {
  return { allowed: false, reason };
}

/** Erro lançado quando uma operação administrativa é tentada sem sessão confiável. */
export class AdminAuthorizationError extends Error {
  constructor(
    message = 'Operação administrativa exige sessão administrativa confiável (indisponível no ambiente local).',
  ) {
    super(message);
    this.name = 'AdminAuthorizationError';
  }
}

/** Há sessão administrativa confiável? No ambiente local, sempre `false`. */
export function hasAdminSession(ctx: AuthorizationContext): boolean {
  return ctx.adminSession !== null;
}

/**
 * Garante a presença de sessão administrativa confiável; nega (lança) caso contrário.
 * Fail-closed: na ausência de sessão, NÃO executa a operação.
 */
export function assertAdminSession(ctx: AuthorizationContext): void {
  if (!hasAdminSession(ctx)) {
    throw new AdminAuthorizationError();
  }
}

function roleAtLeast(role: RoleKey | null, minimum: RoleKey): boolean {
  if (!role) return false;
  return roleHierarchy(role) >= roleHierarchy(minimum);
}

/** Benefícios efetivos do contexto (herança do cargo público). */
export function resolveContextBenefits(ctx: AuthorizationContext): readonly BenefitKey[] {
  return ctx.role ? resolveInheritedRoleBenefits(ctx.role) : [];
}

/**
 * Disponibilidade para OBTENÇÃO/ACESSO (portão de aquisição).
 *
 * Responde apenas "o perfil pode RECEBER/obter itens desta disponibilidade?". NÃO é o portão de
 * equipagem e NÃO decide posse (ver `canEquipItem`).
 * - `standard`: qualquer perfil.
 * - `vip`: requer cargo de hierarquia >= VIP (autoritativo) ou sessão admin.
 * - `exclusive`: requer sessão admin — itens exclusivos só são OBTIDOS por concessão administrativa.
 *
 * A ausência de sessão administrativa local impede NOVAS concessões; não invalida posse existente.
 */
export function canAccessAvailability(
  ctx: AuthorizationContext,
  availability: AvailabilityKind,
): AuthorizationDecision {
  switch (availability) {
    case 'standard':
      return allow();
    case 'vip':
      return roleAtLeast(ctx.role, 'vip') || hasAdminSession(ctx)
        ? allow()
        : deny('availability_denied');
    case 'exclusive':
      return hasAdminSession(ctx) ? allow() : deny('availability_denied');
  }
}

/** Cargo privado nunca é selecionável livremente. */
export function canSelectRole(ctx: AuthorizationContext, role: RoleKey): AuthorizationDecision {
  void ctx;
  if (isRoleFreelySelectable(role)) return allow();
  return deny('role_not_selectable');
}

/** Elegibilidade de atribuição: cargos livres por si; os demais exigem sessão admin. */
export function canAssignRole(ctx: AuthorizationContext, role: RoleKey): AuthorizationDecision {
  if (isRoleFreelySelectable(role)) return allow();
  if (hasAdminSession(ctx)) return allow();
  return deny(isPrivateRole(role) ? 'role_not_selectable' : 'role_assignment_forbidden');
}

/** Revogação de cargo é sempre administrativa. */
export function canRevokeRole(ctx: AuthorizationContext, role: RoleKey): AuthorizationDecision {
  void role;
  return hasAdminSession(ctx) ? allow() : deny('role_revoke_forbidden');
}

/** Concessão de benefício é administrativa. */
export function canGrantBenefit(
  ctx: AuthorizationContext,
  benefit: BenefitKey,
): AuthorizationDecision {
  void benefit;
  return hasAdminSession(ctx) ? allow() : deny('benefit_grant_forbidden');
}

/** Revogação de benefício é administrativa. */
export function canRevokeBenefit(
  ctx: AuthorizationContext,
  benefit: BenefitKey,
): AuthorizationDecision {
  void benefit;
  return hasAdminSession(ctx) ? allow() : deny('benefit_revoke_forbidden');
}

/** Publicação de badge é administrativa. */
export function canPublishBadge(ctx: AuthorizationContext): AuthorizationDecision {
  return hasAdminSession(ctx) ? allow() : deny('badge_publication_forbidden');
}

/**
 * Permissão de EQUIPAGEM.
 *
 * Separa três conceitos que NÃO devem ser confundidos:
 * 1. Disponibilidade para obtenção (`canAccessAvailability`) — se o perfil pode RECEBER o item.
 * 2. Posse — posse ativa do próprio perfil (integridade), sem presumir autoridade.
 * 3. Autoridade de posse — se a posse é uma concessão administrativa legítima.
 *
 * FRONTEIRA DE CONFIANÇA: a posse vem do armazenamento local (IndexedDB), que o usuário controla
 * integralmente. Por isso a autoridade NUNCA é inferida dos campos `source`/`isDemo` do registro —
 * apenas de `authority`, uma `TrustedOwnershipAuthority` OPACA produzida por código confiável (fora
 * da interface pública). O parâmetro NÃO é uma função verificadora: um consumidor arbitrário não
 * consegue fornecer o próprio verificador. Ausente => fail-closed (`denyAllOwnershipAuthority`),
 * então no ambiente local atual nenhum item Exclusivo é equipável.
 *
 * Uma posse Exclusiva legitimamente validada por uma fonte confiável futura (que injete uma
 * autoridade real) permanece equipável; uma posse de demonstração nunca é tratada como real.
 */
export function canEquipItem(
  ctx: AuthorizationContext,
  item: EquippableItem,
  ownership: OwnershipState | null,
  authority: TrustedOwnershipAuthority | null = null,
): AuthorizationDecision {
  // 1. Integridade da posse: precisa existir, estar ativa, ser do próprio perfil e do item certo.
  if (!ownership || ownership.revokedAt !== null) return deny('item_not_owned');
  if (ctx.profileTechnicalId === null || ownership.profileTechnicalId !== ctx.profileTechnicalId) {
    return deny('profile_mismatch');
  }
  if (ownership.itemKey !== item.itemKey) return deny('item_not_owned');

  // 2. Elegibilidade por disponibilidade (independente do portão de obtenção).
  switch (item.availability) {
    case 'standard':
      return allow();
    case 'vip':
      // Elegibilidade de cargo; posse por si só não basta.
      return roleAtLeast(ctx.role, 'vip') || hasAdminSession(ctx)
        ? allow()
        : deny('availability_denied');
    case 'exclusive': {
      // Dados de demonstração nunca são autoritativos, mesmo com autoridade permissiva.
      if (ownership.isDemo) return deny('demo_not_authoritative');
      // Autoridade SÓ via autoridade confiável — jamais a partir de `source`/`isDemo` locais.
      const verdict = authority
        ? authority.verify(ownership)
        : denyAllOwnershipAuthority(ownership);
      return verdict.authoritative ? allow() : deny('ownership_not_verified');
    }
  }
}
