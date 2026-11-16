-- 0008_rls_policies.sql
-- Políticas RLS (princípio de menor privilégio)
-- Objetivos: Share público lê apenas snapshots publicados; isolamento de admin/auditoria;
-- sem acesso anônimo a dados privados/rascunhos/administrativos.

begin;

-- Perfis: metadados básicos podem ser expostos publicamente apenas quando há publicação pública ativa (via join/policy controlada)
alter table public.profiles enable row level security;
alter table public.profile_slugs enable row level security;
alter table public.profile_publications enable row level security;
alter table public.profile_public_snapshots enable row level security;

-- Mídia e uso: apenas metadados públicos vinculados a snapshot/publicação pública
alter table public.media_assets enable row level security;
alter table public.media_variants enable row level security;
alter table public.profile_storage_usage enable row level security;

-- Domínios restritos (sem acesso público/anônimo por padrão)
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

-- Schemas isolados
alter table hattz_admin.admin_accounts enable row level security;
alter table hattz_admin.admin_credentials enable row level security;
alter table hattz_admin.admin_recovery_keys enable row level security;
alter table hattz_admin.admin_sessions enable row level security;
alter table hattz_admin.admin_access_logs enable row level security;
alter table hattz_audit.audit_logs enable row level security;

-- Limpeza defensiva de políticas genéricas, se reexecutado em ambiente controlado
-- (nomes explícitos; sem permissões amplas)

-- SHARE (anon/authenticated público): somente leitura de snapshots publicados e metadados públicos necessários

drop policy if exists share_read_public_snapshots on public.profile_public_snapshots;
create policy share_read_public_snapshots
on public.profile_public_snapshots
for select
to anon, authenticated
using (
  visibility = 'public'
  and exists (
    select 1
    from public.profile_publications p
    where p.id = profile_public_snapshots.publication_id
      and p.profile_id = profile_public_snapshots.profile_id
      and p.state = 'published'
  )
);

drop policy if exists share_read_published_profiles on public.profiles;
create policy share_read_published_profiles
on public.profiles
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.profile_publications p
    join public.profile_public_snapshots s on s.publication_id = p.id
    where p.profile_id = profiles.id
      and p.state = 'published'
      and s.visibility = 'public'
  )
);

drop policy if exists share_read_current_public_slugs on public.profile_slugs;
create policy share_read_current_public_slugs
on public.profile_slugs
for select
to anon, authenticated
using (
  is_current = true
  and exists (
    select 1
    from public.profile_publications p
    join public.profile_public_snapshots s on s.publication_id = p.id
    where p.profile_id = profile_slugs.profile_id
      and p.state = 'published'
      and s.visibility = 'public'
  )
);

drop policy if exists share_read_published_publications on public.profile_publications;
create policy share_read_published_publications
on public.profile_publications
for select
to anon, authenticated
using (state = 'published');

-- Mídia pública: somente assets marcados como públicos e ativos
drop policy if exists share_read_public_media_assets on public.media_assets;
create policy share_read_public_media_assets
on public.media_assets
for select
to anon, authenticated
using (is_public = true and status = 'active');

drop policy if exists share_read_public_media_variants on public.media_variants;
create policy share_read_public_media_variants
on public.media_variants
for select
to anon, authenticated
using (
  exists (
    select 1 from public.media_assets a
    where a.id = media_variants.asset_id
      and a.is_public = true
      and a.status = 'active'
  )
);

-- Nenhuma policy para anon/authenticated nas tabelas restritas => acesso negado por padrão (RLS ativo).
-- Escritas públicas não permitidas. Acesso administrativo/serviço será concedido futuramente via papéis/claims
-- dedicados e funções controladas, após decisão arquitetural e revisão de segurança.

commit;
