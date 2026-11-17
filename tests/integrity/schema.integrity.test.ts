import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();

function readMigration(name: string): string {
  return readFileSync(resolve(root, 'infrastructure/supabase/migrations', name), 'utf8');
}

describe('database schema integrity (migrations) — structural tests', () => {
  it('defines required domains and core tables', () => {
    const m2 = readMigration('0002_profiles_and_publications.sql');
    const m3 = readMigration('0003_media_storage.sql');
    const m4 = readMigration('0004_roles_permissions_benefits.sql');
    const m5 = readMigration('0005_collectibles_collections.sql');
    const m6 = readMigration('0006_admin_audit_isolation.sql');
    const m7 = readMigration('0007_settings_sync_monitoring.sql');

    for (const table of [
      'public.profiles',
      'public.profile_slugs',
      'public.profile_publications',
      'public.profile_public_snapshots',
    ]) {
      expect(m2).toContain(`create table if not exists ${table}`);
    }
    expect(m2).toContain('technical_id text not null unique');

    for (const table of [
      'public.media_assets',
      'public.media_variants',
      'public.profile_storage_usage',
    ]) {
      expect(m3).toContain(`create table if not exists ${table}`);
    }

    for (const table of [
      'public.roles',
      'public.permissions',
      'public.role_permissions',
      'public.user_role_assignments',
      'public.user_permission_overrides',
      'public.benefits_catalog',
      'public.role_benefits',
      'public.user_benefits',
    ]) {
      expect(m4).toContain(`create table if not exists ${table}`);
    }

    for (const table of [
      'public.badges_catalog',
      'public.frames_catalog',
      'public.collections',
      'public.collection_items',
      'public.user_badges',
      'public.user_frames',
      'public.user_collection_progress',
    ]) {
      expect(m5).toContain(`create table if not exists ${table}`);
    }

    for (const table of [
      'hattz_admin.admin_accounts',
      'hattz_admin.admin_credentials',
      'hattz_admin.admin_recovery_keys',
      'hattz_admin.admin_sessions',
      'hattz_admin.admin_access_logs',
      'hattz_audit.audit_logs',
    ]) {
      expect(m6).toContain(`create table if not exists ${table}`);
    }

    for (const table of [
      'public.global_settings',
      'public.settings_history',
      'public.feature_flags',
      'public.notifications',
      'public.sync_operations',
      'public.service_status_snapshots',
    ]) {
      expect(m7).toContain(`create table if not exists ${table}`);
    }
  });

  it('defines required enums and states', () => {
    const m1 = readMigration('0001_foundation_extensions.sql');
    expect(m1).toContain('create type public.publication_state');
    expect(m1).toContain('create type public.sync_state');
    expect(m1).toContain('create type public.collectible_rarity');
    expect(m1).toContain("'comum'");
    expect(m1).toContain("'especial'");
  });

  it('hardens foundation function and defines public read/security validation objects (0001,0008,0009)', () => {
    const m1 = readMigration('0001_foundation_extensions.sql');
    const m8 = readMigration('0008_rls_policies.sql');
    const m9 = readMigration('0009_hardening_public_views_and_snapshot_validation.sql');

    expect(m1).toContain('set search_path = pg_catalog, public');
    expect(m1).toMatch(/revoke all on function public\.set_updated_at\(\) from public/);

    expect(m8).toContain('force row level security');
    expect(m8).toContain(
      'grant select (publication_id, profile_id, version, visibility, seo_title, seo_description, content)',
    );
    expect(m8).toContain('create policy share_select_public_snapshots');
    expect(m8).toContain('public.profiles: sem grant e sem policy pública');

    expect(m9).toContain('create or replace view public.v_share_published_profiles');
    expect(m9).toContain('create or replace view public.v_share_public_media');
    expect(m9).toContain('security_invoker = true, security_barrier = true');
    expect(m9).toContain('create or replace function public.validate_publishable_snapshot_content');
    expect(m9).toContain('trg_validate_publishable_snapshot');
  });

  it('enforces snapshot referential integrity for OG media with history-preserving delete behavior', () => {
    const m2 = readMigration('0002_profiles_and_publications.sql');
    const m3 = readMigration('0003_media_storage.sql');
    expect(m2).toContain(
      'og_image_asset_id uuid references public.media_assets(id) on delete set null',
    );
    expect(m3).toContain('add constraint profile_public_snapshots_og_image_asset_id_fkey');
    expect(m3).toMatch(
      /add constraint profile_public_snapshots_og_image_asset_id_fkey[\s\S]*?references public\.media_assets\(id\)[\s\S]*?on delete set null/i,
    );
    // Ensure no destructive cascade on the snapshot OG image FK (other cascades in media/storage are intentional)
    expect(m3).not.toMatch(/og_image_asset_id_fkey[\s\S]{0,120}?on delete cascade/i);
  });
});
