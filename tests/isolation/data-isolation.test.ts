import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  PlannedSupabasePublicMediaReadAdapter,
  PlannedSupabasePublicProfileReadAdapter,
} from '../../infrastructure/adapters/supabase-adapter-boundary';

const rls = readFileSync(
  resolve(process.cwd(), 'infrastructure/supabase/migrations/0008_rls_policies.sql'),
  'utf8',
);
const hardening = readFileSync(
  resolve(
    process.cwd(),
    'infrastructure/supabase/migrations/0009_hardening_public_views_and_snapshot_validation.sql',
  ),
  'utf8',
);

describe('data isolation (RLS hardening and boundaries) — structural migration tests', () => {
  it('enables and forces RLS broadly and revokes broad/direct privileges (incl. PUBLIC) on base tables/schemas', () => {
    expect(rls).toContain('alter table hattz_admin.admin_accounts enable row level security;');
    expect(rls).toContain('alter table hattz_admin.admin_accounts force row level security;');
    expect(rls).toContain('alter table hattz_audit.audit_logs enable row level security;');
    expect(rls).toContain('alter table public.profile_public_snapshots enable row level security;');
    expect(rls).toMatch(
      /revoke all on table[\s\S]*public\.profile_public_snapshots[\s\S]*from public, anon, authenticated;/,
    );
    expect(rls).toMatch(
      /revoke all on table[\s\S]*hattz_admin\.admin_accounts[\s\S]*from public, anon, authenticated;/,
    );
    expect(rls).toContain('revoke all on schema hattz_admin from public, anon, authenticated;');
    expect(rls).toContain('revoke all on schema hattz_audit from public, anon, authenticated;');
  });

  it('grants only minimal columns needed for public views and only restrictive SELECT policies for published/public/active rows', () => {
    // Minimal column grants required by security_invoker views (join/filter/projection columns only)
    expect(rls).toContain(
      'grant select (profile_id, slug, is_current) on table public.profile_slugs to anon, authenticated;',
    );
    expect(rls).toContain(
      'grant select (id, state, published_at) on table public.profile_publications to anon, authenticated;',
    );
    expect(rls).toContain(
      'grant select (publication_id, profile_id, version, visibility, seo_title, seo_description, content)',
    );
    expect(rls).toContain('grant select (id, kind, mime_type, width, height, status, is_public)');
    expect(rls).toContain('grant select (asset_id, variant, format, width, height)');

    // No unnecessary base-table grants/policies (profiles unused by public views; publications.profile_id not required)
    expect(rls).not.toMatch(
      /grant select\s*\([^)]*\bprofile_id\b[^)]*\)\s*on table public\.profiles/i,
    );
    expect(rls).not.toMatch(
      /grant select\s*\(id,\s*profile_id,\s*state,\s*published_at\)\s*on table public\.profile_publications/i,
    );
    expect(rls).not.toMatch(
      /create policy\s+share_select_published_profiles\s+on\s+public\.profiles/i,
    );
    expect(rls).toContain('public.profiles: sem grant e sem policy pública');

    // No sensitive/internal columns granted
    expect(rls).not.toMatch(/grant select\s*\([^)]*technical_id/i);
    expect(rls).not.toMatch(/grant select\s*\([^)]*display_name/i);
    expect(rls).not.toMatch(/grant select\s*\([^)]*storage_path/i);
    expect(rls).not.toMatch(/grant select\s*\([^)]*storage_bucket/i);
    expect(rls).not.toMatch(/grant select\s*\([^)]*checksum/i);
    expect(rls).not.toMatch(/grant select\s*\([^)]*metadata/i);
    expect(rls).not.toMatch(/grant select\s*\([^)]*manifest/i);
    expect(rls).not.toMatch(/grant select\s*\([^)]*failure_reason/i);

    // Policies limited to published/public/active content
    expect(rls).toContain('create policy share_select_public_snapshots');
    expect(rls).toContain("visibility = 'public'");
    expect(rls).toContain("pub.state = 'published'");
    expect(rls).toContain('create policy share_select_public_media_assets');
    expect(rls).toContain("is_public = true and status = 'active'");

    // No policies for restricted/admin/audit domains
    expect(rls).not.toMatch(/create policy\s+\w+\s+on\s+hattz_admin\./);
    expect(rls).not.toMatch(/create policy\s+\w+\s+on\s+hattz_audit\./);
    expect(rls).not.toMatch(/create policy\s+\w+\s+on\s+public\.user_role_assignments/);
    expect(rls).not.toMatch(/create policy\s+\w+\s+on\s+public\.sync_operations/);
    expect(rls).not.toMatch(/create policy\s+\w+\s+on\s+public\.global_settings/);
  });

  it('exposes public read only via security_invoker secure views with explicit projected fields and published/active filters', () => {
    expect(hardening).toContain('with (security_invoker = true, security_barrier = true)');
    expect(hardening).toContain('create or replace view public.v_share_published_profiles');
    expect(hardening).toContain('create or replace view public.v_share_public_media');
    expect(hardening).toContain("s.visibility = 'public'");
    expect(hardening).toContain("pub.state = 'published'");
    expect(hardening).toContain("a.is_public = true and a.status = 'active'");
    expect(hardening).toContain(
      'grant select on public.v_share_published_profiles to anon, authenticated;',
    );
    expect(hardening).toContain(
      'grant select on public.v_share_public_media to anon, authenticated;',
    );

    // Explicit allowed fields only in view projections (no internal/admin/storage/join-id columns)
    const profileView = hardening.match(
      /create or replace view public\.v_share_published_profiles[\s\S]*?;\s*\n\s*comment on view public\.v_share_published_profiles/i,
    )?.[0];
    const mediaView = hardening.match(
      /create or replace view public\.v_share_public_media[\s\S]*?;\s*\n\s*comment on view public\.v_share_public_media/i,
    )?.[0];
    expect(profileView).toBeTruthy();
    expect(mediaView).toBeTruthy();
    const profileSelect = profileView?.match(/select([\s\S]*?)\bfrom\b/i)?.[1] ?? '';
    const mediaSelect = mediaView?.match(/select([\s\S]*?)\bfrom\b/i)?.[1] ?? '';
    expect(profileSelect).not.toMatch(
      /\b(technical_id|profile_id|publication_id|manifest|failure_reason|storage_path|storage_bucket|checksum|metadata|is_public|status|og_image)\b/i,
    );
    expect(mediaSelect).not.toMatch(
      /\b(profile_id|storage_path|storage_bucket|checksum_sha256|checksum|metadata|is_public|status)\b/i,
    );
    expect(profileView).toMatch(/\bps\.slug\b[\s\S]*\bs\.content\b/);
    expect(mediaView).toMatch(/\ba\.id as asset_id\b[\s\S]*\bv\.height as variant_height\b/);
  });

  it('enforces publishable snapshot validation at DB boundary with hardened function privileges and explicit limits', () => {
    expect(hardening).toContain(
      'create or replace function public.validate_publishable_snapshot_content',
    );
    expect(hardening).toContain('create or replace function public.enforce_publishable_snapshot');
    expect(hardening).toContain(
      'before insert or update of content, visibility on public.profile_public_snapshots',
    );
    expect(hardening).toContain('raise exception');
    expect(hardening).toContain('set search_path = pg_catalog, public');
    expect(hardening).toContain('max_total_bytes int := 262144');
    expect(hardening).toContain('max_depth int := 12');
    expect(hardening).toContain('max_sections int := 50');
    expect(hardening).toContain('max_blocks_per_section int := 50');
    expect(hardening).toContain('max_array_elements int := 100');
    expect(hardening).toContain('max_object_keys int := 50');
    expect(hardening).toMatch(/avatarAssetId' !~ '\^\[a-zA-Z0-9_-]\{1,128\}\$'/);
    expect(hardening).toMatch(/p\.key !~ '\^\[a-zA-Z0-9_-]\{1,64\}\$'/);
    expect(hardening).toContain(
      'revoke all on function public.validate_publishable_snapshot_content(jsonb) from public, anon, authenticated;',
    );
    expect(hardening).toContain(
      'revoke all on function public.enforce_publishable_snapshot() from public, anon, authenticated;',
    );
  });

  it('does not allow Share/public adapter boundaries to connect/fetch without authorized configuration', async () => {
    const profileAdapter = new PlannedSupabasePublicProfileReadAdapter({});
    await expect(profileAdapter.getPublishedProfileBySlug('qualquer-slug')).rejects.toThrow(
      /não configurado\/conectado nesta fase/i,
    );
    const mediaAdapter = new PlannedSupabasePublicMediaReadAdapter({});
    await expect(mediaAdapter.listPublicMedia()).rejects.toThrow(
      /não configurado\/conectado nesta fase/i,
    );
  });

  it('removes the public-read RLS recursion (0010) with a self-sufficient publications policy and a derived visibility flag', () => {
    const fix = readFileSync(
      resolve(
        process.cwd(),
        'infrastructure/supabase/migrations/0010_public_read_visibility_fix.sql',
      ),
      'utf8',
    );
    expect(fix).toContain('is_publicly_visible boolean not null default false');

    // P2 (publications) no longer references snapshots -> cycle broken.
    const p2 = fix.match(/create policy share_select_published_publications[\s\S]*?;/i)?.[0] ?? '';
    expect(p2).toContain('using (is_publicly_visible)');
    expect(p2).not.toContain('profile_public_snapshots');

    // P1/P3 rely on the derived flag and remain restrictive.
    expect(fix).toMatch(/and pub\.is_publicly_visible/);
    expect(fix).toContain("visibility = 'public'");
    expect(fix).toContain('is_current = true');

    // Minimal, read-only column grant required by P1/P3 (no table/write privileges).
    expect(fix).toContain(
      'grant select (is_publicly_visible) on public.profile_publications to anon, authenticated;',
    );
    expect(fix).not.toMatch(/grant\s+(insert|update|delete|all)\b/i);
  });
});
