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
    // Guard set-returning JSON functions with CASE; a WHERE filter alone does not guarantee
    // evaluation order and could otherwise call jsonb_each/jsonb_array_elements on scalars.
    expect(m9).toContain("jsonb_each(case when jsonb_typeof(w.value) = 'object'");
    expect(m9).toContain("jsonb_array_elements(case when jsonb_typeof(w.value) = 'array'");
    expect(m9).toContain("jsonb_object_keys(case when jsonb_typeof(w.value) = 'object'");
    expect(m9).toContain("jsonb_array_length(case when jsonb_typeof(w.value) = 'array'");
    // PostgreSQL `\b` is not a word boundary (use `\y`); otherwise the legitimate key
    // `tokens` (design tokens) would be rejected by the DB but accepted by the TS validator.
    expect(m9).toContain('token(?!s\\y)');
    expect(m9).not.toContain('token(?!s\\b)');
  });

  it('enforces snapshot referential integrity for OG media with history-preserving delete behavior', () => {
    const m2 = readMigration('0002_profiles_and_publications.sql');
    const m3 = readMigration('0003_media_storage.sql');
    expect(m2).toContain('og_image_asset_id uuid');
    expect(m2).not.toContain('references public.media_assets');
    expect(m3).toContain('add constraint profile_public_snapshots_og_image_asset_id_fkey');
    expect(m3.indexOf('create table if not exists public.media_assets')).toBeLessThan(
      m3.indexOf('add constraint profile_public_snapshots_og_image_asset_id_fkey'),
    );
    expect(m3).toMatch(
      /add constraint profile_public_snapshots_og_image_asset_id_fkey[\s\S]*?references public\.media_assets\(id\)[\s\S]*?on delete set null/i,
    );
    // Ensure no destructive cascade on the snapshot OG image FK (other cascades in media/storage are intentional)
    expect(m3).not.toMatch(/og_image_asset_id_fkey[\s\S]{0,120}?on delete cascade/i);
  });

  it('binds each public snapshot to the exact publication, profile, and version (0011)', () => {
    const m2 = readMigration('0002_profiles_and_publications.sql');
    const m11 = readMigration('0011_snapshot_publication_identity_integrity.sql');

    // The original model had only publication_id -> id; the additive migration
    // replaces it with a composite FK that prevents cross-profile/version binding.
    expect(m2).toContain(
      'publication_id uuid not null unique references public.profile_publications(id)',
    );
    // The composite FK cannot be escaped through NULL components: all three identity columns are
    // NOT NULL, so a NULL never disables the constraint's MATCH SIMPLE check.
    expect(m2).toMatch(/profile_id uuid not null references public\.profiles\(id\)/);
    expect(m2).toMatch(/version bigint not null check \(version > 0\)/);
    expect(m11).toContain('unique (id, profile_id, version)');
    // The legacy single-column FK is removed by DEFINITION (not by name), so reapplication is
    // safe even if the constraint was renamed. Assert both the local-column detection and the
    // definition-based drop are present.
    expect(m11).toContain("array['publication_id']");
    expect(m11).toContain('drop constraint %I');
    // Local and referenced column sets are matched exactly.
    expect(m11).toContain("array['profile_id', 'publication_id', 'version']");
    expect(m11).toContain("array['id', 'profile_id', 'version']");
    // Incompatible pre-existing data is rejected with a clear message (not a generic constraint error).
    expect(m11).toMatch(/s\.profile_id <> p\.profile_id/);
    expect(m11).toMatch(/s\.version <> p\.version/);
    expect(m11).toMatch(
      /raise exception[\s\S]*?snapshot\(s\) com profile_id\/version divergentes/i,
    );
    expect(m11).toMatch(
      /foreign key \(publication_id, profile_id, version\)[\s\S]*?references public\.profile_publications \(id, profile_id, version\)[\s\S]*?on delete restrict/i,
    );
    expect(m11).not.toMatch(/on delete cascade/i);
    // Additive/preserving: no data destruction.
    expect(m11).not.toMatch(/\b(delete from|truncate|drop table)\b/i);
  });

  it('breaks the public-read policy recursion via a derived visibility flag (0010, A1-ii)', () => {
    const m10 = readMigration('0010_public_read_visibility_fix.sql');

    // Derived authoritative column + transactional backfill.
    expect(m10).toContain(
      'add column if not exists is_publicly_visible boolean not null default false',
    );
    expect(m10).toMatch(/update public\.profile_publications p[\s\S]*?set is_publicly_visible = /i);

    // Triggers/functions with fixed search_path and no SECURITY DEFINER / bypass (comments excluded).
    const sqlOnly = m10
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('--'))
      .join('\n');
    expect(sqlOnly).not.toMatch(/security\s+definer/i);
    expect(sqlOnly).not.toMatch(/bypassrls/i);
    expect(m10).toContain('create or replace function public.sync_publication_visibility');
    expect(m10).toContain('create or replace function public.sync_snapshot_parent_visibility');
    expect(m10).toContain('set search_path = pg_catalog, public');
    expect(m10).toContain('create trigger trg_sync_publication_visibility');
    expect(m10).toContain('create trigger trg_sync_snapshot_parent_visibility');
    expect(m10).toContain('before insert or update on public.profile_publications');
    expect(m10).toContain(
      'after insert or update of visibility, publication_id or delete on public.profile_public_snapshots',
    );

    // Minimal function privileges (no public EXECUTE).
    expect(m10).toMatch(
      /revoke all on function public\.sync_publication_visibility\(\) from public, anon, authenticated;/,
    );
    expect(m10).toMatch(
      /revoke all on function public\.sync_snapshot_parent_visibility\(\) from public, anon, authenticated;/,
    );

    // P2 must be self-sufficient (no reference to snapshots) to break the P1<->P2 cycle.
    const p2 = m10.match(/create policy share_select_published_publications[\s\S]*?;/i)?.[0];
    expect(p2).toBeTruthy();
    expect(p2).toContain('using (is_publicly_visible)');
    expect(p2).not.toContain('profile_public_snapshots');

    // P1/P3 depend on the derived flag (acyclic: -> P2).
    expect(m10).toContain('and pub.is_publicly_visible');
    expect(m10).toMatch(/create policy share_select_public_snapshots/);
    expect(m10).toMatch(/create policy share_select_current_public_slugs/);

    // No public write privileges added.
    expect(sqlOnly).not.toMatch(/grant\s+(insert|update|delete|all)/i);

    // Required column-level SELECT grant for the derived flag (verified in runtime round 3:
    // P1/P3 reference it from a subquery on another relation, which enforces column privileges).
    expect(m10).toContain(
      'grant select (is_publicly_visible) on public.profile_publications to anon, authenticated;',
    );
  });
});
