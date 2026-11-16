-- 0009_hardening_public_views_and_snapshot_validation.sql
-- Hardening: views públicas com colunas explicitamente permitidas, grants mínimos e validação de snapshot publicável.
-- Share deve obter apenas informações efetivamente publicadas, sem colunas internas/administrativas.

begin;

-- Função de validação recursiva de conteúdo publicável (defesa em profundidade no banco).
-- Rejeita chaves proibidas (privado/admin/credenciais/rascunhos/interno) e estrutura fora do schema permitido.
create or replace function public.validate_publishable_snapshot_content(content jsonb)
returns boolean
language plpgsql
immutable
strict
set search_path = pg_catalog, public
as $$
declare
  k text;
  v jsonb;
  allowed_root text[] := array['schemaVersion','profile','sections','theme','effects','seo'];
  allowed_profile text[] := array['displayName','bio','avatarAssetId','bannerAssetId'];
  allowed_section text[] := array['id','type','visible','order','blocks'];
  allowed_block text[] := array['id','type','visible','order','props'];
  allowed_seo text[] := array['title','description'];
  section jsonb;
  blk jsonb;
begin
  if jsonb_typeof(content) <> 'object' then
    return false;
  end if;

  -- chaves proibidas (recursivo)
  if exists (
    with recursive kv as (
      select key, value, value as root
      from jsonb_each(content)
      union all
      select e.key, e.value, e.value
      from kv, lateral jsonb_each(case when jsonb_typeof(kv.value) = 'object' then kv.value else '{}'::jsonb end) e
      union all
      select null::text, elem, elem
      from kv, lateral jsonb_array_elements(case when jsonb_typeof(kv.value) = 'array' then kv.value else '[]'::jsonb end) elem
    )
    select 1 from kv
    where key is not null and key ~* '(password|credential|secret|token|session|cookie|recovery|private|draft|admin|internal|audit|role.?assignment|permission.?override|sync.?operation|setting.?history|feature.?flag|notification|storage.?usage|assigned_by|revoked_by|failure_reason|manifest_ref|storage_path|storage_bucket|checksum|ip_hash|user_agent_hash)'
    limit 1
  ) then
    return false;
  end if;

  -- chaves raiz permitidas
  for k in select jsonb_object_keys(content) loop
    if not (k = any(allowed_root)) then return false; end if;
  end loop;

  if not (content ? 'schemaVersion' and jsonb_typeof(content->'schemaVersion') = 'number') then return false; end if;
  if (content->>'schemaVersion') !~ '^[0-9]+$' then return false; end if;
  if (content->>'schemaVersion')::int < 1 then return false; end if;

  if not (content ? 'profile' and jsonb_typeof(content->'profile') = 'object') then return false; end if;
  for k in select jsonb_object_keys(content->'profile') loop
    if not (k = any(allowed_profile)) then return false; end if;
  end loop;
  if not (content->'profile' ? 'displayName' and jsonb_typeof(content->'profile'->'displayName') = 'string') then return false; end if;
  if length(btrim(content->'profile'->>'displayName')) = 0 then return false; end if;
  if length(content->'profile'->>'displayName') > 80 then return false; end if;

  if not (content ? 'sections' and jsonb_typeof(content->'sections') = 'array') then return false; end if;
  for section in select value from jsonb_array_elements(content->'sections') loop
    if jsonb_typeof(section) <> 'object' then return false; end if;
    for k in select jsonb_object_keys(section) loop
      if not (k = any(allowed_section)) then return false; end if;
    end loop;
    if not (section ? 'id' and jsonb_typeof(section->'id') = 'string' and section->>'id' <> '') then return false; end if;
    if not (section ? 'type' and jsonb_typeof(section->'type') = 'string' and section->>'type' <> '') then return false; end if;
    if not (section ? 'visible' and jsonb_typeof(section->'visible') = 'boolean') then return false; end if;
    if not (section ? 'order' and jsonb_typeof(section->'order') = 'number') then return false; end if;
    if not (section ? 'blocks' and jsonb_typeof(section->'blocks') = 'array') then return false; end if;
    for blk in select value from jsonb_array_elements(section->'blocks') loop
      if jsonb_typeof(blk) <> 'object' then return false; end if;
      for k in select jsonb_object_keys(blk) loop
        if not (k = any(allowed_block)) then return false; end if;
      end loop;
      if not (blk ? 'id' and jsonb_typeof(blk->'id') = 'string' and blk->>'id' <> '') then return false; end if;
      if not (blk ? 'type' and jsonb_typeof(blk->'type') = 'string' and blk->>'type' <> '') then return false; end if;
      if not (blk ? 'visible' and jsonb_typeof(blk->'visible') = 'boolean') then return false; end if;
      if not (blk ? 'order' and jsonb_typeof(blk->'order') = 'number') then return false; end if;
      if not (blk ? 'props' and jsonb_typeof(blk->'props') = 'object') then return false; end if;
    end loop;
  end loop;

  if content ? 'theme' and jsonb_typeof(content->'theme') <> 'object' then return false; end if;
  if content ? 'effects' and jsonb_typeof(content->'effects') <> 'object' then return false; end if;
  if content ? 'seo' then
    if jsonb_typeof(content->'seo') <> 'object' then return false; end if;
    for k in select jsonb_object_keys(content->'seo') loop
      if not (k = any(allowed_seo)) then return false; end if;
    end loop;
  end if;

  return true;
end;
$$;

revoke all on function public.validate_publishable_snapshot_content(jsonb) from public;
grant execute on function public.validate_publishable_snapshot_content(jsonb) to postgres, service_role;

create or replace function public.enforce_publishable_snapshot()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if not public.validate_publishable_snapshot_content(new.content) then
    raise exception 'Snapshot content is not publishable (forbidden/private/internal fields or invalid schema).';
  end if;
  if new.visibility not in ('public', 'unpublished') then
    raise exception 'Invalid snapshot visibility.';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_publishable_snapshot() from public;
grant execute on function public.enforce_publishable_snapshot() to postgres, service_role;

drop trigger if exists trg_validate_publishable_snapshot on public.profile_public_snapshots;
create trigger trg_validate_publishable_snapshot
before insert or update of content, visibility on public.profile_public_snapshots
for each row execute function public.enforce_publishable_snapshot();

-- Views seguras de leitura pública (campos explicitamente permitidos)
-- security_invoker=false (definer) intencional: tabelas base não têm grants para anon/authenticated (0008).
-- A view executa com privilégios do owner (postgres/superuser no contexto de migration) mas expõe APENAS
-- colunas/linhas explicitamente selecionadas e filtradas. search_path fixo e sem exposição de dados sensíveis.
-- Isso evita acesso direto às tabelas base e impede que chamadas públicas leiam colunas internas/admin.

create or replace view public.v_share_published_profiles
with (security_barrier = true)
as
select
  ps.slug,
  s.version as profile_version,
  pub.published_at,
  s.seo_title,
  s.seo_description,
  s.content
from public.profile_public_snapshots s
join public.profile_publications pub on pub.id = s.publication_id
join public.profile_slugs ps on ps.profile_id = s.profile_id and ps.is_current = true
where
  s.visibility = 'public'
  and pub.state = 'published';

comment on view public.v_share_published_profiles is
'Leitura pública Share: apenas perfis efetivamente publicados (campos permitidos). Sem IDs internos, falhas, manifests, paths ou metadados administrativos.';

-- Metadados públicos mínimos de mídia (sem storage paths/buckets/checksum/metadata interna/profile_id)
create or replace view public.v_share_public_media
with (security_barrier = true)
as
select
  a.id as asset_id,
  a.kind,
  a.mime_type,
  a.width,
  a.height,
  v.variant,
  v.format,
  v.width as variant_width,
  v.height as variant_height
from public.media_assets a
join public.media_variants v on v.asset_id = a.id
where a.is_public = true and a.status = 'active';

comment on view public.v_share_public_media is
'Leitura pública Share: metadados não sensíveis de mídia pública ativa. Paths/buckets/checksums/metadata interna não expostos.';

revoke all on public.v_share_published_profiles from public;
revoke all on public.v_share_public_media from public;
grant select on public.v_share_published_profiles to anon, authenticated;
grant select on public.v_share_public_media to anon, authenticated;

commit;
