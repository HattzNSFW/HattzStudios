-- 0005_collectibles_collections.sql
-- Domínio: badges, frames, coleções, propriedade vinculada ao perfil e progresso
-- Regras de proteção/histórico modeladas para suporte a concessão/revogação auditável (fluxos futuros).

begin;

create table if not exists public.badges_catalog (
  id uuid primary key default gen_random_uuid(),
  badge_key text not null unique,
  name text not null,
  description text not null default '',
  category text not null default 'general',
  rarity public.collectible_rarity not null,
  is_special boolean not null default false,
  rules jsonb not null default '{}'::jsonb,
  asset_id uuid references public.media_assets(id) on delete set null,
  highlight_limit integer check (highlight_limit is null or highlight_limit >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((rarity = 'especial') = is_special or rarity <> 'especial')
);

create trigger trg_badges_catalog_updated_at
before update on public.badges_catalog
for each row execute function public.set_updated_at();

create table if not exists public.frames_catalog (
  id uuid primary key default gen_random_uuid(),
  frame_key text not null unique,
  name text not null,
  description text not null default '',
  category text not null default 'general',
  rarity public.collectible_rarity not null,
  permanence text not null default 'permanent' check (permanence in ('permanent','temporary','limited','event')),
  availability text not null default 'free' check (availability in ('free','vip','exclusive','earnable','event')),
  is_animated boolean not null default false,
  compatibility jsonb not null default '{}'::jsonb,
  asset_id uuid references public.media_assets(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_frames_catalog_updated_at
before update on public.frames_catalog
for each row execute function public.set_updated_at();

create table if not exists public.collections (
  id uuid primary key default gen_random_uuid(),
  collection_key text not null unique,
  name text not null,
  description text not null default '',
  opens_at timestamptz,
  closes_at timestamptz,
  conditions jsonb not null default '{}'::jsonb,
  rewards jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft','active','closed','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (closes_at is null or opens_at is null or closes_at >= opens_at)
);

create trigger trg_collections_updated_at
before update on public.collections
for each row execute function public.set_updated_at();

create table if not exists public.collection_items (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.collections(id) on delete cascade,
  item_type text not null check (item_type in ('badge','frame','benefit','task','other')),
  item_ref text not null,
  requirement jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (collection_id, item_type, item_ref)
);

create table if not exists public.user_badges (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete restrict,
  badge_id uuid not null references public.badges_catalog(id) on delete restrict,
  source public.grant_source_type not null,
  source_ref text,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoke_reason text,
  revoked_by_admin uuid,
  is_equipped boolean not null default false,
  is_favorite boolean not null default false,
  sort_order integer,
  metadata jsonb not null default '{}'::jsonb
);

-- Prevenção de duplicidade de posse ativa do mesmo badge
create unique index if not exists ux_user_badges_active_unique
  on public.user_badges(profile_id, badge_id)
  where revoked_at is null;

create index if not exists ix_user_badges_profile on public.user_badges(profile_id, granted_at desc);

create table if not exists public.user_frames (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete restrict,
  frame_id uuid not null references public.frames_catalog(id) on delete restrict,
  source public.grant_source_type not null,
  source_ref text,
  granted_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  revoke_reason text,
  revoked_by_admin uuid,
  is_equipped boolean not null default false,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists ix_user_frames_profile on public.user_frames(profile_id, granted_at desc);

create table if not exists public.user_collection_progress (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete restrict,
  collection_id uuid not null references public.collections(id) on delete cascade,
  status text not null default 'in_progress' check (status in ('locked','in_progress','completed','reward_claimed','revoked')),
  progress jsonb not null default '{}'::jsonb,
  completed_at timestamptz,
  reward_granted_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (profile_id, collection_id)
);

create trigger trg_user_collection_progress_updated_at
before update on public.user_collection_progress
for each row execute function public.set_updated_at();

commit;
