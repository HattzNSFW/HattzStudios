/**
 * Catálogo de benefícios e sua relação com os cargos.
 *
 * O catálogo de benefícios é INDEPENDENTE do sistema de cargos: `BENEFITS_CATALOG` descreve o que
 * um benefício é; `ROLE_BENEFIT_GRANTS` diz quais cargos o concedem. Adicionar um cargo ou um
 * benefício novo não exige reescrever a resolução.
 *
 * Herança: um cargo de maior hierarquia herda os benefícios dos cargos de hierarquia menor e
 * acrescenta os seus. A resolução é pura e centralizada aqui.
 *
 * Nenhum cargo público concede acesso administrativo (`admin.control_access` não é atribuído a
 * cargo algum).
 */

import { rolesUpTo, type RoleKey } from './roles';

export const BENEFIT_KEYS = [
  'profile.basic',
  'profile.vip_frame',
  'badge.vip_supporter',
  'gallery.expanded_limit',
  'studio.advanced_blocks',
  'admin.control_access',
] as const;
export type BenefitKey = (typeof BENEFIT_KEYS)[number];

export type BenefitType = 'feature' | 'cosmetic' | 'limit' | 'access' | 'other';

export interface BenefitDefinition {
  key: BenefitKey;
  name: string;
  description: string;
  benefitType: BenefitType;
  /** Benefício exclusivo (ex.: acesso administrativo), nunca herdado por cargo público. */
  isExclusive: boolean;
}

export const BENEFITS_CATALOG: readonly BenefitDefinition[] = [
  {
    key: 'profile.basic',
    name: 'Perfil básico',
    description: 'Recursos básicos de perfil.',
    benefitType: 'feature',
    isExclusive: false,
  },
  {
    key: 'profile.vip_frame',
    name: 'Moldura VIP',
    description: 'Moldura exclusiva do nível VIP.',
    benefitType: 'cosmetic',
    isExclusive: false,
  },
  {
    key: 'badge.vip_supporter',
    name: 'Badge Apoiador VIP',
    description: 'Badge do nível VIP.',
    benefitType: 'cosmetic',
    isExclusive: false,
  },
  {
    key: 'gallery.expanded_limit',
    name: 'Galeria ampliada',
    description: 'Limite ampliado de itens na galeria.',
    benefitType: 'limit',
    isExclusive: false,
  },
  {
    key: 'studio.advanced_blocks',
    name: 'Blocos avançados do Studio',
    description: 'Acesso a blocos avançados no Studio.',
    benefitType: 'feature',
    isExclusive: false,
  },
  {
    key: 'admin.control_access',
    name: 'Acesso administrativo ao Control',
    description: 'Acesso ao Control. Domínio administrativo separado; não concedido por cargos.',
    benefitType: 'access',
    isExclusive: true,
  },
];

/**
 * Concessões diretas de benefícios por cargo. Independente do catálogo.
 * `admin.control_access` é intencionalmente ausente de todos os cargos.
 */
export const ROLE_BENEFIT_GRANTS: Readonly<Record<RoleKey, readonly BenefitKey[]>> = {
  member: ['profile.basic'],
  vip: ['profile.vip_frame', 'badge.vip_supporter', 'gallery.expanded_limit'],
  creator: ['studio.advanced_blocks'],
  owner: [],
};

export function getBenefitDefinition(key: BenefitKey): BenefitDefinition | null {
  return BENEFITS_CATALOG.find((benefit) => benefit.key === key) ?? null;
}

/** Benefícios concedidos DIRETAMENTE por um cargo (sem herança). */
export function resolveRoleBenefits(role: RoleKey): readonly BenefitKey[] {
  return ROLE_BENEFIT_GRANTS[role];
}

/**
 * Benefícios efetivos de um cargo: união dos benefícios de todos os cargos de hierarquia menor ou
 * igual (herança), sem duplicatas e em ordem estável.
 */
export function resolveInheritedRoleBenefits(role: RoleKey): readonly BenefitKey[] {
  const result = new Set<BenefitKey>();
  for (const definition of rolesUpTo(role)) {
    for (const benefit of ROLE_BENEFIT_GRANTS[definition.key]) {
      result.add(benefit);
    }
  }
  return [...result];
}

/** Benefícios efetivos do cargo somados a concessões individuais explícitas (futuras). */
export function resolveBenefits(
  role: RoleKey,
  individualGrants: readonly BenefitKey[] = [],
): readonly BenefitKey[] {
  const result = new Set<BenefitKey>(resolveInheritedRoleBenefits(role));
  for (const benefit of individualGrants) {
    result.add(benefit);
  }
  return [...result];
}
