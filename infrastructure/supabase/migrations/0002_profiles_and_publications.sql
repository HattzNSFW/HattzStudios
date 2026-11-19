-- 0002_profiles_and_publications.sql
-- Domínio: perfis, identidade técnica permanente, slugs públicos, publicações e snapshots públicos
-- Isolamento: conteúdo publicado (público controlado) separado de dados privados/locais/administrativos.

begin;

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  -- Identidade técnica permanente e independente de nome/slug público
  technical_id text not null unique,
  display_name text not null check (char_length(trim(display_name)) between 1 and 80),
  status text not null default 'active' check (status in ('active', 'reserved', 'disabled')),
  is_official boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create table if not exists public.profile_slugs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete restrict,
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and char_length(slug) between 3 and 48),
  is_current boolean not null default true,
  reserved boolean not null default false,
  created_at timestamptz not null default now(),
  retired_at timestamptz
);

-- Slug público único quando atual/reservado para evitar apropriação/duplicidade
create unique index if not exists ux_profile_slugs_slug_current
  on public.profile_slugs (lower(slug))
  where is_current = true;

create index if not exists ix_profile_slugs_profile_id on public.profile_slugs(profile_id);

create table if not exists public.profile_publications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete restrict,
  version bigint not null check (version > 0),
  state public.publication_state not null,
  manifest_hash text,
  manifest_ref text,
  published_at timestamptz,
  unpublished_at timestamptz,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, version)
);

create index if not exists ix_profile_publications_profile_state on public.profile_publications(profile_id, state);
create index if not exists ix_profile_publications_published_at on public.profile_publications(published_at desc);

create trigger trg_profile_publications_updated_at
before update on public.profile_publications
for each row execute function public.set_updated_at();

-- Snapshot público versionado: somente conteúdo autorizado para publicação
create table if not exists public.profile_public_snapshots (
  id uuid primary key default gen_random_uuid(),
  publication_id uuid not null unique references public.profile_publications(id) on delete restrict,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  version bigint not null check (version > 0),
  visibility public.profile_visibility not null default 'public',
  seo_title text,
  seo_description text,
  -- Referência opcional à mídia OG; histórico preservado e integridade garantida sem cascata destrutiva.
  -- A FK é criada pela migration 0003, depois da criação de public.media_assets.
  og_image_asset_id uuid,
  content jsonb not null default '{}'::jsonb, -- blocos/seções/widgets/tema/efeitos já validados para público
  created_at timestamptz not null default now(),
  constraint chk_snapshot_public_visibility check (visibility in ('public', 'unpublished'))
);

-- Nota: public.media_assets é criada na migration 0003; a FK de og_image_asset_id é adicionada lá,
-- depois que ambas as tabelas existem.

create index if not exists ix_profile_public_snapshots_profile_version
  on public.profile_public_snapshots(profile_id, version desc);

commit;
