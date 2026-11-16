-- 0007_settings_sync_monitoring.sql
-- Domínio: configurações, feature flags, notificações, sync (metadados de nuvem) e monitoramento
-- Dados operacionais/administrativos separados de conteúdo público publicado.

begin;

create table if not exists public.global_settings (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('share','studio','control','system')),
  setting_key text not null,
  value jsonb not null,
  version bigint not null default 1 check (version > 0),
  updated_by_admin uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (scope, setting_key)
);

create trigger trg_global_settings_updated_at
before update on public.global_settings
for each row execute function public.set_updated_at();

create table if not exists public.settings_history (
  id bigint generated always as identity primary key,
  setting_id uuid not null references public.global_settings(id) on delete cascade,
  scope text not null,
  setting_key text not null,
  old_value jsonb,
  new_value jsonb not null,
  version bigint not null,
  changed_by_admin uuid,
  reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.feature_flags (
  id uuid primary key default gen_random_uuid(),
  flag_key text not null unique,
  scope text not null default 'system',
  enabled boolean not null default false,
  config jsonb not null default '{}'::jsonb,
  updated_by_admin uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_feature_flags_updated_at
before update on public.feature_flags
for each row execute function public.set_updated_at();

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  audience text not null check (audience in ('admin','system')),
  severity text not null check (severity in ('info','warning','error','critical')),
  category text not null,
  title text not null,
  body text,
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists ix_notifications_audience_created on public.notifications(audience, created_at desc);

create table if not exists public.sync_operations (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete set null,
  operation_id text not null unique, -- idempotência
  operation_type text not null,
  direction text not null check (direction in ('local_to_cloud','cloud_to_local','cloud_internal')),
  state public.sync_state not null default 'pendente',
  payload_ref text,
  payload_hash text,
  base_version bigint,
  target_version bigint,
  conflict_ref text,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ix_sync_operations_profile_state on public.sync_operations(profile_id, state);

create trigger trg_sync_operations_updated_at
before update on public.sync_operations
for each row execute function public.set_updated_at();

create table if not exists public.service_status_snapshots (
  id bigint generated always as identity primary key,
  service_name text not null,
  status text not null check (status in ('online','offline','parcial','sincronizando','pendente','degradado','manutencao','indisponivel','recuperando')),
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  details jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null default now()
);

commit;
