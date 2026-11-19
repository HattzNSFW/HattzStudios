import { describe, expect, it } from 'vitest';
import {
  BENEFITS_CATALOG,
  ROLE_BENEFIT_GRANTS,
  ROLE_DEFINITIONS,
  getRoleDefinition,
  isPrivateRole,
  isRoleFreelySelectable,
  resolveInheritedRoleBenefits,
  resolveRoleBenefits,
  rolesUpTo,
  selectableRoles,
} from '@hattz/permissions';

describe('cargos e benefícios', () => {
  it('modela Membro, VIP, Owner e Creator', () => {
    const keys = ROLE_DEFINITIONS.map((role) => role.key);
    expect(keys).toEqual(['member', 'vip', 'creator', 'owner']);
    expect(getRoleDefinition('vip')?.name).toBe('VIP');
    expect(getRoleDefinition('member')?.name).toBe('Membro');
  });

  it('marca Owner e Creator como privados e impede seleção livre', () => {
    expect(isPrivateRole('owner')).toBe(true);
    expect(isPrivateRole('creator')).toBe(true);
    expect(isPrivateRole('member')).toBe(false);
    expect(isPrivateRole('vip')).toBe(false);

    expect(isRoleFreelySelectable('owner')).toBe(false);
    expect(isRoleFreelySelectable('creator')).toBe(false);
    expect(isRoleFreelySelectable('vip')).toBe(false);
    expect(isRoleFreelySelectable('member')).toBe(true);

    expect(selectableRoles().map((role) => role.key)).toEqual(['member']);
  });

  it('VIP herda benefícios de níveis inferiores e acrescenta os próprios', () => {
    const memberBenefits = resolveInheritedRoleBenefits('member');
    const vipInherited = resolveInheritedRoleBenefits('vip');

    // Herda o que o Membro tem.
    for (const benefit of memberBenefits) {
      expect(vipInherited).toContain(benefit);
    }
    // Acrescenta os próprios.
    for (const benefit of resolveRoleBenefits('vip')) {
      expect(vipInherited).toContain(benefit);
    }
    // Membro NÃO recebe benefícios exclusivos do VIP (independência).
    expect(memberBenefits).not.toContain('profile.vip_frame');
    expect(memberBenefits).not.toContain('gallery.expanded_limit');
  });

  it('mantém o catálogo de benefícios independente do sistema de cargos', () => {
    const catalogKeys = BENEFITS_CATALOG.map((benefit) => benefit.key);
    expect(catalogKeys).toContain('admin.control_access');
    // O acesso administrativo existe no catálogo, mas não é concedido por NENHUM cargo.
    const allGrants = Object.values(ROLE_BENEFIT_GRANTS).flat();
    expect(allGrants).not.toContain('admin.control_access');
    expect(resolveInheritedRoleBenefits('owner')).not.toContain('admin.control_access');
  });

  it('resolve a hierarquia de cargos em ordem crescente', () => {
    expect(rolesUpTo('vip').map((role) => role.key)).toEqual(['member', 'vip']);
    expect(rolesUpTo('owner').map((role) => role.key)).toEqual([
      'member',
      'vip',
      'creator',
      'owner',
    ]);
  });
});
