-- 36_upgrade_after.sql — comparação antes/depois e integridade dos dados no upgrade.
\set ON_ERROR_STOP 1

\echo === U1 validador mudou exatamente nas quatro chaves internas ===
do $$
declare
  base jsonb := '{"schemaVersion":1,"profile":{"displayName":"Perfil"},"sections":[]}'::jsonb;
  probe jsonb;
  unexpected int;
begin
  if public.validate_publishable_snapshot_content(base) is not true then
    raise exception 'U1 FAIL: snapshot válido passou a ser rejeitado';
  end if;

  foreach probe in array array[
    jsonb_build_object('theme', jsonb_build_object('technicalId', 'x')),
    jsonb_build_object('theme', jsonb_build_object('profile_id', 'x')),
    jsonb_build_object('theme', jsonb_build_object('isOfficial', true)),
    jsonb_build_object('theme', jsonb_build_object('owner', 'x'))
  ] loop
    if public.validate_publishable_snapshot_content(base || probe) is not false then
      raise exception 'U1 FAIL: chave interna ainda aceita após 0015: %', probe::text;
    end if;
  end loop;

  select count(*) into unexpected
  from public.corrective_upgrade_probe
  where label like 'forbidden_%' and allowed is distinct from true;
  if unexpected <> 0 then
    raise exception 'U1 FAIL: % chave(s) não era(m) aceita(s) antes da 0015', unexpected;
  end if;
  raise notice 'U1 OK: 4 chaves passaram de aceitas para rejeitadas; base inalterada';
end
$$;

\echo === U2 dados preexistentes permanecem intactos ===
do $$
declare
  n int;
begin
  select count(*) into n
  from public.profiles
  where id = '77777777-0000-0000-0000-000000000001'
    and technical_id = 'upgrade_existing_tech'
    and display_name = 'Dado Preexistente'
    and official_code is null
    and is_official = false;
  if n <> 1 then raise exception 'U2 FAIL: perfil preexistente alterado'; end if;

  select count(*) into n
  from public.media_assets
  where id = '77777777-0000-0000-0000-000000000001'
    and kind = 'avatar'
    and mime_type = 'image/png'
    and size_bytes = 7;
  if n <> 1 then raise exception 'U2 FAIL: mídia preexistente alterada'; end if;
  raise notice 'U2 OK: perfil e mídia preexistentes intactos';
end
$$;

\echo === U3 estruturas aditivas presentes ===
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'official_code'
  ) then raise exception 'U3 FAIL: profiles.official_code ausente'; end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.media_assets'::regclass and conname = 'ck_media_assets_kind_canonical'
  ) then raise exception 'U3 FAIL: CHECK canônico de mídia ausente'; end if;
  raise notice 'U3 OK: 0016 e 0017 aplicadas sobre o estado 0014';
end
$$;

\echo === 36_upgrade_after: upgrade validado ===
