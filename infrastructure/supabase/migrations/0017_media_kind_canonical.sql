-- 0017_media_kind_canonical.sql
-- Contrato canônico de mídia: união aditiva dos valores históricos locais e SQL.
-- Nenhum valor existente é removido ou remapeado; valores desconhecidos continuam sendo rejeitados.

begin;

alter table public.media_assets drop constraint if exists media_assets_kind_check;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.media_assets'::regclass
      and conname = 'ck_media_assets_kind_canonical'
  ) then
    alter table public.media_assets
      add constraint ck_media_assets_kind_canonical
      check (kind in (
        'avatar', 'banner', 'image', 'audio', 'cover',
        'frame', 'badge', 'background', 'card', 'widget', 'other'
      ));
  end if;
end
$$;

comment on constraint ck_media_assets_kind_canonical on public.media_assets is
  'Contrato canônico compartilhado (@hattz/contracts MEDIA_ASSET_KINDS): 11 valores; aditivo, sem remapeamento.';

commit;
