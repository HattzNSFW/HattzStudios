-- 0012_trusted_writer_grants.sql
-- Provisiona os privilégios MÍNIMOS do escritor confiável server-side (papel `service_role`)
-- necessários para que as triggers SECURITY INVOKER da 0010 (e a validação da 0009) funcionem
-- no ambiente real — sem `SECURITY DEFINER`, sem `BYPASSRLS` e sem novos privilégios públicos.
--
-- Contexto: a 0010 materializa `profile_publications.is_publicly_visible` por triggers
-- SECURITY INVOKER. A rodada de investigação (harness `sql/80_trusted_writer_privileges.sql`)
-- provou o conjunto mínimo de privilégios do INVOCADOR:
--   * BEFORE `sync_publication_visibility` (em profile_publications): precisa de
--     `SELECT` em `profile_public_snapshots` (colunas `publication_id`, `visibility`) e
--     SOMENTE quando `state -> 'published'` (o predicado é `(state='published') AND EXISTS(...)`,
--     com curto-circuito do `AND`).
--   * AFTER `sync_snapshot_parent_visibility` (em profile_public_snapshots): precisa de
--     `SELECT` em `profile_publications` (colunas `id`, `state`, para o `SELECT ... FOR UPDATE`
--     e para o predicado) e `UPDATE` em `profile_publications.is_publicly_visible`.
-- Além disso, o escritor precisa dos seus próprios DML nas duas tabelas que ele mantém.
--
-- Decisão de escopo: privilégios POR COLUNA sempre que a granularidade por coluna existe
-- (SELECT/INSERT/UPDATE). `DELETE` não tem granularidade por coluna no PostgreSQL e é concedido
-- no nível da tabela. Nenhum privilégio de tabela inteira é concedido onde coluna basta.
--
-- O papel `service_role` é pré-existente (Supabase server-side; no harness local é um stand-in
-- com BYPASSRLS). Esta migration NÃO cria papéis e NÃO altera `anon`/`authenticated`. Se o papel
-- não existir no ambiente, os grants são apenas registrados como não aplicáveis (NOTICE) em vez
-- de quebrar a reconstrução limpa.
--
-- Idempotência: GRANT é idempotente por natureza; reaplicar a migration não altera o resultado.
-- Nenhuma migration anterior é reescrita.

begin;

do $mig$
begin
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    raise notice
      '0012: papel service_role ausente; grants do escritor confiavel nao aplicados (ambiente sem Supabase). Nenhuma mudanca feita.';
    return;
  end if;

  -- Schema: o escritor precisa de USAGE em public para tocar as tabelas.
  execute $g$grant usage on schema public to service_role$g$;

  -- profile_publications: SELECT das colunas lidas pelo trigger/writer; INSERT/UPDATE das
  -- colunas dos caminhos de escrita (criar/atualizar/publicar/despublicar); DELETE no nível da tabela.
  execute $g$grant select (id, profile_id, version, state, published_at, unpublished_at, is_publicly_visible)
    on public.profile_publications to service_role$g$;
  execute $g$grant insert (id, profile_id, version, state, manifest_hash, manifest_ref, published_at, unpublished_at, failure_reason)
    on public.profile_publications to service_role$g$;
  execute $g$grant update (profile_id, version, state, manifest_hash, manifest_ref, published_at, unpublished_at, failure_reason, is_publicly_visible)
    on public.profile_publications to service_role$g$;
  execute $g$grant delete on public.profile_publications to service_role$g$;

  -- profile_public_snapshots: SELECT das colunas lidas pelo trigger/writer; INSERT/UPDATE das
  -- colunas do snapshot (criar/atualizar visibilidade/conteudo/mover publication_id); DELETE por tabela.
  execute $g$grant select (id, publication_id, profile_id, version, visibility, seo_title, seo_description, og_image_asset_id, content)
    on public.profile_public_snapshots to service_role$g$;
  execute $g$grant insert (id, publication_id, profile_id, version, visibility, seo_title, seo_description, og_image_asset_id, content)
    on public.profile_public_snapshots to service_role$g$;
  execute $g$grant update (publication_id, profile_id, version, visibility, seo_title, seo_description, og_image_asset_id, content)
    on public.profile_public_snapshots to service_role$g$;
  execute $g$grant delete on public.profile_public_snapshots to service_role$g$;
end
$mig$;

comment on column public.profile_publications.is_publicly_visible is
  'Derivada: (state = ''published'') AND EXISTS(snapshot com visibility = ''public''). Mantida por trigger SECURITY INVOKER; o escritor confiavel (service_role) recebe UPDATE nesta coluna apenas porque o trigger AFTER a recalcula (0012).';

commit;
