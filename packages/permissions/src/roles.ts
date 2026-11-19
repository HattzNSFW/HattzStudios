/**
 * Cargos (roles) e hierarquia.
 *
 * Cargos públicos (Membro, VIP) descrevem o perfil. Cargos privados (Creator, Owner) não podem ser
 * selecionados livremente por usuários.
 *
 * IMPORTANTE: o cargo público `owner` NÃO concede acesso administrativo ao Control. A autoridade
 * administrativa é um domínio separado (`./authorization`), indisponível no ambiente local.
 *
 * A modelagem é extensível: novos cargos são adicionados à lista ordenada por `hierarchy` sem
 * reescrever o motor de autorização.
 */

export const ROLE_KEYS = ['member', 'vip', 'creator', 'owner'] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];

export interface RoleDefinition {
  key: RoleKey;
  name: string;
  description: string;
  /** Ordem hierárquica; maior = mais alto. Usada pela herança de benefícios. */
  hierarchy: number;
  /** Cargo privado: nunca selecionável livremente por um usuário. */
  isPrivate: boolean;
  /** Exige concessão (não é escolhido livremente); inclui VIP e cargos privados. */
  requiresGrant: boolean;
  isSystem: boolean;
}

export const ROLE_DEFINITIONS: readonly RoleDefinition[] = [
  {
    key: 'member',
    name: 'Membro',
    description: 'Cargo público padrão.',
    hierarchy: 10,
    isPrivate: false,
    requiresGrant: false,
    isSystem: true,
  },
  {
    key: 'vip',
    name: 'VIP',
    description: 'Cargo público VIP, concedido (não auto-selecionável).',
    hierarchy: 20,
    isPrivate: false,
    requiresGrant: true,
    isSystem: true,
  },
  {
    key: 'creator',
    name: 'Creator',
    description: 'Cargo privado de criador de conteúdo.',
    hierarchy: 50,
    isPrivate: true,
    requiresGrant: true,
    isSystem: true,
  },
  {
    key: 'owner',
    name: 'Owner',
    description: 'Cargo público Owner (não concede acesso administrativo ao Control).',
    hierarchy: 100,
    isPrivate: true,
    requiresGrant: true,
    isSystem: true,
  },
];

/** Compatibilidade: base de cargos exposta historicamente. */
export const BASE_ROLES: readonly RoleDefinition[] = ROLE_DEFINITIONS;

export function getRoleDefinition(key: RoleKey): RoleDefinition | null {
  return ROLE_DEFINITIONS.find((role) => role.key === key) ?? null;
}

export function roleHierarchy(key: RoleKey): number {
  return getRoleDefinition(key)?.hierarchy ?? 0;
}

/** Um cargo privado nunca pode ser selecionado livremente. */
export function isPrivateRole(key: RoleKey): boolean {
  return getRoleDefinition(key)?.isPrivate ?? true;
}

/** Um cargo é livremente selecionável apenas quando é público e não exige concessão. */
export function isRoleFreelySelectable(key: RoleKey): boolean {
  const role = getRoleDefinition(key);
  if (!role) return false;
  return !role.isPrivate && !role.requiresGrant;
}

/** Cargos que um usuário pode escolher por conta própria. */
export function selectableRoles(): readonly RoleDefinition[] {
  return ROLE_DEFINITIONS.filter((role) => isRoleFreelySelectable(role.key));
}

/** Cargos com hierarquia menor ou igual à do cargo informado, em ordem crescente. */
export function rolesUpTo(key: RoleKey): readonly RoleDefinition[] {
  const target = roleHierarchy(key);
  return ROLE_DEFINITIONS.filter((role) => role.hierarchy <= target).sort(
    (a, b) => a.hierarchy - b.hierarchy,
  );
}
