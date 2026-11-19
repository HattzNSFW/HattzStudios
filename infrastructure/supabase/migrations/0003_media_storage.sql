-- 0003_media_storage.sql
-- Domínio: mídia e armazenamento (metadados). Arquivos binários em storage gerenciado (futuro).
-- Separação por perfil/categoria e rastreabilidade; sem execução de arquivos enviados.

begin;

create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete restrict,
  kind text not null check (kind in ('avatar','frame','badge','background','banner','card','widget','other')),
  storage_bucket text,
  storage_path text,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  checksum_sha256 text,
  status text not null default 'pending' check (status in ('pending','active','replaced','orphaned','deleted')),
  is_public boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ix_media_assets_profile_kind on public.media_assets(profile_id, kind);
create index if not exists ix_media_assets_status on public.media_assets(status);
create index if not exists ix_media_assets_public on public.media_assets(is_public) where is_public = true;

create trigger trg_media_assets_updated_at
before update on public.media_assets
for each row execute function public.set_updated_at();

create table if not exists public.media_variants (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.media_assets(id) on delete cascade,
  variant text not null check (variant in ('original','thumbnail','optimized','preview')),
  storage_path text not null,
  mime_type text not null,
  format text,
  size_bytes bigint not null check (size_bytes >= 0),
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  created_at timestamptz not null default now(),
  unique (asset_id, variant)
);

create table if not exists public.profile_storage_usage (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  total_bytes bigint not null default 0 check (total_bytes >= 0),
  images_bytes bigint not null default 0 check (images_bytes >= 0),
  media_bytes bigint not null default 0 check (media_bytes >= 0),
  other_bytes bigint not null default 0 check (other_bytes >= 0),
  updated_at timestamptz not null default now()
);

create trigger trg_profile_storage_usage_updated_at
before update on public.profile_storage_usage
for each row execute function public.set_updated_at();

-- Integridade referencial de mídia em snapshot (0002 cria a coluna antes de media_assets existir).
-- ON DELETE SET NULL preserva histórico de publicação e evita referências quebradas sem cascata destrutiva.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profile_public_snapshots_og_image_asset_id_fkey'
      and conrelid = 'public.profile_public_snapshots'::regclass
      and contype = 'f'
  ) then
    alter table public.profile_public_snapshots
      add constraint profile_public_snapshots_og_image_asset_id_fkey
      foreign key (og_image_asset_id)
      references public.media_assets(id)
      on delete set null;
  end if;
end $$;

commit;
