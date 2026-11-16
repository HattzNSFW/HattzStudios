import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PlannedSupabasePublicProfileReadAdapter } from '../../infrastructure/adapters/supabase-adapter-boundary';

const rls = readFileSync(
  resolve(process.cwd(), 'infrastructure/supabase/migrations/0008_rls_policies.sql'),
  'utf8',
);

describe('data isolation (RLS and boundaries)', () => {
  it('exposes only published public snapshots/content to Share policies', () => {
    expect(rls).toContain('create policy share_read_public_snapshots');
    expect(rls).toContain("visibility = 'public'");
    expect(rls).toContain("p.state = 'published'");
    expect(rls).toContain('share_read_public_media_assets');
    expect(rls).toContain("is_public = true and status = 'active'");
  });

  it('enables RLS and does not create public policies for admin/audit/restricted domains', () => {
    expect(rls).toContain('alter table hattz_admin.admin_accounts enable row level security;');
    expect(rls).toContain('alter table hattz_audit.audit_logs enable row level security;');
    expect(rls).not.toMatch(/create policy\s+\w+\s+on\s+hattz_admin\./);
    expect(rls).not.toMatch(/create policy\s+\w+\s+on\s+hattz_audit\./);
    expect(rls).not.toMatch(/create policy\s+\w+\s+on\s+public\.user_role_assignments/);
    expect(rls).not.toMatch(/create policy\s+\w+\s+on\s+public\.sync_operations/);
  });

  it('does not allow Share adapter boundary to connect/fetch without authorized configuration', async () => {
    const adapter = new PlannedSupabasePublicProfileReadAdapter({});
    await expect(adapter.getPublishedProfileBySlug('qualquer-slug')).rejects.toThrow(
      /não configurado\/conectado nesta fase/i,
    );
  });
});
