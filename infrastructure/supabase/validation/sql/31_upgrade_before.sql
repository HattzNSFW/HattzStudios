-- 31_upgrade_before.sql — estado "antes" do upgrade 0001..0014 -> 0015..0017.
-- Executado somente no banco de upgrade descartável, depois de aplicadas as migrations originais
-- até 0014 e ANTES da 0015.
\set ON_ERROR_STOP 1

create table if not exists public.corrective_upgrade_probe (
  label text primary key,
  allowed boolean not null,
  note text not null
);

truncate table public.corrective_upgrade_probe;

do $$
declare
  base jsonb := '{"schemaVersion":1,"profile":{"displayName":"Perfil"},"sections":[]}'::jsonb;
begin
  insert into public.corrective_upgrade_probe (label, allowed, note) values
    ('base', public.validate_publishable_snapshot_content(base), 'snapshot válido');

  insert into public.corrective_upgrade_probe (label, allowed, note)
  select 'forbidden_' || key,
         public.validate_publishable_snapshot_content(base || jsonb_build_object('theme', jsonb_build_object(key, value))),
         'chave interna no estado 0014'
  from (values
    ('technicalId', '"x"'::jsonb),
    ('profile_id', '"x"'::jsonb),
    ('isOfficial', 'true'::jsonb),
    ('owner', '"x"'::jsonb)
  ) as probes(key, value);

  insert into public.profiles (id, technical_id, display_name)
  values ('77777777-0000-0000-0000-000000000001', 'upgrade_existing_tech', 'Dado Preexistente')
  on conflict (id) do nothing;

  insert into public.media_assets (id, profile_id, kind, mime_type, size_bytes)
  values ('77777777-0000-0000-0000-000000000001', '77777777-0000-0000-0000-000000000001',
          'avatar', 'image/png', 7)
  on conflict (id) do nothing;
end
$$;

\echo === 31_upgrade_before: estado pré-upgrade registrado ===
select label, allowed, note from public.corrective_upgrade_probe order by label;
