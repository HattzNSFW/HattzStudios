-- 0015_validator_forbidden_internal_keys.sql
-- Migration aditiva: redefine SOMENTE a função de validação de snapshot publicável com a versão
-- endurecida já paritária com `packages/validation/src/publishableSnapshot.ts` e com os 75 casos
-- de teste de paridade. As migrations 0009/0014 permanecem em seu estado original; ambientes que
-- já as aplicaram recebem esta redefinição sem reescrever histórico de migration.

begin;

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
  -- Equivalente ao conjunto removido por String.prototype.trim() (Unicode White_Space).
  -- Escapes E'' viram caracteres reais na string; a regex os trata literalmente.
  ws_pattern text := E'^[\\t\\n\\v\\f\\r\u0085\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]+|[\\t\\n\\v\\f\\r\u0085\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]+$';
  sv numeric;
begin
  if jsonb_typeof(content) <> 'object' then
    return false;
  end if;

  if octet_length(content::text) > max_total_bytes then
    return false;
  end if;

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
      or (w.key is not null and w.key ~* '(password|credential|secret|token(?!s\y)|session|cookie|recovery|private|draft|admin|internal|audit|role[_]?assignment|permission[_]?override|sync[_]?operation|setting[_]?history|feature[_]?flag|notification|storage[_]?usage|assigned_by|revoked_by|failure_reason|manifest_ref|storage_path|storage_bucket|checksum|ip_hash|user_agent_hash|technical[_]?id|profile[_]?id|is[_]?official|owner)')
      or (jsonb_typeof(w.value) = 'object' and (select count(*) from jsonb_object_keys(case when jsonb_typeof(w.value) = 'object' then w.value else '{}'::jsonb end)) > max_object_keys)
      or (jsonb_typeof(w.value) = 'array' and jsonb_array_length(case when jsonb_typeof(w.value) = 'array' then w.value else '[]'::jsonb end) > max_array_elements)
      or (jsonb_typeof(w.value) = 'string' and length(w.value #>> '{}') > max_string_length)
      or (jsonb_typeof(w.value) = 'number' and (w.value::text in ('NaN','Infinity','-Infinity')))
  ) into has_forbidden;
  if has_forbidden then
    return false;
  end if;

  for k in select jsonb_object_keys(content) loop
    if not (k = any(allowed_root)) then return false; end if;
  end loop;

  if not (content ? 'schemaVersion' and jsonb_typeof(content->'schemaVersion') = 'number') then return false; end if;
  -- JSON `1.0` e `1` são o mesmo número inteiro para o validador TS (Number.isSafeInteger).
  -- Usar `::numeric` evita overflow em valores gigantes e `trunc` rejeita frações.
  sv := (content->>'schemaVersion')::numeric;
  if sv <> trunc(sv) or sv < 1 or sv > 9007199254740991 then return false; end if;

  if not (content ? 'profile' and jsonb_typeof(content->'profile') = 'object') then return false; end if;
  for k in select jsonb_object_keys(content->'profile') loop
    if not (k = any(allowed_profile)) then return false; end if;
  end loop;
  if not (content->'profile' ? 'displayName' and jsonb_typeof(content->'profile'->'displayName') = 'string') then return false; end if;
  if length(regexp_replace(content->'profile'->>'displayName', ws_pattern, '', 'g')) = 0 then return false; end if;
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

commit;
