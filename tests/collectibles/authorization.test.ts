import { describe, expect, it } from 'vitest';
import { createTrustedOwnershipAuthority } from '@hattz/local-store/testing';
import {
  AdminAuthorizationError,
  assertAdminSession,
  canAccessAvailability,
  canAssignRole,
  canEquipItem,
  canGrantBenefit,
  canPublishBadge,
  canRevokeRole,
  canSelectRole,
  hasAdminSession,
  resolveContextBenefits,
  type AuthorizationContext,
} from '@hattz/permissions';

function context(
  role: AuthorizationContext['role'],
  profileTechnicalId: string | null = 'prof_1',
): AuthorizationContext {
  return { role, profileTechnicalId, adminSession: null };
}

describe('motor de autorização (fail-closed)', () => {
  it('nega sessão administrativa no ambiente local, mesmo com cargo público Owner', () => {
    const owner = context('owner');
    expect(hasAdminSession(owner)).toBe(false);
    expect(() => assertAdminSession(owner)).toThrow(AdminAuthorizationError);
    expect(() => assertAdminSession(context(null))).toThrow(AdminAuthorizationError);
  });

  it('recusa mutações administrativas sem contexto autorizado', () => {
    const owner = context('owner');
    expect(canPublishBadge(owner)).toEqual({
      allowed: false,
      reason: 'badge_publication_forbidden',
    });
    expect(canGrantBenefit(owner, 'admin.control_access')).toEqual({
      allowed: false,
      reason: 'benefit_grant_forbidden',
    });
    expect(canRevokeRole(owner, 'member')).toEqual({
      allowed: false,
      reason: 'role_revoke_forbidden',
    });
  });

  it('impede seleção/atribuição de cargos privados (e de cargos que exigem concessão)', () => {
    const ctx = context('member');
    expect(canSelectRole(ctx, 'member').allowed).toBe(true);
    expect(canSelectRole(ctx, 'owner').allowed).toBe(false);
    expect(canSelectRole(ctx, 'owner').reason).toBe('role_not_selectable');
    expect(canSelectRole(ctx, 'creator').allowed).toBe(false);

    expect(canAssignRole(ctx, 'member').allowed).toBe(true);
    expect(canAssignRole(ctx, 'vip').allowed).toBe(false);
    expect(canAssignRole(ctx, 'owner').allowed).toBe(false);
    expect(canAssignRole(ctx, 'owner').reason).toBe('role_not_selectable');
  });

  it('separa disponibilidade de posse no acesso', () => {
    expect(canAccessAvailability(context('member'), 'standard').allowed).toBe(true);
    expect(canAccessAvailability(context('member'), 'vip').allowed).toBe(false);
    expect(canAccessAvailability(context('vip'), 'vip').allowed).toBe(true);
    // Exclusivo exige autoridade administrativa, que não existe localmente.
    expect(canAccessAvailability(context('owner'), 'exclusive').allowed).toBe(false);
  });

  it('não permite equipar item não possuído nem de outro perfil', () => {
    const ctx = context('member');
    const item = {
      itemType: 'badge' as const,
      itemKey: 'early-member',
      availability: 'standard' as const,
    };

    expect(canEquipItem(ctx, item, null)).toEqual({ allowed: false, reason: 'item_not_owned' });
    expect(
      canEquipItem(ctx, item, {
        profileTechnicalId: 'prof_2',
        itemKey: 'early-member',
        source: 'automatic',
        revokedAt: null,
        isDemo: false,
        authorityProof: null,
      }),
    ).toEqual({ allowed: false, reason: 'profile_mismatch' });
    expect(
      canEquipItem(ctx, item, {
        profileTechnicalId: 'prof_1',
        itemKey: 'early-member',
        source: 'automatic',
        revokedAt: Date.now(),
        isDemo: false,
        authorityProof: null,
      }),
    ).toEqual({ allowed: false, reason: 'item_not_owned' });
    expect(
      canEquipItem(ctx, item, {
        profileTechnicalId: 'prof_1',
        itemKey: 'early-member',
        source: 'automatic',
        revokedAt: null,
        isDemo: false,
        authorityProof: null,
      }),
    ).toEqual({ allowed: true, reason: null });
  });

  it('não trata dados locais como autoridade: Exclusivo forjado localmente é negado', () => {
    const ctx = context('member');
    const exclusive = {
      itemType: 'badge' as const,
      itemKey: 'founder',
      availability: 'exclusive' as const,
    };

    // Sem posse: negado (o portão de obtenção segue fechado localmente).
    expect(canEquipItem(ctx, exclusive, null)).toEqual({
      allowed: false,
      reason: 'item_not_owned',
    });
    // Obtenção (novas concessões) segue negada sem sessão administrativa local.
    expect(canAccessAvailability(ctx, 'exclusive')).toEqual({
      allowed: false,
      reason: 'availability_denied',
    });
    // Registro FABRICADO localmente (source manual, isDemo false, sem prova): NÃO autoritativo.
    // O verificador padrão é fail-closed — `source` NUNCA concede autoridade.
    expect(
      canEquipItem(ctx, exclusive, {
        profileTechnicalId: 'prof_1',
        itemKey: 'founder',
        source: 'manual',
        revokedAt: null,
        isDemo: false,
        authorityProof: null,
      }),
    ).toEqual({ allowed: false, reason: 'ownership_not_verified' });
    // Mesmo com `system_test` forjado, continua não autoritativo.
    expect(
      canEquipItem(ctx, exclusive, {
        profileTechnicalId: 'prof_1',
        itemKey: 'founder',
        source: 'system_test',
        revokedAt: null,
        isDemo: false,
        authorityProof: null,
      }),
    ).toEqual({ allowed: false, reason: 'ownership_not_verified' });
    // Posse de DEMONSTRAÇÃO nunca é tratada como concessão administrativa real.
    expect(
      canEquipItem(ctx, exclusive, {
        profileTechnicalId: 'prof_1',
        itemKey: 'founder',
        source: 'automatic',
        revokedAt: null,
        isDemo: true,
        authorityProof: null,
      }),
    ).toEqual({ allowed: false, reason: 'demo_not_authoritative' });
  });

  it('equipa Exclusivo apenas quando um verificador confiável atesta a posse', () => {
    const ctx = context('member');
    const exclusive = {
      itemType: 'badge' as const,
      itemKey: 'founder',
      availability: 'exclusive' as const,
    };
    const ownership = {
      profileTechnicalId: 'prof_1',
      itemKey: 'founder',
      source: 'manual' as const,
      revokedAt: null,
      isDemo: false,
      authorityProof: 'simulated-trusted-proof',
    };
    // Autoridade confiável simulada, criada pela fábrica INTERNA (fora da API pública). Representa a
    // futura fonte confiável (código, não dado) e só existe no harness de testes.
    const simulatedTrustedAuthority = createTrustedOwnershipAuthority((candidate) =>
      candidate.authorityProof === 'simulated-trusted-proof'
        ? { authoritative: true, reason: null }
        : { authoritative: false, reason: 'no_trusted_authority' },
    );

    // Sem autoridade confiável (produção local): negado.
    expect(canEquipItem(ctx, exclusive, ownership)).toEqual({
      allowed: false,
      reason: 'ownership_not_verified',
    });
    // Com a autoridade confiável: permitido.
    expect(canEquipItem(ctx, exclusive, ownership, simulatedTrustedAuthority)).toEqual({
      allowed: true,
      reason: null,
    });
  });

  it('exige elegibilidade de cargo para equipar item VIP (posse não basta)', () => {
    const vipItem = {
      itemType: 'badge' as const,
      itemKey: 'vip-supporter',
      availability: 'vip' as const,
    };
    const ownership = {
      profileTechnicalId: 'prof_1',
      itemKey: 'vip-supporter',
      source: 'role' as const,
      revokedAt: null,
      isDemo: false,
      authorityProof: null,
    };
    expect(canEquipItem(context('member'), vipItem, ownership)).toEqual({
      allowed: false,
      reason: 'availability_denied',
    });
    expect(canEquipItem(context('vip'), vipItem, ownership)).toEqual({
      allowed: true,
      reason: null,
    });
  });

  it('equipa item Padrão com posse válida', () => {
    expect(
      canEquipItem(
        context('member'),
        { itemType: 'frame', itemKey: 'default', availability: 'standard' },
        {
          profileTechnicalId: 'prof_1',
          itemKey: 'default',
          source: 'automatic',
          revokedAt: null,
          isDemo: false,
          authorityProof: null,
        },
      ),
    ).toEqual({ allowed: true, reason: null });
  });

  it('não eleva privilégios por dados do perfil', () => {
    // Cargo público Owner + benefícios herdados NÃO incluem acesso administrativo.
    const owner = context('owner');
    expect(resolveContextBenefits(owner)).not.toContain('admin.control_access');
    expect(hasAdminSession(owner)).toBe(false);
    expect(canPublishBadge(owner).allowed).toBe(false);
  });
});
