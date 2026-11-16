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

describe('data isolation (RLS hardening and boundaries)', () => {
  it('enables and forces RLS and revokes direct anon/authenticated access to base tables/schemas', () => {
    expect(rls).toContain('alter table hattz_admin.admin_accounts enable row level security;');
    expect(rls).toContain('alter table hattz_admin.admin_accounts force row level security;');
    expect(rls).toContain('alter table hattz_audit.audit_logs enable row level security;');
    expect(rls).toContain('alter table public.profile_public_snapshots enable row level security;');
    expect(rls).toMatch(
      /revoke all on table[\s\S]*public\.profile_public_snapshots[\s\S]*from anon, authenticated;/,
    );
    expect(rls).toMatch(
      /revoke all on table[\s\S]*hattz_admin\.admin_accounts[\s\S]*from anon, authenticated;/,
    );
    expect(rls).toContain('revoke usage on schema hattz_admin from anon, authenticated;');
    expect(rls).toContain('revoke usage on schema hattz_audit from anon, authenticated;');
    expect(rls).not.toMatch(/create policy\s+\w+\s+on\s+/);
  });

  it('exposes public read only via secure explicit-field views filtered to effectively published content', () => {
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

    // Explicit allowed fields only in view projections (no internal/admin/storage columns)
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
      /\b(technical_id|profile_id|publication_id|manifest|failure_reason|storage_path|storage_bucket|checksum|metadata)\b/i,
    );
    expect(mediaSelect).not.toMatch(
      /\b(profile_id|storage_path|storage_bucket|checksum_sha256|metadata)\b/i,
    );
    expect(profileView).toMatch(/\bps\.slug\b[\s\S]*\bs\.content\b/);
    expect(mediaView).toMatch(/\ba\.id as asset_id\b[\s\S]*\bv\.height as variant_height\b/);
  });

  it('enforces publishable snapshot validation at DB boundary', () => {
    expect(hardening).toContain(
      'create or replace function public.validate_publishable_snapshot_content',
    );
    expect(hardening).toContain('create or replace function public.enforce_publishable_snapshot');
    expect(hardening).toContain(
      'before insert or update of content, visibility on public.profile_public_snapshots',
    );
    expect(hardening).toContain('raise exception');
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
});
