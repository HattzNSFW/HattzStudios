-- 0011_snapshot_publication_identity_integrity.sql
-- Impede que um snapshot use a publicação de um perfil e o profile_id/version de outro.
-- A FK composta mantém a identidade do snapshot coerente com a publicação referenciada.
-- Migration aditiva e preservadora: não apaga nem reescreve snapshots existentes.
--
-- Motivação: antes desta migration, profile_public_snapshots tinha três vínculos
-- independentes (publication_id -> profile_publications.id, profile_id -> profiles.id e
-- version sem vínculo). Nada garantia que o profile_id/version do snapshot fossem os da
-- publicação referenciada, permitindo identidade incoerente (ex.: snapshot apontando para
-- a publicação do perfil A com o profile_id/version do perfil B). A FK composta fecha essa
-- brecha sem introduzir SECURITY DEFINER/BYPASSRLS nem alterar policies.
--
-- Idempotência: a existência das constraints é verificada pela DEFINIÇÃO (colunas e tipo),
-- não apenas pelo nome. Assim a migration é segura para reaplicação mesmo que as
-- constraints já existam com outro nome, e não cria duplicatas redundantes.

begin;

-- A FK composta exige uma chave candidata com exatamente as colunas referenciadas
-- (id, profile_id, version). Verifica por definição (contype/conkey), não por nome.
do $$
begin
  if not exists (
    select 1
    from pg_constraint con
    where con.conrelid = 'public.profile_publications'::regclass
      and con.contype = 'u'
      and (
        select array_agg(a.attname::text order by a.attname::text)
        from unnest(con.conkey) as k(attnum)
        join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum
      ) = array['id', 'profile_id', 'version']
  ) then
    alter table public.profile_publications
      add constraint uq_profile_publications_identity_version
      unique (id, profile_id, version);
  end if;
end;
$$;

-- Pré-checagem diagnóstica: em um banco que já possua dados, a FK composta só pode ser
-- criada se todo snapshot corresponder exatamente à publicação referenciada. Falhar aqui
-- produz uma mensagem clara em vez de um erro genérico de constraint. Como toda a migration
-- roda em uma única transação, o `raise exception` reverte com segurança qualquer DDL já
-- aplicada nesta migration (nada fica parcialmente aplicado).
do $$
declare
  mismatch_count bigint;
begin
  select count(*)
    into mismatch_count
  from public.profile_public_snapshots s
  left join public.profile_publications p on p.id = s.publication_id
  where p.id is null
     or s.profile_id <> p.profile_id
     or s.version <> p.version;

  if mismatch_count > 0 then
    raise exception
      'Nao e possivel aplicar a FK composta de identidade (0011): % snapshot(s) com profile_id/version divergentes da publicacao referenciada. Corrija os dados antes de aplicar esta migration.',
      mismatch_count;
  end if;
end;
$$;

-- Remove qualquer FK anterior de profile_public_snapshots que referencie apenas
-- profile_publications(id) (a FK simples substituída), identificada por definição para não
-- depender do nome gerado. A FK composta só é criada depois que a chave candidata existe.
do $$
declare
  c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.profile_public_snapshots'::regclass
      and con.contype = 'f'
      and con.confrelid = 'public.profile_publications'::regclass
      and (
        select array_agg(a.attname::text order by a.attname::text)
        from unnest(con.conkey) as k(attnum)
        join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum
      ) = array['publication_id']
  loop
    execute format('alter table public.profile_public_snapshots drop constraint %I', c.conname);
  end loop;
end;
$$;

-- Cria a FK composta se ainda não existir uma equivalente (mesmas colunas locais e
-- referenciadas), verificada por definição.
do $$
begin
  if not exists (
    select 1
    from pg_constraint con
    where con.conrelid = 'public.profile_public_snapshots'::regclass
      and con.contype = 'f'
      and con.confrelid = 'public.profile_publications'::regclass
      and (
        select array_agg(a.attname::text order by a.attname::text)
        from unnest(con.conkey) as k(attnum)
        join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum
      ) = array['profile_id', 'publication_id', 'version']
      and (
        select array_agg(a.attname::text order by a.attname::text)
        from unnest(con.confkey) as k(attnum)
        join pg_attribute a on a.attrelid = con.confrelid and a.attnum = k.attnum
      ) = array['id', 'profile_id', 'version']
  ) then
    alter table public.profile_public_snapshots
      add constraint fk_profile_public_snapshots_publication_identity
      foreign key (publication_id, profile_id, version)
      references public.profile_publications (id, profile_id, version)
      on delete restrict;
  end if;
end;
$$;

-- A constraint nomeada deve existir ao final (recém-criada ou pré-existente com este nome).
-- Se uma FK equivalente já existia com outro nome, o bloco acima não a recria; o comentário
-- é aplicado apenas quando a constraint canônica existe.
do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.profile_public_snapshots'::regclass
      and conname = 'fk_profile_public_snapshots_publication_identity'
  ) then
    execute $c$
      comment on constraint fk_profile_public_snapshots_publication_identity
        on public.profile_public_snapshots is
        'Garante que publication_id, profile_id e version do snapshot correspondam à mesma publicação.'
    $c$;
  end if;
end;
$$;

commit;
