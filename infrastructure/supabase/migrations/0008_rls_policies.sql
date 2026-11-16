-- 0008_rls_policies.sql (hardened, audit-adjusted)
-- RLS (princípio de menor privilégio), revogações e grants mínimos para leitura pública via views seguras (0009).
-- Objetivo: anon/authenticated não acessam tabelas/schemas sensíveis nem colunas internas; leitura pública apenas
-- de conteúdo efetivamente publicado/público/ativo, por views security_invoker com colunas explícitas (0009).
-- Nota: RLS FORCE + ausência de policies + ausência de privilégios de tabela impedem acesso direto indevido.

begin;

-- Habilitar RLS em todas as tabelas dos domínios modelados
alter table public.profiles enable row level security;
alter table public.profile_slugs enable row level security;
alter table public.profile_publications enable row level security;
alter table public.profile_public_snapshots enable row level security;
alter table public.media_assets enable row level security;
alter table public.media_variants enable row level security;
alter table public.profile_storage_usage enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_role_assignments enable row level security;
alter table public.user_permission_overrides enable row level security;
alter table public.benefits_catalog enable row level security;
alter table public.role_benefits enable row level security;
alter table public.user_benefits enable row level security;
alter table public.badges_catalog enable row level security;
alter table public.frames_catalog enable row level security;
alter table public.collections enable row level security;
alter table public.collection_items enable row level security;
alter table public.user_badges enable row level security;
alter table public.user_frames enable row level security;
alter table public.user_collection_progress enable row level security;
alter table public.global_settings enable row level security;
alter table public.settings_history enable row level security;
alter table public.feature_flags enable row level security;
alter table public.notifications enable row level security;
alter table public.sync_operations enable row level security;
alter table public.service_status_snapshots enable row level security;

alter table hattz_admin.admin_accounts enable row level security;
alter table hattz_admin.admin_credentials enable row level security;
alter table hattz_admin.admin_recovery_keys enable row level security;
alter table hattz_admin.admin_sessions enable row level security;
alter table hattz_admin.admin_access_logs enable row level security;
alter table hattz_audit.audit_logs enable row level security;

-- Forçar RLS também para owner da tabela (defesa em profundidade onde suportado)
alter table public.profiles force row level security;
alter table public.profile_slugs force row level security;
alter table public.profile_publications force row level security;
alter table public.profile_public_snapshots force row level security;
alter table public.media_assets force row level security;
alter table public.media_variants force row level security;
alter table public.profile_storage_usage force row level security;
alter table public.roles force row level security;
alter table public.permissions force row level security;
alter table public.role_permissions force row level security;
alter table public.user_role_assignments force row level security;
alter table public.user_permission_overrides force row level security;
alter table public.benefits_catalog force row level security;
alter table public.role_benefits force row level security;
alter table public.user_benefits force row level security;
alter table public.badges_catalog force row level security;
alter table public.frames_catalog force row level security;
alter table public.collections force row level security;
alter table public.collection_items force row level security;
alter table public.user_badges force row level security;
alter table public.user_frames force row level security;
alter table public.user_collection_progress force row level security;
alter table public.global_settings force row level security;
alter table public.settings_history force row level security;
alter table public.feature_flags force row level security;
alter table public.notifications force row level security;
alter table public.sync_operations force row level security;
alter table public.service_status_snapshots force row level security;
alter table hattz_admin.admin_accounts force row level security;
alter table hattz_admin.admin_credentials force row level security;
alter table hattz_admin.admin_recovery_keys force row level security;
alter table hattz_admin.admin_sessions force row level security;
alter table hattz_admin.admin_access_logs force row level security;
alter table hattz_audit.audit_logs force row level security;

-- Revogar privilégios diretos amplos (defesa em profundidade); grants mínimos recriados abaixo apenas onde necessário.
revoke all on table
  public.profiles,
  public.profile_slugs,
  public.profile_publications,
  public.profile_public_snapshots,
  public.media_assets,
  public.media_variants,
  public.profile_storage_usage,
  public.roles,
  public.permissions,
  public.role_permissions,
  public.user_role_assignments,
  public.user_permission_overrides,
  public.benefits_catalog,
  public.role_benefits,
  public.user_benefits,
  public.badges_catalog,
  public.frames_catalog,
  public.collections,
  public.collection_items,
  public.user_badges,
  public.user_frames,
  public.user_collection_progress,
  public.global_settings,
  public.settings_history,
  public.feature_flags,
  public.notifications,
  public.sync_operations,
  public.service_status_snapshots
from public, anon, authenticated;

revoke all on table
  hattz_admin.admin_accounts,
  hattz_admin.admin_credentials,
  hattz_admin.admin_recovery_keys,
  hattz_admin.admin_sessions,
  hattz_admin.admin_access_logs,
  hattz_audit.audit_logs
from public, anon, authenticated;

revoke all on schema hattz_admin from public, anon, authenticated;
revoke all on schema hattz_audit from public, anon, authenticated;

-- Grants mínimos de coluna (somente colunas necessárias para views públicas security_invoker em 0009).
-- RLS limita as linhas a conteúdo efetivamente publicado/público/ativo. Sem grants em colunas internas/admin.
grant select (id, profile_id) on table public.profiles to anon, authenticated;
grant select (profile_id, slug, is_current) on table public.profile_slugs to anon, authenticated;
grant select (id, profile_id, state, published_at) on table public.profile_publications to anon, authenticated;
grant select (publication_id, profile_id, version, visibility, seo_title, seo_description, content)
  on table public.profile_public_snapshots to anon, authenticated;

grant select (id, kind, mime_type, width, height, status, is_public)
  on table public.media_assets to anon, authenticated;
grant select (asset_id, variant, format, width, height)
  on table public.media_variants to anon, authenticated;

-- Policies públicas restritas (apenas leitura, apenas linhas publicáveis/publicadas/ativas)
drop policy if exists share_select_published_profiles on public.profiles;
create policy share_select_published_profiles
on public.profiles
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.profile_public_snapshots s
    join public.profile_publications pub on pub.id = s.publication_id
    where s.profile_id = profiles.id
      and s.visibility = 'public'
      and pub.state = 'published'
  )
);

drop policy if exists share_select_current_public_slugs on public.profile_slugs;
create policy share_select_current_public_slugs
on public.profile_slugs
for select
to anon, authenticated
using (
  is_current = true
  and exists (
    select 1
    from public.profile_public_snapshots s
    join public.profile_publications pub on pub.id = s.publication_id
    where s.profile_id = profile_slugs.profile_id
      and s.visibility = 'public'
      and pub.state = 'published'
  )
);

drop policy if exists share_select_published_publications on public.profile_publications;
create policy share_select_published_publications
on public.profile_publications
for select
to anon, authenticated
using (
  state = 'published'
  and exists (
    select 1
    from public.profile_public_snapshots s
    where s.publication_id = profile_publications.id
      and s.visibility = 'public'
  )
);

drop policy if exists share_select_public_snapshots on public.profile_public_snapshots;
create policy share_select_public_snapshots
on public.profile_public_snapshots
for select
to anon, authenticated
using (
  visibility = 'public'
  and exists (
    select 1
    from public.profile_publications pub
    where pub.id = profile_public_snapshots.publication_id
      and pub.state = 'published'
  )
);

drop policy if exists share_select_public_media_assets on public.media_assets;
create policy share_select_public_media_assets
on public.media_assets
for select
to anon, authenticated
using (is_public = true and status = 'active');

drop policy if exists share_select_public_media_variants on public.media_variants;
create policy share_select_public_media_variants
on public.media_variants
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.media_assets a
    where a.id = media_variants.asset_id
      and a.is_public = true
      and a.status = 'active'
  )
);

-- Domínios restritos e admin/auditoria: sem grants e sem policies para anon/authenticated/public.
-- Acesso administrativo/serviço futuro: papéis/claims dedicados e funções controladas, com revisão de segurança.

commit;
