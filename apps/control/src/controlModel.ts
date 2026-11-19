/**
 * Modelo de leitura do Control (B4.2).
 *
 * Toda informação exibida é derivada das fontes canônicas existentes:
 * - `@hattz/core` → catálogos de badges, molduras e coleções;
 * - `@hattz/permissions` → cargos, hierarquia, catálogo de benefícios e herança.
 *
 * Este arquivo NÃO concede nada, NÃO persiste nada e NÃO cria uma segunda fonte de verdade.
 * Rótulos abaixo são apenas apresentação (pt-BR); regras de herança e disponibilidade continuam
 * centralizadas nos pacotes de domínio.
 */

import {
  AVAILABILITY_LABELS,
  BADGE_CATALOG,
  COLLECTION_CATALOG,
  FRAME_CATALOG,
  type BadgeDefinition,
  type CollectionDefinition,
  type CollectionStatus,
  type FrameDefinition,
  type FramePermanence,
} from '@hattz/core';
import {
  BENEFITS_CATALOG,
  ROLE_BENEFIT_GRANTS,
  ROLE_DEFINITIONS,
  resolveInheritedRoleBenefits,
  resolveRoleBenefits,
  type BenefitDefinition,
  type BenefitKey,
  type BenefitType,
  type RoleDefinition,
  type RoleKey,
} from '@hattz/permissions';

/* ------------------------------------------------------------------ */
/* Rótulos de apresentação (não são regras de domínio)                 */
/* ------------------------------------------------------------------ */

const CATEGORY_LABELS: Readonly<Partial<Record<string, string>>> = {
  general: 'Geral',
  profile: 'Perfil',
  event: 'Evento',
  collection: 'Coleção',
  community: 'Comunidade',
};

const PERMANENCE_LABELS: Readonly<Record<FramePermanence, string>> = {
  permanent: 'Permanente',
  temporary: 'Temporária',
  limited: 'Limitada',
  event: 'Evento',
};

const BENEFIT_TYPE_LABELS: Readonly<Record<BenefitType, string>> = {
  feature: 'Recurso',
  cosmetic: 'Cosmético',
  limit: 'Limite',
  access: 'Acesso',
  other: 'Outro',
};

const COLLECTION_STATUS_LABELS: Readonly<Record<CollectionStatus, string>> = {
  draft: 'Rascunho',
  active: 'Ativa',
  closed: 'Encerrada',
  archived: 'Arquivada',
};

function categoryLabel(value: string): string {
  return CATEGORY_LABELS[value] ?? value;
}

function capitalized(value: string): string {
  return value.length === 0 ? value : value[0]!.toUpperCase() + value.slice(1);
}

/* ------------------------------------------------------------------ */
/* Tipos de visão                                                     */
/* ------------------------------------------------------------------ */

export interface ControlBadgeView {
  key: string;
  name: string;
  description: string;
  category: string;
  rarity: string;
  availability: string;
  isSpecial: boolean;
  isDemo: boolean;
}

export interface ControlFrameView {
  key: string;
  name: string;
  description: string;
  category: string;
  rarity: string;
  availability: string;
  permanence: string;
  animation: string;
  isDemo: boolean;
}

export interface ControlBenefitRef {
  key: BenefitKey;
  name: string;
}

export interface ControlRoleRef {
  key: RoleKey;
  name: string;
}

export interface ControlRoleView {
  key: RoleKey;
  name: string;
  description: string;
  hierarchy: number;
  isPrivate: boolean;
  requiresGrant: boolean;
  isSystem: boolean;
  /** Benefícios concedidos diretamente pelo cargo (sem herança). */
  ownBenefits: readonly ControlBenefitRef[];
  /** Benefícios recebidos apenas por herança de hierarquia. */
  inheritedBenefits: readonly ControlBenefitRef[];
}

export interface ControlBenefitView {
  key: BenefitKey;
  name: string;
  description: string;
  typeLabel: string;
  isExclusive: boolean;
  /** Cargos que concedem o benefício diretamente. */
  directRoles: readonly ControlRoleRef[];
  /** Cargos que o recebem por herança, sem concessão própria. */
  inheritedRoles: readonly ControlRoleRef[];
}

export interface ControlCollectionView {
  key: string;
  name: string;
  description: string;
  statusLabel: string;
  itemCount: number;
  isDemo: boolean;
}

export interface ControlOverview {
  badges: number;
  frames: number;
  categories: number;
  rarities: number;
  roles: number;
  benefits: number;
  collections: number;
}

export interface ControlSnapshot {
  overview: ControlOverview;
  badges: readonly ControlBadgeView[];
  frames: readonly ControlFrameView[];
  roles: readonly ControlRoleView[];
  benefits: readonly ControlBenefitView[];
  /** Benefícios próprios do VIP, conforme `ROLE_BENEFIT_GRANTS`. */
  vipBenefits: readonly ControlBenefitRef[];
  collections: readonly ControlCollectionView[];
}

/**
 * Entrada opcional para testes de empty state. Por padrão, os arrays reais dos pacotes são usados;
 * nenhum número ou item é inventado pela interface.
 */
export interface ControlCatalogInput {
  badges?: readonly BadgeDefinition[];
  frames?: readonly FrameDefinition[];
  collections?: readonly CollectionDefinition[];
  roles?: readonly RoleDefinition[];
  benefits?: readonly BenefitDefinition[];
}

function benefitRef(key: BenefitKey, benefits: readonly BenefitDefinition[]): ControlBenefitRef {
  return { key, name: benefits.find((item) => item.key === key)?.name ?? key };
}

function roleRef(key: RoleKey, roles: readonly RoleDefinition[]): ControlRoleRef {
  return { key, name: roles.find((role) => role.key === key)?.name ?? key };
}

export function buildControlSnapshot(input: ControlCatalogInput = {}): ControlSnapshot {
  const badges = input.badges ?? BADGE_CATALOG;
  const frames = input.frames ?? FRAME_CATALOG;
  const collections = input.collections ?? COLLECTION_CATALOG;
  const roles = input.roles ?? ROLE_DEFINITIONS;
  const benefits = input.benefits ?? BENEFITS_CATALOG;

  const categories = new Set<string>();
  const rarities = new Set<string>();
  for (const item of [...badges, ...frames]) {
    categories.add(item.category);
    rarities.add(item.rarity);
  }

  const roleViews: ControlRoleView[] = roles.map((role) => {
    const direct = resolveRoleBenefits(role.key);
    const inherited = resolveInheritedRoleBenefits(role.key);
    return {
      key: role.key,
      name: role.name,
      description: role.description,
      hierarchy: role.hierarchy,
      isPrivate: role.isPrivate,
      requiresGrant: role.requiresGrant,
      isSystem: role.isSystem,
      ownBenefits: direct.map((key) => benefitRef(key, benefits)),
      // Herança não é duplicada como concessão independente.
      inheritedBenefits: inherited
        .filter((key) => !direct.includes(key))
        .map((key) => benefitRef(key, benefits)),
    };
  });

  const benefitViews: ControlBenefitView[] = benefits.map((benefit) => {
    const directRoles = roles.filter((role) => ROLE_BENEFIT_GRANTS[role.key].includes(benefit.key));
    const inheritedRoles = roles.filter(
      (role) =>
        !ROLE_BENEFIT_GRANTS[role.key].includes(benefit.key) &&
        resolveInheritedRoleBenefits(role.key).includes(benefit.key),
    );
    return {
      key: benefit.key,
      name: benefit.name,
      description: benefit.description,
      typeLabel: BENEFIT_TYPE_LABELS[benefit.benefitType],
      isExclusive: benefit.isExclusive,
      directRoles: directRoles.map((role) => roleRef(role.key, roles)),
      inheritedRoles: inheritedRoles.map((role) => roleRef(role.key, roles)),
    };
  });

  return {
    overview: {
      badges: badges.length,
      frames: frames.length,
      categories: categories.size,
      rarities: rarities.size,
      roles: roles.length,
      benefits: benefits.length,
      collections: collections.length,
    },
    badges: badges.map((badge: BadgeDefinition) => ({
      key: badge.badgeKey,
      name: badge.name,
      description: badge.description,
      category: categoryLabel(badge.category),
      rarity: capitalized(badge.rarity),
      availability: AVAILABILITY_LABELS[badge.availability],
      isSpecial: badge.isSpecial,
      isDemo: badge.isDemo,
    })),
    frames: frames.map((frame: FrameDefinition) => ({
      key: frame.frameKey,
      name: frame.name,
      description: frame.description,
      category: categoryLabel(frame.category),
      rarity: capitalized(frame.rarity),
      availability: AVAILABILITY_LABELS[frame.availability],
      permanence: PERMANENCE_LABELS[frame.permanence],
      animation: frame.isAnimated ? 'Animada' : 'Estática',
      isDemo: frame.isDemo,
    })),
    roles: roleViews,
    benefits: benefitViews,
    vipBenefits: resolveRoleBenefits('vip').map((key) => benefitRef(key, benefits)),
    collections: collections.map((collection) => ({
      key: collection.collectionKey,
      name: collection.name,
      description: collection.description,
      statusLabel: COLLECTION_STATUS_LABELS[collection.status],
      itemCount: collection.items.length,
      isDemo: collection.isDemo,
    })),
  };
}
