-- 0008_rls_policies.sql (hardened)
-- RLS (princípio de menor privilégio) e revogações de privilégios diretos.
-- Objetivos: nenhum acesso direto de anon/authenticated a tabelas base sensíveis;
-- leitura pública somente via views seguras explícitas (0009). Share não consulta rascunhos/dados privados.

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

-- Revogar privilégios diretos de anon/authenticated em tabelas base (defesa em profundidade).
-- Leitura pública ocorrerá apenas por views explícitas (0009) com colunas permitidas.
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
from anon, authenticated;

revoke all on table
  hattz_admin.admin_accounts,
  hattz_admin.admin_credentials,
  hattz_admin.admin_recovery_keys,
  hattz_admin.admin_sessions,
  hattz_admin.admin_access_logs,
  hattz_audit.audit_logs
from anon, authenticated;

revoke usage on schema hattz_admin from anon, authenticated;
revoke usage on schema hattz_audit from anon, authenticated;

-- Nenhuma policy de SELECT/INSERT/UPDATE/DELETE para anon/authenticated em tabelas base.
-- Acesso administrativo/serviço futuro: papéis/claims dedicados e funções controladas, com revisão de segurança.

commit;
