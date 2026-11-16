export type RoleKey = 'member' | 'vip' | 'owner';

export interface PermissionDefinition {
  id: string;
  key: string;
  category: string;
  description: string;
}

export const BASE_ROLES: ReadonlyArray<{ key: RoleKey; name: string; hierarchy: number }> = [
  { key: 'member', name: 'Member', hierarchy: 10 },
  { key: 'vip', name: 'VIP', hierarchy: 20 },
  { key: 'owner', name: 'Owner', hierarchy: 100 },
];

export const FOUNDATION_PERMISSIONS: readonly PermissionDefinition[] = [
  {
    id: 'perm.profile.view_public',
    key: 'profile.view_public',
    category: 'profiles',
    description: 'View published public profile content according to visibility rules.',
  },
  {
    id: 'perm.profile.edit_local',
    key: 'profile.edit_local',
    category: 'studio',
    description: 'Edit local draft profile content in Studio.',
  },
  {
    id: 'perm.control.access',
    key: 'control.access',
    category: 'control',
    description: 'Access administrative Control surfaces (requires isolated admin authorization).',
  },
] as const;

export function hasPermission(granted: readonly string[], permissionId: string): boolean {
  return granted.includes(permissionId);
}
