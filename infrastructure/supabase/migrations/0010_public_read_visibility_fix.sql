-- 0010_public_read_visibility_fix.sql
-- Correção da recursão infinita de RLS entre as policies públicas de
-- profile_public_snapshots (P1) e profile_publications (P2) definidas em 0008.
--
-- Estratégia A1-ii (sem SECURITY DEFINER / sem bypass de RLS):
-- materializar o predicado combinado
--   "state = 'published' AND snapshot.visibility = 'public'"
-- em uma coluna derivada autoritativa em public.profile_publications
-- (is_publicly_visible), mantida por triggers. As policies passam a ser acíclicas:
--   P2 (profile_publications)     -> USING (is_publicly_visible)  [autossuficiente]
--   P1 (profile_public_snapshots) -> visibility='public' AND EXISTS(publicação visível)
--   P3 (profile_slugs)            -> is_current AND EXISTS(snapshot público publicado)
--   P4/P5 (mídia)                 -> inalteradas (sem ciclo)
--
-- Garantias: sem SECURITY DEFINER, sem BYPASSRLS, sem novos papéis privilegiados,
-- sem novos privilégios públicos além dos estritamente necessários. Não reescreve
-- migrations anteriores; apenas substitui as policies afetadas via DROP/CREATE.
-- FORCE ROW LEVEL SECURITY, grants mínimos e isolamento admin/audit preservados.

begin;

-- 1) Coluna derivada autoritativa (nunca escrita por clientes públicos)
alter table public.profile_publications
  add column if not exists is_publicly_visible boolean not null default false;

comment on column public.profile_publications.is_publicly_visible is
  'Derivada: (state = ''published'') AND EXISTS(snapshot com visibility = ''public''). Mantida por trigger; não escrita por clientes.';

-- 2) Backfill transacional dos registros existentes
update public.profile_publications p
   set is_publicly_visible = (p.state = 'published') and exists (
     select 1 from public.profile_public_snapshots s
     where s.publication_id = p.id and s.visibility = 'public');

-- 3) Função/trigger: recomputa a flag na própria linha da publicação (BEFORE).
--    Dispara em QUALQUER INSERT/UPDATE (não apenas em `state`): assim a coluna derivada
--    permanece autoritativa mesmo que um escritor confiável tente gravá-la diretamente —
--    o valor informado é sempre sobrescrito pelo predicado. Sem recursão (trigger BEFORE
--    apenas reescreve NEW; não executa outro UPDATE).
create or replace function public.sync_publication_visibility()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.is_publicly_visible := (new.state = 'published') and exists (
    select 1 from public.profile_public_snapshots s
    where s.publication_id = new.id and s.visibility = 'public');
  return new;
end;
$$;

drop trigger if exists trg_sync_publication_visibility on public.profile_publications;
create trigger trg_sync_publication_visibility
before insert or update on public.profile_publications
for each row execute function public.sync_publication_visibility();

-- 4) Função/trigger: propaga mudanças de snapshot para a(s) publicação(ões)-pai (AFTER)
--    Cobre INSERT, UPDATE de visibility, UPDATE de publication_id (recalcula origem e destino)
--    e DELETE. Usa lock determinístico (ordem por id) para evitar write-skew e deadlocks.
create or replace function public.sync_snapshot_parent_visibility()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_old uuid;
  v_new uuid;
begin
  if tg_op = 'DELETE' then
    v_old := old.publication_id;
  elsif tg_op = 'UPDATE' then
    v_old := old.publication_id;
    v_new := new.publication_id;
  else
    v_new := new.publication_id;
  end if;

  -- Lock determinístico das publicações envolvidas (ordem crescente por id).
  perform 1
    from public.profile_publications p
   where p.id in (v_old, v_new)
   order by p.id
     for update;

  if v_old is not null and (v_new is null or v_old <> v_new) then
    update public.profile_publications p
       set is_publicly_visible = (p.state = 'published') and exists (
         select 1 from public.profile_public_snapshots s
         where s.publication_id = p.id and s.visibility = 'public')
     where p.id = v_old;
  end if;

  if v_new is not null then
    update public.profile_publications p
       set is_publicly_visible = (p.state = 'published') and exists (
         select 1 from public.profile_public_snapshots s
         where s.publication_id = p.id and s.visibility = 'public')
     where p.id = v_new;
  end if;

  return null;
end;
$$;

drop trigger if exists trg_sync_snapshot_parent_visibility on public.profile_public_snapshots;
create trigger trg_sync_snapshot_parent_visibility
after insert or update of visibility, publication_id or delete on public.profile_public_snapshots
for each row execute function public.sync_snapshot_parent_visibility();

-- Privilégios mínimos das funções de trigger (search_path fixo; sem SECURITY DEFINER).
revoke all on function public.sync_publication_visibility() from public, anon, authenticated;
revoke all on function public.sync_snapshot_parent_visibility() from public, anon, authenticated;
grant execute on function public.sync_publication_visibility() to postgres, service_role;
grant execute on function public.sync_snapshot_parent_visibility() to postgres, service_role;

-- 4b) Grant SELECT estritamente necessário da coluna derivada.
--     Justificativa comprovada em runtime (rodada 3): as policies P1 e P3 avaliam
--     `pub.is_publicly_visible` dentro de uma SUBQUERY sobre outra relação
--     (profile_public_snapshots/profile_slugs -> profile_publications). Ao contrário do qual
--     na mesma tabela (P2), referências a colunas de outra relação dentro da expressão da policy
--     SÃO submetidas à verificação de privilégio de coluna; sem este grant, a leitura via view
--     pública e as leituras diretas de snapshots/slugs falham com
--     "permission denied for table profile_publications".
--     A coluna é derivada e não sensível (state já é legível; o flag é exatamente o predicado de
--     visibilidade pública), portanto não amplia a exposição. Apenas SELECT, apenas coluna,
--     apenas anon/authenticated. Nenhum privilégio de escrita é concedido.
grant select (is_publicly_visible) on public.profile_publications to anon, authenticated;

-- 5) Policies públicas acíclicas (substituem as de 0008; semântica de publicação preservada).
--    P2: autossuficiente (sem referência a snapshots) -> quebra o ciclo P1<->P2.
drop policy if exists share_select_published_publications on public.profile_publications;
create policy share_select_published_publications
on public.profile_publications
for select
to anon, authenticated
using (is_publicly_visible);

--    P1: exige snapshot público E publicação visível (depende de P2, que é autossuficiente).
drop policy if exists share_select_public_snapshots on public.profile_public_snapshots;
create policy share_select_public_snapshots
on public.profile_public_snapshots
for select
to anon, authenticated
using (
  visibility = 'public'
  and exists (
    select 1
    from public.profile_publications pub
    where pub.id = profile_public_snapshots.publication_id
      and pub.is_publicly_visible
  )
);

--    P3: slug atual vinculado a snapshot público de publicação visível (sem ciclo).
drop policy if exists share_select_current_public_slugs on public.profile_slugs;
create policy share_select_current_public_slugs
on public.profile_slugs
for select
to anon, authenticated
using (
  is_current = true
  and exists (
    select 1
    from public.profile_public_snapshots s
    join public.profile_publications pub on pub.id = s.publication_id
    where s.profile_id = profile_slugs.profile_id
      and s.visibility = 'public'
      and pub.is_publicly_visible
  )
);

--    P4/P5 (media_assets/media_variants) permanecem inalteradas (já acíclicas).

commit;
