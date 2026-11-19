-- 0013_slug_current_per_profile.sql
-- Implementa a regra "cada perfil pode possuir somente UM slug atual" (regra 1 das regras de slug
-- aprovadas), por índice único PARCIAL em `(profile_id) WHERE is_current = true`.
--
-- Contexto (investigação `sql/72_slug_integrity.sql`):
--   * A unicidade GLOBAL do slug atual (case-insensitive) já é garantida por
--     `ux_profile_slugs_slug_current ON (lower(slug)) WHERE is_current = true` (0002).
--   * NÃO existia restrição de "um único slug atual por perfil".
--
-- Escopo deliberadamente mínimo:
--   * implementa APENAS a regra 1 (um slug atual por perfil), que é consequência técnica
--     inequívoca do endereço público único e estável;
--   * NÃO implementa política de slugs históricos (regra 2), proteção de slugs `reserved`
--     (regra 4) nem algoritmo de normalização de entrada (regra 8) — essas dependem de decisão
--     de negócio do Owner e permanecem pendentes (ver relatório técnico).
--   * NÃO altera `anon`/`authenticated`, policies, RLS, triggers ou grants.
--
-- A troca de slug permanece uma operação de aplicação que DEVE ocorrer em uma única transação;
-- o índice parcial garante que o estado final nunca tenha dois slugs atuais para o mesmo perfil
-- (colisão simultânea é rejeitada pela própria unicidade do índice).
--
-- Idempotência: verificação por DEFINIÇÃO (não por nome) e `create unique index if not exists`.
-- Pré-checagem diagnóstica: em banco com dados, falha com mensagem clara se já houver perfil com
-- mais de um slug atual (a migration inteira roda em uma transação; o `raise exception` reverte
-- qualquer DDL parcial, nada fica meio-aplicado).

begin;

-- Pré-checagem diagnóstica.
do $$
declare
  dup_profiles bigint;
begin
  select count(*) into dup_profiles
  from (
    select profile_id
    from public.profile_slugs
    where is_current = true
    group by profile_id
    having count(*) > 1
  ) d;

  if dup_profiles > 0 then
    raise exception
      'Nao e possivel aplicar a regra "um slug atual por perfil" (0013): % perfil(is) com mais de um slug atual. Corrija os dados (mantenha apenas um is_current = true por perfil) antes de aplicar esta migration.',
      dup_profiles;
  end if;
end;
$$;

-- Índice único parcial: no maximo um slug atual por perfil.
-- Idempotente e verificado por definicao via `if not exists` (nome canonico).
create unique index if not exists ux_profile_slugs_current_per_profile
  on public.profile_slugs (profile_id)
  where is_current = true;

comment on index public.ux_profile_slugs_current_per_profile is
  'Regra 1 (0013): cada perfil pode ter no maximo um slug atual (is_current = true).';

commit;
