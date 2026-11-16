-- 0004_roles_permissions_benefits.sql
-- Domínio: cargos, permissões (RBAC + individuais/contextuais) e benefícios
-- Observação: cargo público Owner NÃO concede acesso automático ao Control (acesso admin é domínio separado).

begin;

create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  role_key text not null unique check (char_length(role_key) between 2 and 64),
  name text not null,
  description text not null default '',
  color text,
  icon text,
  hierarchy integer not null default 0,
  is_system boolean not null default false,
  is_extensible boolean not null default true,
  tags jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_roles_updated_at
before update on public.roles
for each row execute function public.set_updated_at();

create table if not exists public.permissions (
  id uuid primary key default gen_random_uuid(),
  permission_id text not null unique, -- ID permanente (ex.: perm.control.access)
  permission_key text not null unique,
  category text not null,
  description text not null default '',
  is_sensitive boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists ix_permissions_category on public.permissions(category);

create table if not exists public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_ref uuid not null references public.permissions(id) on delete restrict,
  grant_type text not null default 'allow' check (grant_type in ('allow','deny')),
  constraints jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (role_id, permission_ref)
);

create table if not exists public.user_role_assignments (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete restrict,
  role_id uuid not null references public.roles(id) on delete restrict,
  source public.grant_source_type not null default 'manual',
  assigned_by_admin uuid, -- referência lógica ao domínio admin (isolado)
  reason text,
  starts_at timestamptz,
  ends_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  check (ends_at is null or starts_at is null or ends_at >= starts_at)
);

create index if not exists ix_user_role_assignments_profile on public.user_role_assignments(profile_id, active);

create table if not exists public.user_permission_overrides (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete restrict,
  permission_ref uuid not null references public.permissions(id) on delete restrict,
  effect text not null check (effect in ('allow','deny')),
  context jsonb not null default '{}'::jsonb,
  source public.grant_source_type not null default 'manual',
  reason text,
  assigned_by_admin uuid,
  starts_at timestamptz,
  ends_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index if not exists ix_user_permission_overrides_profile on public.user_permission_overrides(profile_id, active);

create table if not exists public.benefits_catalog (
  id uuid primary key default gen_random_uuid(),
  benefit_key text not null unique,
  name text not null,
  description text not null default '',
  benefit_type text not null default 'feature' check (benefit_type in ('feature','cosmetic','limit','access','other')),
  is_exclusive boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_benefits_catalog_updated_at
before update on public.benefits_catalog
for each row execute function public.set_updated_at();

create table if not exists public.role_benefits (
  role_id uuid not null references public.roles(id) on delete cascade,
  benefit_id uuid not null references public.benefits_catalog(id) on delete restrict,
  validity_type public.benefit_validity_type not null default 'permanent',
  valid_from timestamptz,
  valid_until timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (role_id, benefit_id)
);

create table if not exists public.user_benefits (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete restrict,
  benefit_id uuid not null references public.benefits_catalog(id) on delete restrict,
  source public.grant_source_type not null default 'manual',
  source_role_id uuid references public.roles(id) on delete set null,
  validity_type public.benefit_validity_type not null default 'permanent',
  valid_from timestamptz,
  valid_until timestamptz,
  active boolean not null default true,
  reason text,
  assigned_by_admin uuid,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index if not exists ix_user_benefits_profile on public.user_benefits(profile_id, active);

commit;
