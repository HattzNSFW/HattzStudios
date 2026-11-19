import { describe, expect, it } from 'vitest';
import { AVAILABILITY_LABELS, BADGE_CATALOG, COLLECTION_CATALOG, FRAME_CATALOG } from '@hattz/core';
import {
  BENEFITS_CATALOG,
  ROLE_DEFINITIONS,
  resolveInheritedRoleBenefits,
  resolveRoleBenefits,
} from '@hattz/permissions';
import { buildControlSnapshot } from '../../apps/control/src/controlModel';

describe('modelo de consulta do Control (B4.2)', () => {
  it('deriva a visão geral dos catálogos reais, sem números inventados', () => {
    const snapshot = buildControlSnapshot();
    const expectedCategories = new Set([...BADGE_CATALOG, ...FRAME_CATALOG].map((i) => i.category));
    const expectedRarities = new Set([...BADGE_CATALOG, ...FRAME_CATALOG].map((i) => i.rarity));

    expect(snapshot.overview).toEqual({
      badges: BADGE_CATALOG.length,
      frames: FRAME_CATALOG.length,
      categories: expectedCategories.size,
      rarities: expectedRarities.size,
      roles: ROLE_DEFINITIONS.length,
      benefits: BENEFITS_CATALOG.length,
      collections: COLLECTION_CATALOG.length,
    });
    expect(snapshot.overview.badges).toBeGreaterThan(0);
    expect(snapshot.overview.frames).toBeGreaterThan(0);
  });

  it('apresenta badges com categoria, raridade, disponibilidade e estado de demonstração do catálogo', () => {
    const snapshot = buildControlSnapshot();
    const byKey = new Map(snapshot.badges.map((badge) => [badge.key, badge]));

    expect(byKey.get('early-member')).toMatchObject({
      name: 'Membro Inicial',
      category: 'Perfil',
      availability: AVAILABILITY_LABELS.standard,
      isSpecial: false,
      isDemo: false,
    });
    expect(byKey.get('vip-supporter')?.availability).toBe(AVAILABILITY_LABELS.vip);
    expect(byKey.get('founder')).toMatchObject({
      availability: AVAILABILITY_LABELS.exclusive,
      isSpecial: true,
      isDemo: false,
    });
    for (const badge of snapshot.badges) {
      expect(['Padrão', 'VIP', 'Exclusivo']).toContain(badge.availability);
    }
  });

  it('apresenta molduras cadastradas, inclusive características e ausência de arte declarada', () => {
    const snapshot = buildControlSnapshot();
    const byKey = new Map(snapshot.frames.map((frame) => [frame.key, frame]));

    expect(byKey.get('default')).toMatchObject({
      name: 'Moldura Padrão',
      availability: AVAILABILITY_LABELS.standard,
      permanence: 'Permanente',
      animation: 'Estática',
      isDemo: false,
    });
    expect(byKey.get('vip')?.availability).toBe(AVAILABILITY_LABELS.vip);
    expect(snapshot.frames).toHaveLength(FRAME_CATALOG.length);
  });

  it('respeita hierarquia, herança e separação de benefícios próprios dos contratos', () => {
    const snapshot = buildControlSnapshot();
    const roles = new Map(snapshot.roles.map((role) => [role.key, role]));

    expect(snapshot.roles.map((role) => role.key)).toEqual(
      ROLE_DEFINITIONS.map((role) => role.key),
    );
    expect(roles.get('owner')?.isPrivate).toBe(true);
    expect(roles.get('creator')?.isPrivate).toBe(true);
    expect(roles.get('member')?.isPrivate).toBe(false);

    for (const definition of ROLE_DEFINITIONS) {
      const role = roles.get(definition.key)!;
      const direct = resolveRoleBenefits(definition.key);
      const inherited = resolveInheritedRoleBenefits(definition.key);
      expect(role.hierarchy).toBe(definition.hierarchy);
      expect(role.ownBenefits.map((item) => item.key)).toEqual(direct);
      expect(role.inheritedBenefits.map((item) => item.key)).toEqual(
        inherited.filter((key) => !direct.includes(key)),
      );
    }

    expect(snapshot.vipBenefits.map((item) => item.key)).toEqual(resolveRoleBenefits('vip'));
  });

  it('mantém o catálogo de benefícios independente e sem concessão administrativa por cargo', () => {
    const snapshot = buildControlSnapshot();
    const admin = snapshot.benefits.find((benefit) => benefit.key === 'admin.control_access')!;

    expect(admin.directRoles).toEqual([]);
    expect(admin.inheritedRoles).toEqual([]);
    expect(admin.isExclusive).toBe(true);
    for (const role of snapshot.roles) {
      expect(role.ownBenefits.map((item) => item.key)).not.toContain('admin.control_access');
      expect(role.inheritedBenefits.map((item) => item.key)).not.toContain('admin.control_access');
    }

    const basic = snapshot.benefits.find((benefit) => benefit.key === 'profile.basic')!;
    expect(basic.directRoles.map((role) => role.key)).toEqual(['member']);
    expect(basic.inheritedRoles.map((role) => role.key)).toEqual(['vip', 'creator', 'owner']);
  });

  it('mantém o estado vazio honesto das coleções', () => {
    expect(COLLECTION_CATALOG).toHaveLength(0);
    const snapshot = buildControlSnapshot();
    expect(snapshot.collections).toEqual([]);
    expect(snapshot.overview.collections).toBe(0);
  });

  it('produz contagens zero quando catálogos vazios são fornecidos', () => {
    const empty = buildControlSnapshot({
      badges: [],
      frames: [],
      collections: [],
      roles: [],
      benefits: [],
    });

    expect(empty.overview).toEqual({
      badges: 0,
      frames: 0,
      categories: 0,
      rarities: 0,
      roles: 0,
      benefits: 0,
      collections: 0,
    });
    expect(empty.badges).toEqual([]);
    expect(empty.frames).toEqual([]);
    expect(empty.roles).toEqual([]);
    expect(empty.benefits).toEqual([]);
    expect(empty.collections).toEqual([]);
  });

  it('marca itens de demonstração como demonstração sem tratá-los como produção', () => {
    const original = BADGE_CATALOG[0]!;
    const snapshot = buildControlSnapshot({ badges: [{ ...original, isDemo: true }] });

    expect(snapshot.badges[0]?.isDemo).toBe(true);
    expect(snapshot.badges[0]?.key).toBe(original.badgeKey);
  });
});
