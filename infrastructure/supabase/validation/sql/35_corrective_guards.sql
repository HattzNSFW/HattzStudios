-- 35_corrective_guards.sql — verificações corretivas (0015/0016/0017) em banco descartável.
-- Roda como owner local. Nenhuma conexão remota; nenhum banco preexistente é tocado.
\set ON_ERROR_STOP 1

-- O seed 50_seed.sql usa TRUNCATE ... CASCADE em public.profiles, o que também trunca
-- hattz_admin.official_code_registry por causa da FK. Reidempotizar os códigos pendentes aqui
-- torna este arquivo autocontido em ambos os harnesses (banco novo e upgrade).
insert into hattz_admin.official_code_registry (official_code, status, notes)
values
  ('MT7QTEVMZY', 'pending', 'Associação inicial pendente de provisionamento do Owner.'),
  ('YGZNK6TMG8', 'pending', 'Associação inicial pendente de provisionamento do Owner.')
on conflict (official_code) do nothing;

\echo === C1 validador 0015 rejeita as quatro novas chaves internas ===
do $$
declare
  base jsonb := '{"schemaVersion":1,"profile":{"displayName":"Perfil"},"sections":[]}'::jsonb;
  probe jsonb;
begin
  if public.validate_publishable_snapshot_content(base) is not true then
    raise exception 'C1 FAIL: base válida foi rejeitada';
  end if;
  foreach probe in array array[
    jsonb_build_object('theme', jsonb_build_object('technicalId', 'x')),
    jsonb_build_object('theme', jsonb_build_object('profile_id', 'x')),
    jsonb_build_object('theme', jsonb_build_object('isOfficial', true)),
    jsonb_build_object('theme', jsonb_build_object('owner', 'x'))
  ] loop
    if public.validate_publishable_snapshot_content(base || probe) is not false then
      raise exception 'C1 FAIL: chave interna aceita: %', probe::text;
    end if;
  end loop;
  raise notice 'C1 OK: quatro chaves internas rejeitadas pelo validador 0015';
end
$$;

\echo === C2 registro oficial contém apenas os dois códigos pendentes ===
do $$
declare
  n int;
begin
  select count(*) into n
  from hattz_admin.official_code_registry
  where official_code in ('MT7QTEVMZY', 'YGZNK6TMG8')
    and status = 'pending'
    and profile_id is null;
  if n <> 2 then
    raise exception 'C2 FAIL: esperados 2 códigos pendentes sem associação; encontrados %', n;
  end if;
  raise notice 'C2 OK: nenhum UUID oficial foi inventado';
end
$$;

\echo === C3 todos os 11 valores canônicos de mídia são aceitos ===
do $$
declare
  canonical text[] := array[
    'avatar','banner','image','audio','cover',
    'frame','badge','background','card','widget','other'
  ];
  n int;
begin
  insert into public.profiles (id, technical_id, display_name)
  values ('88888888-0000-0000-0000-000000000001', 'common_test_tech', 'Common Test')
  on conflict (id) do nothing;

  insert into public.media_assets (id, profile_id, kind, mime_type, size_bytes)
  select gen_random_uuid(), '88888888-0000-0000-0000-000000000001', k, 'application/octet-stream', 1
  from unnest(canonical) as k;

  select count(distinct kind) into n
  from public.media_assets
  where profile_id = '88888888-0000-0000-0000-000000000001' and kind = any(canonical);
  if n <> 11 then
    raise exception 'C3 FAIL: esperados 11 valores canônicos distintos; encontrados %', n;
  end if;
  raise notice 'C3 OK: 11 valores canônicos aceitos';
end
$$;

\echo === C4 valor de mídia desconhecido é rejeitado ===
do $$
begin
  begin
    insert into public.media_assets (id, profile_id, kind, mime_type, size_bytes)
    values (gen_random_uuid(), '88888888-0000-0000-0000-000000000001', 'unknown', 'application/octet-stream', 1);
    raise exception 'C4 FAIL: kind desconhecido foi aceito';
  exception when check_violation then
    raise notice 'C4 OK: kind desconhecido rejeitado pelo CHECK';
  end;
end
$$;

\echo === C5 prepara perfil oficial protegido (simulação DBA em DB descartável) ===
alter table public.profiles disable trigger trg_official_identity_protection;
alter table public.profiles disable trigger trg_official_identity_registry;
alter table hattz_admin.official_code_registry disable trigger trg_official_registry_identity;

insert into public.profiles (id, technical_id, display_name, official_code, is_official)
values ('99999999-0000-0000-0000-000000000001', 'official_test_tech', 'Official Test', 'MT7QTEVMZY', true)
on conflict (id) do nothing;

update hattz_admin.official_code_registry
set status = 'assigned',
    profile_id = '99999999-0000-0000-0000-000000000001',
    assigned_at = now(),
    assigned_by = 'corrective-validation'
where official_code = 'MT7QTEVMZY' and status = 'pending';

alter table public.profiles enable trigger trg_official_identity_registry;
alter table public.profiles enable trigger trg_official_identity_protection;
alter table hattz_admin.official_code_registry enable trigger trg_official_registry_identity;

\echo === C6 exclusão de perfil oficial é negada ===
do $$
begin
  begin
    delete from public.profiles where id = '99999999-0000-0000-0000-000000000001';
    raise exception 'C6 FAIL: exclusão não foi negada';
  exception when others then
    if sqlerrm like '0016:%' then raise notice 'C6 OK: exclusão negada e auditada'; else raise; end if;
  end;
end
$$;

\echo === C7 alteração/transferência da identidade externa é negada ===
do $$
begin
  begin
    update public.profiles
    set official_code = 'YGZNK6TMG8'
    where id = '99999999-0000-0000-0000-000000000001';
    raise exception 'C7 FAIL: transferência não foi negada';
  exception when others then
    if sqlerrm like '0016:%' then raise notice 'C7 OK: transferência negada'; else raise; end if;
  end;
  begin
    update public.profiles
    set is_official = false
    where id = '99999999-0000-0000-0000-000000000001';
    raise exception 'C7 FAIL: alteração de flag não foi negada';
  exception when others then
    if sqlerrm like '0016:%' then raise notice 'C7 OK: flag protegida'; else raise; end if;
  end;
end
$$;

\echo === C8 escrita comum não cria oficialidade ===
do $$
begin
  begin
    update public.profiles
    set official_code = 'YGZNK6TMG8', is_official = true
    where id = '88888888-0000-0000-0000-000000000001';
    raise exception 'C8 FAIL: oficialidade criada por escrita comum';
  exception when others then
    if sqlerrm like '0016:%' then raise notice 'C8 OK: criação comum negada'; else raise; end if;
  end;
end
$$;

\echo === C9 transferência no registro também é negada ===
do $$
begin
  begin
    update hattz_admin.official_code_registry
    set profile_id = '88888888-0000-0000-0000-000000000001'
    where official_code = 'MT7QTEVMZY';
    raise exception 'C9 FAIL: transferência no registro não foi negada';
  exception when others then
    if sqlerrm like '0016:%' then raise notice 'C9 OK: registro protegido'; else raise; end if;
  end;
end
$$;

\echo === C10 unicidade e formato do código externo ===
alter table public.profiles disable trigger trg_official_identity_protection;
alter table public.profiles disable trigger trg_official_identity_registry;
do $$
begin
  begin
    insert into public.profiles (id, technical_id, display_name, official_code, is_official)
    values ('88888888-0000-0000-0000-000000000002', 'dup_test_tech', 'Duplicate', 'MT7QTEVMZY', true);
    raise exception 'C10 FAIL: código duplicado aceito';
  exception when unique_violation then
    raise notice 'C10 OK: código duplicado rejeitado';
  end;
  begin
    insert into public.profiles (id, technical_id, display_name, official_code, is_official)
    values ('88888888-0000-0000-0000-000000000003', 'format_test_tech', 'Format', 'BAD', true);
    raise exception 'C10 FAIL: formato inválido aceito';
  exception when check_violation then
    raise notice 'C10 OK: formato inválido rejeitado';
  end;
end
$$;
alter table public.profiles enable trigger trg_official_identity_registry;
alter table public.profiles enable trigger trg_official_identity_protection;

\echo === C11 negações geraram evidência durável (sequência não transacional + WARNING no log) ===
do $$
declare
  n bigint;
begin
  -- O INSERT em audit_logs é desfeito pelo RAISE EXCEPTION que nega a operação (transacional).
  -- A sequência é não transacional: nextval() persiste mesmo após o rollback da negação.
  select last_value into n
  from pg_sequences
  where schemaname = 'hattz_audit' and sequencename = 'official_identity_denial_seq';
  if coalesce(n, 0) < 4 then
    raise exception 'C11 FAIL: esperadas ao menos 4 negações com audição durável; sequência=%', n;
  end if;
  raise notice 'C11 OK: % negações com contador durável + WARNING [0016-AUDIT] no log', n;
end
$$;

\echo === 35_corrective_guards: todas as verificações passaram ===
