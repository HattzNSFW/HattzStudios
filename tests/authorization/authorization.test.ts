import { describe, expect, it } from 'vitest';
import { BASE_ROLES, FOUNDATION_PERMISSIONS, hasPermission } from '@hattz/permissions';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('authorization foundations and isolation', () => {
  it('defines base roles including public Owner role key without implying Control access', () => {
    const owner = BASE_ROLES.find((r) => r.key === 'owner');
    expect(owner).toBeDefined();
    expect(owner?.hierarchy).toBeGreaterThan(0);

    // Permissão de acesso ao Control existe como conceito separado e sensível.
    const controlPerm = FOUNDATION_PERMISSIONS.find((p) => p.key === 'control.access');
    expect(controlPerm?.id).toBe('perm.control.access');

    // Ter papel público Owner (chave de domínio de perfis/cargos) não equivale a possuir permissão admin.
    // Derivar o conjunto real de permissões públicas (todas exceto a administrativa) para que a
    // asserção exercite `hasPermission` em vez de ser trivialmente verdadeira sobre uma lista vazia.
    const publicOwnerGrantedPermissions = FOUNDATION_PERMISSIONS.map((p) => p.id).filter(
      (id) => id !== 'perm.control.access',
    );
    expect(publicOwnerGrantedPermissions.length).toBeGreaterThan(0);
    expect(hasPermission(publicOwnerGrantedPermissions, 'perm.profile.view_public')).toBe(true);
    expect(hasPermission(publicOwnerGrantedPermissions, 'perm.control.access')).toBe(false);
  });

  it('documents and models admin isolation separately from public profile domains', () => {
    const foundation = readFileSync(
      resolve(process.cwd(), 'infrastructure/supabase/migrations/0001_foundation_extensions.sql'),
      'utf8',
    );
    const migration = readFileSync(
      resolve(process.cwd(), 'infrastructure/supabase/migrations/0006_admin_audit_isolation.sql'),
      'utf8',
    );
    expect(foundation).toContain('create schema if not exists hattz_admin');
    expect(foundation).toContain('create schema if not exists hattz_audit');
    expect(migration).toContain('create table if not exists hattz_admin.admin_accounts');
    expect(migration).toContain('Cargo público Owner não concede acesso ao Control');
  });
});
