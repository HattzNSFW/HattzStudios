-- 0006_admin_audit_isolation.sql
-- Domínio: administração e auditoria (isolados)
-- IMPORTANTE: isolamento administrativo real. Cargo público Owner não concede acesso ao Control.
-- Esta migration define estruturas de dados; NÃO implementa autenticação própria sem decisão/revisão de segurança específica.

begin;

create table if not exists hattz_admin.admin_accounts (
  id uuid primary key default gen_random_uuid(),
  account_key text not null unique, -- identificador técnico administrativo interno
  display_name text not null,
  status text not null default 'active' check (status in ('active','disabled','locked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_admin_accounts_updated_at
before update on hattz_admin.admin_accounts
for each row execute function public.set_updated_at();

-- Estruturas planejadas para credenciais/sessões/recovery (hashes/segredos nunca em texto puro)
create table if not exists hattz_admin.admin_credentials (
  admin_account_id uuid primary key references hattz_admin.admin_accounts(id) on delete cascade,
  password_hash text,
  hash_algorithm text,
  hash_params jsonb not null default '{}'::jsonb,
  password_set_at timestamptz,
  requires_rotation boolean not null default false,
  updated_at timestamptz not null default now()
);

create trigger trg_admin_credentials_updated_at
before update on hattz_admin.admin_credentials
for each row execute function public.set_updated_at();

create table if not exists hattz_admin.admin_recovery_keys (
  id uuid primary key default gen_random_uuid(),
  admin_account_id uuid not null references hattz_admin.admin_accounts(id) on delete cascade,
  key_hash text not null,
  key_fingerprint text,
  status text not null default 'active' check (status in ('active','used','revoked')),
  created_at timestamptz not null default now(),
  used_at timestamptz
);

create table if not exists hattz_admin.admin_sessions (
  id uuid primary key default gen_random_uuid(),
  admin_account_id uuid not null references hattz_admin.admin_accounts(id) on delete cascade,
  session_token_hash text,
  device_label text,
  ip_hash text,
  user_agent_hash text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  revoke_reason text
);

create index if not exists ix_admin_sessions_account on hattz_admin.admin_sessions(admin_account_id, created_at desc);

create table if not exists hattz_admin.admin_access_logs (
  id bigint generated always as identity primary key,
  admin_account_id uuid references hattz_admin.admin_accounts(id) on delete set null,
  event_type text not null,
  success boolean not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists hattz_audit.audit_logs (
  id bigint generated always as identity primary key,
  actor_type text not null check (actor_type in ('admin','system','service')),
  actor_id text,
  action text not null,
  resource_type text not null,
  resource_id text,
  reason text,
  before_state jsonb,
  after_state jsonb,
  result text not null check (result in ('success','failure','denied','partial')),
  correlation_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ix_audit_logs_resource on hattz_audit.audit_logs(resource_type, resource_id);
create index if not exists ix_audit_logs_created_at on hattz_audit.audit_logs(created_at desc);

commit;
