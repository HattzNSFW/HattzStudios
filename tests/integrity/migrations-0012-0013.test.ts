import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
function migration(name: string): string {
  return readFileSync(resolve(root, 'infrastructure/supabase/migrations', name), 'utf8');
}

describe('migrations 0012/0013 — auditoria estrutural offline (sem banco)', () => {
  it('0012 concede ao service_role somente colunas mínimas das duas tabelas writer', () => {
    const sql = migration('0012_trusted_writer_grants.sql');

    expect(sql).toContain("if not exists (select 1 from pg_roles where rolname = 'service_role')");
    expect(sql).toContain('return;');
    expect(sql).toContain('grant usage on schema public to service_role');
    expect(sql).toContain('on public.profile_publications to service_role');
    expect(sql).toContain('on public.profile_public_snapshots to service_role');
    expect(sql).toContain('grant delete on public.profile_publications to service_role');
    expect(sql).toContain('grant delete on public.profile_public_snapshots to service_role');
    expect(sql).toContain(
      'update (profile_id, version, state, manifest_hash, manifest_ref, published_at, unpublished_at, failure_reason, is_publicly_visible)',
    );

    // Nenhuma elevação de privilégio no SQL executável (comentários documentam exatamente o oposto).
    const executable = sql.replace(/--.*$/gm, '');
    expect(executable).not.toMatch(/security\s+definer/i);
    expect(executable).not.toMatch(/bypassrls/i);
    expect(executable).not.toMatch(/superuser/i);
    expect(executable).not.toMatch(/grant\s+all/i);
    expect(executable).not.toMatch(/to\s+(public|anon|authenticated)\s*;/i);
  });

  it('0013 cria índice único parcial para um slug atual por perfil, sem tocar em segurança', () => {
    const sql = migration('0013_slug_current_per_profile.sql');

    expect(sql).toContain('create unique index if not exists ux_profile_slugs_current_per_profile');
    expect(sql).toContain('on public.profile_slugs (profile_id)');
    expect(sql).toContain('where is_current = true');
    expect(sql).toContain('having count(*) > 1');
    expect(sql).toContain('raise exception');

    expect(sql).not.toMatch(/alter\s+table\s+public\.profiles/i);
    expect(sql).not.toMatch(/create\s+policy/i);
    expect(sql).not.toMatch(/grant\s+/i);
    expect(sql).not.toMatch(/revoke\s+/i);
  });

  it('não existem lacunas na numeração das migrations Versionadas 0001–0013', () => {
    const names = [
      '0001_foundation_extensions.sql',
      '0002_profiles_and_publications.sql',
      '0003_media_storage.sql',
      '0004_roles_permissions_benefits.sql',
      '0005_collectibles_collections.sql',
      '0006_admin_audit_isolation.sql',
      '0007_settings_sync_monitoring.sql',
      '0008_rls_policies.sql',
      '0009_hardening_public_views_and_snapshot_validation.sql',
      '0010_public_read_visibility_fix.sql',
      '0011_snapshot_publication_identity_integrity.sql',
      '0012_trusted_writer_grants.sql',
      '0013_slug_current_per_profile.sql',
    ];
    for (const name of names) expect(() => migration(name)).not.toThrow();
  });
});
