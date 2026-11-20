-- 0016_official_identity_protection.sql
-- Identidade externa dos perfis oficiais, separada de `technical_id`, UUID, slug, role e conteúdo.
-- Os códigos MT7QTEVMZY e YGZNK6TMG8 são registrados como PENDENTES: não há evidência neste
-- repositório de perfis existentes para associá-los, portanto nenhum UUID é inventado.
--
-- PROTEÇÃO: operações que criam/alteram/transferem/excluem identidade oficial são negadas por
-- trigger BEFORE e registradas em hattz_audit.audit_logs. Não existe autoridade administrativa
-- confiável implementada nesta fase: a exceção permanece FECHADA até o Owner definir o
-- procedimento real. Não há SECURITY DEFINER, BYPASSRLS, parâmetro de cliente, flag de frontend,
-- localStorage/IndexedDB, papel público OWNER/VIP nem variável de ambiente como autoridade.

begin;

-- Registro de códigos externos permitidos. `profile_id` é a associação persistente com profiles.id.
create table if not exists hattz_admin.official_code_registry (
  official_code text primary key check (official_code ~ '^[A-Z0-9]{10}$'),
  status text not null default 'pending' check (status in ('pending', 'assigned', 'retired')),
  profile_id uuid unique references public.profiles(id) on update restrict on delete restrict,
  assigned_at timestamptz,
  assigned_by text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ck_official_registry_assignment check ((status = 'assigned') = (profile_id is not null))
);

alter table hattz_admin.official_code_registry enable row level security;

revoke all on table hattz_admin.official_code_registry from public, anon, authenticated;
revoke all on schema hattz_admin from public, anon, authenticated;

drop policy if exists official_registry_read_trusted on hattz_admin.official_code_registry;
create policy official_registry_read_trusted
on hattz_admin.official_code_registry
for select
to postgres, service_role
using (true);

-- Coluna própria na tabela de perfis; não é technical_id, UUID, slug, role nem conteúdo.
alter table public.profiles add column if not exists official_code text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass and conname = 'ck_profiles_official_code_format'
  ) then
    alter table public.profiles
      add constraint ck_profiles_official_code_format
      check (official_code is null or official_code ~ '^[A-Z0-9]{10}$');
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass and conname = 'uq_profiles_official_code'
  ) then
    alter table public.profiles
      add constraint uq_profiles_official_code unique (official_code);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass and conname = 'fk_profiles_official_code_registry'
  ) then
    alter table public.profiles
      add constraint fk_profiles_official_code_registry
      foreign key (official_code)
      references hattz_admin.official_code_registry(official_code)
      on update restrict on delete restrict;
  end if;
end
$$;

comment on column public.profiles.official_code is
  'Identificador externo oficial; não é technical_id, UUID, slug, role nem conteúdo. Somente provisão autorizada pelo Owner.';

-- Verificação antes de qualquer backfill: se houver indícios de perfis correspondentes, exigir
-- decisão do Owner em vez de inventar associação. Nenhum backfill é realizado por esta migration.
do $$
declare
  hits int;
begin
  select count(*) into hits
  from public.profiles p
  left join public.profile_slugs s
    on s.profile_id = p.id and s.is_current = true
  where upper(p.technical_id) in ('MT7QTEVMZY', 'YGZNK6TMG8')
     or upper(coalesce(p.display_name, '')) in ('MT7QTEVMZY', 'YGZNK6TMG8')
     or upper(coalesce(s.slug, '')) in ('MT7QTEVMZY', 'YGZNK6TMG8');
  if hits > 0 then
    raise exception
      '0016: found % possible profile(s) matching official codes; Owner provisioning decision required (no automatic backfill).',
      hits;
  end if;
end
$$;

insert into hattz_admin.official_code_registry (official_code, status, notes)
values
  ('MT7QTEVMZY', 'pending', 'Associação inicial pendente de provisionamento do Owner.'),
  ('YGZNK6TMG8', 'pending', 'Associação inicial pendente de provisionamento do Owner.')
on conflict (official_code) do nothing;

-- Trilha de auditoria das tentativas negadas. A tabela 0006 já possui RLS FORCE; o insert é feito
-- por trigger SECURITY INVOKER com policy explícita e grants mínimos, sem SECURITY DEFINER.
--
-- NOTA TRANSACIONAL (importante): no PostgreSQL, um RAISE EXCEPTION aborta a transação/statement e
-- desfaz QUALQUER linha gravada no mesmo contexto — inclusive o INSERT em audit_logs feito pelo
-- trigger. Como a exceção é justamente o mecanismo de negação fail-closed, o registro relacional
-- não sobrevive à negação. Por isso toda negação ALSO produz (a) um RAISE WARNING, que vai para o
-- log do servidor (fora da transação), e (b) nextval() numa sequência dedicada — sequências são
-- não transacionais no PostgreSQL, logo o contador persiste mesmo após o rollback. Juntos eles
-- são a evidência durável da tentativa; a linha em audit_logs registra a intenção e será persistida
-- apenas se o chamador confirmar a transação sem a exceção (o que não acontece na negação).
create sequence if not exists hattz_audit.official_identity_denial_seq;

grant usage on schema hattz_audit to postgres, service_role;
grant usage on sequence hattz_audit.official_identity_denial_seq to postgres, service_role;
grant select on table hattz_audit.audit_logs to postgres, service_role;
grant insert (actor_type, actor_id, action, resource_type, resource_id, reason, result, metadata)
  on table hattz_audit.audit_logs to postgres, service_role;

drop policy if exists official_identity_audit_insert on hattz_audit.audit_logs;
create policy official_identity_audit_insert
on hattz_audit.audit_logs
for insert
to postgres, service_role
with check (true);

drop policy if exists official_identity_audit_read on hattz_audit.audit_logs;
create policy official_identity_audit_read
on hattz_audit.audit_logs
for select
to postgres, service_role
using (true);

-- Sincronização bidirecional: a coluna em profiles e o registro em hattz_admin não podem divergir.
create or replace function public.enforce_official_identity_registry()
returns trigger
language plpgsql
set search_path = pg_catalog, public, hattz_admin
as $$
declare
  v_status text;
  v_profile_id uuid;
begin
  if tg_op = 'DELETE' then
    return old;
  end if;

  if new.official_code is null then
    if exists (
      select 1 from hattz_admin.official_code_registry r
      where r.profile_id = new.id
    ) then
      raise exception '0016: official identity cannot be unlinked by a common operation.';
    end if;
    return new;
  end if;

  select r.status, r.profile_id into v_status, v_profile_id
  from hattz_admin.official_code_registry r
  where r.official_code = new.official_code;

  if not found then
    raise exception '0016: official_code is not registered.';
  end if;
  if v_profile_id is distinct from new.id then
    raise exception '0016: official_code belongs to another profile.';
  end if;
  if v_status <> 'assigned' then
    raise exception
      '0016: official_code assignment requires the trusted administrative procedure, which is not provisioned in this phase.';
  end if;

  return new;
end
$$;

-- Proteção estrita: nega e audita criação, transferência, desvinculação, mudança de flag e exclusão.
create or replace function public.enforce_official_identity_protection()
returns trigger
language plpgsql
set search_path = pg_catalog, public, hattz_admin, hattz_audit
as $$
declare
  v_profile_id uuid;
  v_old_code text;
  v_new_code text;
  v_old_flag boolean;
  v_new_flag boolean;
  v_old_protected boolean;
  v_new_protected boolean;
  v_reason text;
begin
  if tg_op <> 'DELETE' then
    v_profile_id := new.id;
    v_new_code := new.official_code;
    v_new_flag := new.is_official;
  end if;
  if tg_op <> 'INSERT' then
    v_profile_id := coalesce(v_profile_id, old.id);
    v_old_code := old.official_code;
    v_old_flag := old.is_official;
  end if;

  v_old_protected := tg_op in ('UPDATE', 'DELETE') and (v_old_code is not null or v_old_flag is true);
  v_new_protected := tg_op in ('INSERT', 'UPDATE') and (v_new_code is not null or v_new_flag is true);

  if tg_op = 'DELETE' and v_old_protected then
    v_reason := 'deletion of official profile';
  elsif tg_op = 'INSERT' and v_new_protected then
    v_reason := 'creation of official identity by common operation';
  elsif tg_op = 'UPDATE' and v_old_protected
        and (v_new_code is distinct from v_old_code or v_new_flag is distinct from v_old_flag) then
    v_reason := 'alteration/transfer/unlink of official identity';
  elsif tg_op = 'UPDATE' and not v_old_protected and v_new_protected then
    v_reason := 'common operation attempted to create official identity';
  else
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  insert into hattz_audit.audit_logs
    (actor_type, actor_id, action, resource_type, resource_id, reason, result, metadata)
  values
    ('system', current_user, 'official_identity_protection.denied', 'public.profiles',
     v_profile_id::text, v_reason, 'denied',
     jsonb_build_object(
       'operation', tg_op,
       'old_official_code', v_old_code,
       'new_official_code', v_new_code,
       'old_is_official', v_old_flag,
       'new_is_official', v_new_flag
     ));

  -- Evidência durável (ver nota transacional no topo desta migration).
  perform nextval('hattz_audit.official_identity_denial_seq');
  raise warning '[0016-AUDIT] denied: operation=%, actor=%, profile=%, reason=%',
    tg_op, current_user, v_profile_id, v_reason;

  raise exception '0016: % denied (no trusted administrative exception is provisioned).', v_reason;
end
$$;

revoke all on function public.enforce_official_identity_registry() from public, anon, authenticated;
revoke all on function public.enforce_official_identity_protection() from public, anon, authenticated;
grant execute on function public.enforce_official_identity_registry() to postgres, service_role;
grant execute on function public.enforce_official_identity_protection() to postgres, service_role;

drop trigger if exists trg_official_identity_protection on public.profiles;
create trigger trg_official_identity_protection
before insert or update or delete on public.profiles
for each row execute function public.enforce_official_identity_protection();

drop trigger if exists trg_official_identity_registry on public.profiles;
create trigger trg_official_identity_registry
before insert or update of official_code, id on public.profiles
for each row execute function public.enforce_official_identity_registry();

-- O próprio registro also cannot be transferido, desvinculado ou renomeado por escrita alternativa.
create or replace function public.enforce_official_registry_identity()
returns trigger
language plpgsql
set search_path = pg_catalog, public, hattz_admin, hattz_audit
as $$
begin
  insert into hattz_audit.audit_logs
    (actor_type, actor_id, action, resource_type, resource_id, reason, result, metadata)
  values
    ('system', current_user, 'official_identity_registry.protected', 'hattz_admin.official_code_registry',
     old.official_code, 'registry identity change attempt', 'denied',
     jsonb_build_object(
       'old_profile_id', old.profile_id,
       'new_profile_id', new.profile_id,
       'old_status', old.status,
       'new_status', new.status,
       'old_code', old.official_code,
       'new_code', new.official_code
     ));

  -- Evidência durável (ver nota transacional no topo desta migration).
  perform nextval('hattz_audit.official_identity_denial_seq');
  raise warning '[0016-AUDIT] denied: registry identity change, actor=%, code=%',
    current_user, old.official_code;

  raise exception '0016: official registry identity change is denied (no trusted administrative exception is provisioned).';
end
$$;

revoke all on function public.enforce_official_registry_identity() from public, anon, authenticated;
grant execute on function public.enforce_official_registry_identity() to postgres, service_role;

drop trigger if exists trg_official_registry_identity on hattz_admin.official_code_registry;
create trigger trg_official_registry_identity
before update of official_code, profile_id, status on hattz_admin.official_code_registry
for each row execute function public.enforce_official_registry_identity();

commit;
