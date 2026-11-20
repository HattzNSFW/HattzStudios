-- 0009_hardening_public_views_and_snapshot_validation.sql (audit-adjusted)
-- Hardening: validação de snapshot publicável (DB) e views públicas com colunas explicitamente permitidas.
-- Views em security_invoker=true para respeitar privilégios/RLS do chamador; combinadas com grants mínimos de coluna
-- e policies restritas em 0008 (defesa em profundidade, menor privilégio).

begin;

-- Função de validação recursiva de conteúdo publicável (defesa em profundidade no banco).
-- Alinhada ao contrato TypeScript: chaves proibidas recursivas, schema explícito, limites e estruturas
-- controladas/extensíveis (props/theme/effects) sem aceitar payloads arbitrários ilimitados.
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
  max_total_bytes int := 262144;
  max_depth int := 12;
  max_sections int := 50;
  max_blocks_per_section int := 50;
  max_array_elements int := 100;
  max_object_keys int := 50;
  max_string_length int := 2000;
  has_forbidden boolean;
begin
  if jsonb_typeof(content) <> 'object' then
    return false;
  end if;

  -- limite de tamanho total
  if octet_length(content::text) > max_total_bytes then
    return false;
  end if;

  -- chaves proibidas + limites estruturais básicos recursivos (profundidade, chaves, arrays, strings, tipos)
  with recursive walk(key, value, depth) as (
    select e.key, e.value, 1
    from jsonb_each(content) e
    union all
    select c.key, c.value, w.depth + 1
    from walk w
    cross join lateral (
      select ce.key, ce.value
      from jsonb_each(case when jsonb_typeof(w.value) = 'object' then w.value else '{}'::jsonb end) ce
      where jsonb_typeof(w.value) = 'object'
      union all
      select null::text as key, ae.elem as value
      from jsonb_array_elements(case when jsonb_typeof(w.value) = 'array' then w.value else '[]'::jsonb end) ae(elem)
      where jsonb_typeof(w.value) = 'array'
    ) c
    where w.depth < 100
  )
  select exists (
    select 1
    from walk w
    where
      w.depth > max_depth
      -- Nota: em PostgreSQL `\b` NÃO é fronteira de palavra (usa-se `\y`). O padrão precisa
      -- permitir `tokens` (design tokens) tal como o validador TypeScript (JS `\b`), senão o
      -- conteúdo válido seria rejeitado no banco e aceito no app (divergência TS↔SQL).
      or (w.key is not null and w.key ~* '(password|credential|secret|token(?!s\y)|session|cookie|recovery|private|draft|admin|internal|audit|role[_]?assignment|permission[_]?override|sync[_]?operation|setting[_]?history|feature[_]?flag|notification|storage[_]?usage|assigned_by|revoked_by|failure_reason|manifest_ref|storage_path|storage_bucket|checksum|ip_hash|user_agent_hash|technical[_]?id|profile[_]?id|is[_]?official|owner)')
      or (jsonb_typeof(w.value) = 'object' and (select count(*) from jsonb_object_keys(case when jsonb_typeof(w.value) = 'object' then w.value else '{}'::jsonb end)) > max_object_keys)
      or (jsonb_typeof(w.value) = 'array' and jsonb_array_length(case when jsonb_typeof(w.value) = 'array' then w.value else '[]'::jsonb end) > max_array_elements)
      or (jsonb_typeof(w.value) = 'string' and length(w.value #>> '{}') > max_string_length)
      or (jsonb_typeof(w.value) = 'number' and (w.value::text in ('NaN','Infinity','-Infinity')))
  ) into has_forbidden;
  if has_forbidden then
    return false;
  end if;

  -- chaves raiz permitidas
  for k in select jsonb_object_keys(content) loop
    if not (k = any(allowed_root)) then return false; end if;
  end loop;

  if not (content ? 'schemaVersion' and jsonb_typeof(content->'schemaVersion') = 'number') then return false; end if;
  -- Parity with the TS validator: positive integer within the JS safe-integer range.
  -- `::int` would overflow (error) on huge values; `::numeric` avoids the error and the
  -- upper bound keeps SQL and TS aligned (TS uses Number.isSafeInteger).
  if (content->>'schemaVersion') !~ '^[0-9]+$' then return false; end if;
  if (content->>'schemaVersion')::numeric < 1
     or (content->>'schemaVersion')::numeric > 9007199254740991 then
    return false;
  end if;

  -- profile
  if not (content ? 'profile' and jsonb_typeof(content->'profile') = 'object') then return false; end if;
  for k in select jsonb_object_keys(content->'profile') loop
    if not (k = any(allowed_profile)) then return false; end if;
  end loop;
  if not (content->'profile' ? 'displayName' and jsonb_typeof(content->'profile'->'displayName') = 'string') then return false; end if;
  if length(btrim(content->'profile'->>'displayName')) = 0 then return false; end if;
  if length(content->'profile'->>'displayName') > 80 then return false; end if;
  if content->'profile' ? 'bio' then
    if jsonb_typeof(content->'profile'->'bio') <> 'string' then return false; end if;
    if length(content->'profile'->>'bio') > 2000 then return false; end if;
  end if;
  if content->'profile' ? 'avatarAssetId' then
    if jsonb_typeof(content->'profile'->'avatarAssetId') <> 'string' then return false; end if;
    if content->'profile'->>'avatarAssetId' !~ '^[a-zA-Z0-9_-]{1,128}$' then return false; end if;
  end if;
  if content->'profile' ? 'bannerAssetId' then
    if jsonb_typeof(content->'profile'->'bannerAssetId') <> 'string' then return false; end if;
    if content->'profile'->>'bannerAssetId' !~ '^[a-zA-Z0-9_-]{1,128}$' then return false; end if;
  end if;

  -- sections / blocks
  if not (content ? 'sections' and jsonb_typeof(content->'sections') = 'array') then return false; end if;
  if jsonb_array_length(content->'sections') > max_sections then return false; end if;
  for section in select value from jsonb_array_elements(content->'sections') loop
    if jsonb_typeof(section) <> 'object' then return false; end if;
    for k in select jsonb_object_keys(section) loop
      if not (k = any(allowed_section)) then return false; end if;
    end loop;
    if not (section ? 'id' and jsonb_typeof(section->'id') = 'string' and section->>'id' <> '') then return false; end if;
    if section->>'id' !~ '^[a-zA-Z0-9_-]{1,128}$' then return false; end if;
    if not (section ? 'type' and jsonb_typeof(section->'type') = 'string' and section->>'type' <> '') then return false; end if;
    if section->>'type' !~ '^[a-zA-Z0-9_-]{1,64}$' then return false; end if;
    if not (section ? 'visible' and jsonb_typeof(section->'visible') = 'boolean') then return false; end if;
    if not (section ? 'order' and jsonb_typeof(section->'order') = 'number') then return false; end if;
    if not (section ? 'blocks' and jsonb_typeof(section->'blocks') = 'array') then return false; end if;
    if jsonb_array_length(section->'blocks') > max_blocks_per_section then return false; end if;
    for blk in select value from jsonb_array_elements(section->'blocks') loop
      if jsonb_typeof(blk) <> 'object' then return false; end if;
      for k in select jsonb_object_keys(blk) loop
        if not (k = any(allowed_block)) then return false; end if;
      end loop;
      if not (blk ? 'id' and jsonb_typeof(blk->'id') = 'string' and blk->>'id' <> '') then return false; end if;
      if blk->>'id' !~ '^[a-zA-Z0-9_-]{1,128}$' then return false; end if;
      if not (blk ? 'type' and jsonb_typeof(blk->'type') = 'string' and blk->>'type' <> '') then return false; end if;
      if blk->>'type' !~ '^[a-zA-Z0-9_-]{1,64}$' then return false; end if;
      if not (blk ? 'visible' and jsonb_typeof(blk->'visible') = 'boolean') then return false; end if;
      if not (blk ? 'order' and jsonb_typeof(blk->'order') = 'number') then return false; end if;
      if not (blk ? 'props' and jsonb_typeof(blk->'props') = 'object') then return false; end if;
      -- props: extensível porém tipado/controlado (chaves seguras, sem estruturas arbitrárias ilimitadas)
      if exists (
        with recursive p(key, value, depth) as (
          select e.key, e.value, 1 from jsonb_each(blk->'props') e
          union all
          select c.key, c.value, p.depth + 1
          from p
          cross join lateral (
            select ce.key, ce.value from jsonb_each(case when jsonb_typeof(p.value) = 'object' then p.value else '{}'::jsonb end) ce where jsonb_typeof(p.value) = 'object'
            union all
            select null::text, ae.elem from jsonb_array_elements(case when jsonb_typeof(p.value) = 'array' then p.value else '[]'::jsonb end) ae(elem) where jsonb_typeof(p.value) = 'array'
          ) c
          where p.depth < 100
        )
        select 1 from p
        where (p.key is not null and p.key !~ '^[a-zA-Z0-9_-]{1,64}$')
           or jsonb_typeof(p.value) not in ('object','array','string','number','boolean','null')
      ) then
        return false;
      end if;
    end loop;
  end loop;

  -- theme/effects: extensíveis porém tipados/controlados
  if content ? 'theme' then
    if jsonb_typeof(content->'theme') <> 'object' then return false; end if;
    if exists (
      with recursive t(key, value, depth) as (
        select e.key, e.value, 1 from jsonb_each(content->'theme') e
        union all
        select c.key, c.value, t.depth + 1
        from t
        cross join lateral (
          select ce.key, ce.value from jsonb_each(case when jsonb_typeof(t.value) = 'object' then t.value else '{}'::jsonb end) ce where jsonb_typeof(t.value) = 'object'
          union all
          select null::text, ae.elem from jsonb_array_elements(case when jsonb_typeof(t.value) = 'array' then t.value else '[]'::jsonb end) ae(elem) where jsonb_typeof(t.value) = 'array'
        ) c
        where t.depth < 100
      )
      select 1 from t
      where (t.key is not null and t.key !~ '^[a-zA-Z0-9_-]{1,64}$')
         or jsonb_typeof(t.value) not in ('object','array','string','number','boolean','null')
    ) then return false; end if;
  end if;
  if content ? 'effects' then
    if jsonb_typeof(content->'effects') <> 'object' then return false; end if;
    if exists (
      with recursive fx(key, value, depth) as (
        select e.key, e.value, 1 from jsonb_each(content->'effects') e
        union all
        select c.key, c.value, fx.depth + 1
        from fx
        cross join lateral (
          select ce.key, ce.value from jsonb_each(case when jsonb_typeof(fx.value) = 'object' then fx.value else '{}'::jsonb end) ce where jsonb_typeof(fx.value) = 'object'
          union all
          select null::text, ae.elem from jsonb_array_elements(case when jsonb_typeof(fx.value) = 'array' then fx.value else '[]'::jsonb end) ae(elem) where jsonb_typeof(fx.value) = 'array'
        ) c
        where fx.depth < 100
      )
      select 1 from fx
      where (fx.key is not null and fx.key !~ '^[a-zA-Z0-9_-]{1,64}$')
         or jsonb_typeof(fx.value) not in ('object','array','string','number','boolean','null')
    ) then return false; end if;
  end if;

  -- seo
  if content ? 'seo' then
    if jsonb_typeof(content->'seo') <> 'object' then return false; end if;
    for k in select jsonb_object_keys(content->'seo') loop
      if not (k = any(allowed_seo)) then return false; end if;
    end loop;
    if content->'seo' ? 'title' then
      if jsonb_typeof(content->'seo'->'title') <> 'string' then return false; end if;
      if length(content->'seo'->>'title') > 120 then return false; end if;
    end if;
    if content->'seo' ? 'description' then
      if jsonb_typeof(content->'seo'->'description') <> 'string' then return false; end if;
      if length(content->'seo'->>'description') > 300 then return false; end if;
    end if;
  end if;

  return true;
end;
$$;

revoke all on function public.validate_publishable_snapshot_content(jsonb) from public, anon, authenticated;
grant execute on function public.validate_publishable_snapshot_content(jsonb) to postgres, service_role;

create or replace function public.enforce_publishable_snapshot()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  -- `validate_publishable_snapshot_content` is declared STRICT: a SQL NULL `new.content`
  -- makes the function return SQL NULL, and `NOT NULL` is NULL (not TRUE). Using
  -- `if not ... then` would therefore silently skip the guard on a NULL result (fail open).
  -- Reject anything that is not exactly TRUE so a NULL/non-boolean result is a hard failure.
  -- (The column is also NOT NULL DEFAULT '{}', so this is defense in depth, not the only guard.)
  if public.validate_publishable_snapshot_content(new.content) is not true then
    raise exception 'Snapshot content is not publishable (forbidden/private/internal fields or invalid schema).';
  end if;
  -- Same reasoning for visibility: `NULL not in (...)` is NULL, which would skip the guard.
  -- Explicitly reject NULL and any value outside the public/unpublished contract.
  if new.visibility is null or new.visibility not in ('public', 'unpublished') then
    raise exception 'Invalid snapshot visibility.';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_publishable_snapshot() from public, anon, authenticated;
grant execute on function public.enforce_publishable_snapshot() to postgres, service_role;

drop trigger if exists trg_validate_publishable_snapshot on public.profile_public_snapshots;
create trigger trg_validate_publishable_snapshot
before insert or update of content, visibility on public.profile_public_snapshots
for each row execute function public.enforce_publishable_snapshot();

-- Views seguras de leitura pública (campos explicitamente permitidos)
-- security_invoker=true: o chamador (anon/authenticated) é avaliado por privilégios e RLS (0008).
-- security_barrier=true: evita vazamento por otimizações. Interface explícita; sem acesso direto a colunas/tabelas internas.

create or replace view public.v_share_published_profiles
with (security_invoker = true, security_barrier = true)
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
with (security_invoker = true, security_barrier = true)
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

revoke all on public.v_share_published_profiles from public, anon, authenticated;
revoke all on public.v_share_public_media from public, anon, authenticated;
grant select on public.v_share_published_profiles to anon, authenticated;
grant select on public.v_share_public_media to anon, authenticated;

commit;
